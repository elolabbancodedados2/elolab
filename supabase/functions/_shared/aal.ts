// Exigência de MFA (AAL2) nas edge functions que escrevem com service_role.
//
// A migration 20261029110000_mfa_obrigatorio_servidor.sql exige AAL2 por
// trigger, mas as funções que usam service_role não passam por ela (não há
// usuário no JWT do service). Aqui a mesma regra de public.mfa_satisfeito() é
// aplicada ao JWT de quem chamou:
//   - sessão AAL2: permitido;
//   - conta com fator verificado em AAL1: negado;
//   - política ligada e perfil sensível (plataforma, admin ou financeiro) sem
//     fator: negado;
//   - demais casos: permitido.
//
// Chame só depois de auth.getUser ter validado o token: a assinatura do JWT
// não é conferida aqui, apenas o claim `aal` é lido.

export const CODIGO_MFA = 'mfa_necessario';
export const MENSAGEM_MFA = 'Confirme o segundo fator de autenticação para realizar esta operação.';

export type MotivoMfa = 'fator_em_aal1' | 'cadastro_obrigatorio' | 'falha_verificacao';
export type ResultadoMfa = { permitido: true } | { permitido: false; motivo: MotivoMfa };

export interface UsuarioMfa {
  id: string;
  factors?: Array<{ status?: string | null }> | null;
}

// Cliente mínimo, para permitir testes sem rede.
// deno-lint-ignore no-explicit-any
type ServiceClient = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Lê o claim `aal` do bearer. Token malformado vira null (tratado como AAL1). */
export function aalDoBearer(authorization: string | null | undefined): string | null {
  const token = String(authorization ?? '').replace(/^Bearer\s+/i, '').trim();
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')));
    return typeof claims?.aal === 'string' ? claims.aal : null;
  } catch {
    return null;
  }
}

/** Mesma decisão de public.mfa_satisfeito(), sem acesso a banco. */
export function avaliarMfa(entrada: {
  aal: string | null;
  fatorVerificado: boolean;
  politicaLigada: boolean;
  perfilSensivel: boolean;
}): ResultadoMfa {
  if (entrada.aal === 'aal2') return { permitido: true };
  if (entrada.fatorVerificado) return { permitido: false, motivo: 'fator_em_aal1' };
  if (entrada.politicaLigada && entrada.perfilSensivel) {
    return { permitido: false, motivo: 'cadastro_obrigatorio' };
  }
  return { permitido: true };
}

async function temFatorVerificado(service: ServiceClient, usuario: UsuarioMfa): Promise<boolean> {
  if (Array.isArray(usuario.factors)) {
    return usuario.factors.some((f) => f?.status === 'verified');
  }
  // O GoTrue costuma devolver `factors` no getUser; se não vier, pergunta direto.
  const { data, error } = await service.auth.admin.mfa.listFactors({ userId: usuario.id });
  if (error) throw new Error('mfa_factors_indisponivel');
  return (data?.factors ?? []).some((f: { status?: string }) => f?.status === 'verified');
}

/** Tabela ausente (migration ainda não aplicada) equivale à política desligada. */
async function politicaLigada(service: ServiceClient): Promise<boolean> {
  const { data, error } = await service
    .from('politica_mfa')
    .select('exigir_perfis_privilegiados')
    .eq('id', true)
    .maybeSingle();
  if (error) {
    const tabelaAusente = error.code === '42P01' || error.code === 'PGRST205';
    if (tabelaAusente) return false;
    throw new Error('politica_mfa_indisponivel');
  }
  return data?.exigir_perfis_privilegiados === true;
}

/** Plataforma ativa ou papel admin/financeiro, como public.perfil_exige_mfa(). */
export async function perfilExigeMfa(service: ServiceClient, userId: string): Promise<boolean> {
  const [plataforma, papeis] = await Promise.all([
    service.from('platform_admins').select('user_id').eq('user_id', userId).eq('ativo', true).maybeSingle(),
    service.from('user_roles').select('role').eq('user_id', userId).in('role', ['admin', 'financeiro']),
  ]);
  if (plataforma.error || papeis.error) throw new Error('perfil_indisponivel');
  return !!plataforma.data || (papeis.data ?? []).length > 0;
}

/**
 * Decide se quem chamou pode seguir. `perfilSensivel` pode ser um booleano já
 * conhecido pela função (ex.: o chamador acabou de ser confirmado como admin)
 * ou uma função consultada só quando a política estiver ligada.
 * Falha ao consultar fator, política ou perfil nega (fail closed).
 */
export async function verificarMfa(
  service: ServiceClient,
  authorization: string | null | undefined,
  usuario: UsuarioMfa,
  perfilSensivel: boolean | (() => Promise<boolean>),
): Promise<ResultadoMfa> {
  const aal = aalDoBearer(authorization);
  if (aal === 'aal2') return { permitido: true };
  try {
    const fatorVerificado = await temFatorVerificado(service, usuario);
    if (fatorVerificado) return avaliarMfa({ aal, fatorVerificado, politicaLigada: false, perfilSensivel: false });
    const ligada = await politicaLigada(service);
    if (!ligada) return { permitido: true };
    const sensivel = typeof perfilSensivel === 'function' ? await perfilSensivel() : perfilSensivel;
    return avaliarMfa({ aal, fatorVerificado, politicaLigada: ligada, perfilSensivel: sensivel });
  } catch (e) {
    console.error('verificarMfa:', e instanceof Error ? e.message : 'erro');
    return { permitido: false, motivo: 'falha_verificacao' };
  }
}

/**
 * Resposta padronizada para uma negação. 403 com o mesmo código do HINT do
 * banco; falha ao verificar vira 503, para não pedir um fator que a pessoa já
 * confirmou.
 */
export function respostaMfaNecessaria(
  headers: Record<string, string>,
  motivo: MotivoMfa,
  extras: Record<string, unknown> = {},
): Response {
  const indisponivel = motivo === 'falha_verificacao';
  const corpo = indisponivel
    ? { ...extras, error: 'Não foi possível confirmar a verificação em duas etapas. Tente novamente em instantes.', code: 'mfa_indisponivel' }
    : { ...extras, error: MENSAGEM_MFA, code: CODIGO_MFA };
  return new Response(JSON.stringify(corpo), {
    status: indisponivel ? 503 : 403,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}
