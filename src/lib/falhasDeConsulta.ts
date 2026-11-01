/**
 * Classificação das falhas de consultas e mutações do React Query.
 *
 * - Falha de sessão (JWT expirado/inválido, 401): não adianta repetir a mesma
 *   chamada; primeiro tenta renovar a sessão e, se não der, encerra a sessão
 *   local para a rota protegida levar a pessoa a /auth guardando a página.
 * - Falha de permissão ou de requisição (403, 42501, outros 4xx): repetir só
 *   atrasa a mensagem de erro, então não há nova tentativa.
 * - Demais falhas (rede, 5xx, timeout): mantêm uma nova tentativa.
 */

type ErroDesconhecido = {
  code?: unknown;
  status?: unknown;
  message?: unknown;
  context?: { status?: unknown } | null;
} | null | undefined;

function statusDe(erro: ErroDesconhecido): number | null {
  const status = typeof erro?.status === 'number' ? erro.status : typeof erro?.context?.status === 'number' ? erro.context.status : null;
  return status;
}

function mensagemDe(erro: ErroDesconhecido): string {
  return typeof erro?.message === 'string' ? erro.message : '';
}

export function ehFalhaDeSessao(error: unknown): boolean {
  const erro = error as ErroDesconhecido;
  if (!erro || typeof erro !== 'object') return false;
  const code = typeof erro.code === 'string' ? erro.code : '';
  if (/^PGRST30\d$/.test(code)) return true;
  if (statusDe(erro) === 401) return true;
  return /jwt expired|invalid jwt|jwt.*(expired|malformed|invalid)|invalid refresh token|refresh token not found/i.test(mensagemDe(erro));
}

export function ehFalhaDePermissaoOuRequisicao(error: unknown): boolean {
  const erro = error as ErroDesconhecido;
  if (!erro || typeof erro !== 'object') return false;
  const code = typeof erro.code === 'string' ? erro.code : '';
  if (code === '42501') return true;
  // Códigos PGRST1xx/2xx são erros da própria requisição (filtro, coluna...).
  if (/^PGRST[12]\d\d$/.test(code)) return true;
  // Classe 22 (dado inválido) e 23 (restrição) do Postgres também não mudam ao repetir.
  if (/^2[23][0-9A-Z]{3}$/.test(code)) return true;
  const status = statusDe(erro);
  if (status !== null && status >= 400 && status < 500 && status !== 408 && status !== 429) return true;
  return /permission denied|row-level security/i.test(mensagemDe(erro));
}

/** Política de nova tentativa das consultas: no máximo uma, e só para falhas transitórias. */
export function deveRepetirConsulta(failureCount: number, error: unknown): boolean {
  if (ehFalhaDeSessao(error) || ehFalhaDePermissaoOuRequisicao(error)) return false;
  return failureCount < 1;
}

export interface DependenciasSessao {
  /** Há sessão salva neste navegador? Páginas públicas (portal, agendamento) não têm. */
  temSessao: () => Promise<boolean>;
  renovarSessao: () => Promise<{ ok: boolean }>;
  encerrarSessaoLocal: () => Promise<void>;
  avisarSessaoExpirada: () => void;
}

export type ResultadoSessao = 'renovada' | 'encerrada' | 'sem-sessao';

/**
 * Cria o tratador de sessão expirada. Várias consultas falham juntas quando o
 * token vence; todas compartilham a mesma renovação em andamento.
 * - 'renovada': vale repetir a chamada;
 * - 'encerrada': a sessão local foi encerrada e a pessoa vai para /auth;
 * - 'sem-sessao': não havia sessão (página pública); trate como erro comum.
 */
export function criarTratadorSessaoExpirada(deps: DependenciasSessao) {
  let emAndamento: Promise<ResultadoSessao> | null = null;
  return function tratarSessaoExpirada(): Promise<ResultadoSessao> {
    if (emAndamento) return emAndamento;
    emAndamento = (async (): Promise<ResultadoSessao> => {
      try {
        if (!(await deps.temSessao())) return 'sem-sessao';
      } catch {
        return 'sem-sessao';
      }
      try {
        const { ok } = await deps.renovarSessao();
        if (ok) return 'renovada';
      } catch { /* cai para o encerramento local */ }
      deps.avisarSessaoExpirada();
      try {
        await deps.encerrarSessaoLocal();
      } catch { /* o listener de autenticação ainda limpa o estado */ }
      return 'encerrada';
    })().finally(() => {
      // Libera para uma próxima expiração (ex.: horas depois).
      setTimeout(() => { emAndamento = null; }, 0);
    });
    return emAndamento;
  };
}
