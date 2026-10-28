/**
 * Autenticação do portal do paciente e vínculo titular → dependente.
 * Dependentes estão desligados até existir vínculo explícito (CLIN-QA-512).
 *
 * Fica fora de index.ts para ser testada sem banco (acessoPortal_test.ts).
 */

/**
 * Colunas do paciente que o portal devolve ao próprio paciente. `ativo` entra
 * para o index.ts recusar o token de um cadastro inativado.
 */
export const COLUNAS_PERFIL_PORTAL =
  'id, nome, email, telefone, foto_url, cpf, data_nascimento, sexo, alergias, observacoes, clinica_id, ativo';

/** Todo segredo emitido é `encode(gen_random_bytes(32), 'hex')`: 64 caracteres hexadecimais. */
const FORMATO_TOKEN = /^[0-9a-f]{64}$/;

/** Idade a partir da qual o vínculo de dependente deixa de valer no portal. */
export const MAIORIDADE_ANOS = 18;

// Cliente do supabase-js (service role) ou o banco falso dos testes.
/* eslint-disable @typescript-eslint/no-explicit-any */
// deno-lint-ignore no-explicit-any
type DbPortal = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Linha de paciente_portal_tokens com o perfil do titular embutido. */
export type TokenPortal = {
  id: string;
  paciente_id: string;
  clinica_id: string;
  pacientes: ({ id: string; cpf: string | null; clinica_id: string } & Record<string, unknown>) | null;
} & Record<string, unknown>;

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Procura o token do portal comparando somente o hash SHA-256 do valor recebido.
 *
 * SEC-R1-06: havia um segundo SELECT com o valor recebido sem hash, para os
 * tokens anteriores a 20260817310000_hash_tokens_portal_paciente.sql. Como a
 * coluna guarda hashes, quem lesse a coluna (equipe com can_manage_data, backup,
 * dump) entrava no portal enviando o próprio hash. O ramo foi removido em vez de
 * restringido: os tokens legados também eram 64 caracteres hexadecimais, então
 * não há formato que distinga um token legado de um hash guardado.
 *
 * Devolve `null` para qualquer falha (formato, ausência, erro de banco), para o
 * chamador responder 401 sem diferenciar os casos.
 */
export async function buscarTokenPortal(db: DbPortal, tokenRecebido: unknown, agora: Date = new Date()): Promise<TokenPortal | null> {
  const token = typeof tokenRecebido === 'string' ? tokenRecebido.trim().toLowerCase() : '';
  if (!FORMATO_TOKEN.test(token)) return null;
  const { data, error } = await db
    .from('paciente_portal_tokens')
    .select(`*, pacientes(${COLUNAS_PERFIL_PORTAL})`)
    .eq('token', await sha256Hex(token))
    .eq('ativo', true)
    .gte('expires_at', agora.toISOString())
    .maybeSingle();
  if (error || !data) return null;
  return data as TokenPortal;
}

export type TitularPortal = { id: string; clinica_id: string };

/**
 * Vínculo explícito titular → dependente, confirmado pela recepção com
 * documento conferido. Este é o formato que o portal vai exigir quando o
 * modelo existir no banco (CLIN-QA-512, item 3 da proposta; ainda sem
 * migration). Nenhum campo vem do texto `cpf_responsavel`.
 */
export type VinculoDependente = {
  dependente_id: string;
  responsavel_paciente_id: string;
  clinica_id: string;
  nome: string;
  data_nascimento: string | null;
  confirmado_em: string | null;
  confirmado_por: string | null;
  revogado_em?: string | null;
  expira_em?: string | null;
};

/** Idade completa em anos na data `hoje` ("YYYY-MM-DD"); `null` se a data de nascimento for inválida. */
export function idadeEmAnos(dataNascimento: string | null, hoje: string): number | null {
  const n = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dataNascimento ?? ''));
  const h = /^(\d{4})-(\d{2})-(\d{2})/.exec(hoje);
  if (!n || !h) return null;
  const [an, mn, dn] = n.slice(1).map(Number);
  const [ah, mh, dh] = h.slice(1).map(Number);
  if (an > ah || (an === ah && (mn > mh || (mn === mh && dn > dh)))) return null;
  let idade = ah - an;
  if (mh < mn || (mh === mn && dh < dn)) idade -= 1;
  return idade;
}

/**
 * CLIN-QA-512: um dependente só vale com vínculo explícito e confirmado.
 * Todas as condições precisam ser verdadeiras; na dúvida, recusa:
 * - o vínculo aponta para este titular e para a clínica do token;
 * - o dependente não é o próprio titular;
 * - houve confirmação (data e autor) e o vínculo não foi revogado nem expirou;
 * - o dependente é menor de idade, com data de nascimento válida (a regra dos
 *   18 anos continua, mesmo com vínculo confirmado; exceções como curatela
 *   dependem de parecer do DPO).
 */
export function filtrarDependentesElegiveis(
  titular: TitularPortal,
  vinculos: VinculoDependente[],
  hoje: string,
): { id: string; nome: string }[] {
  const vistos = new Set<string>();
  const elegiveis: { id: string; nome: string }[] = [];
  for (const v of vinculos) {
    if (!v.dependente_id || v.dependente_id === titular.id) continue;
    if (v.responsavel_paciente_id !== titular.id) continue;
    if (!titular.clinica_id || v.clinica_id !== titular.clinica_id) continue;
    if (!v.confirmado_em || !v.confirmado_por) continue;
    if (v.revogado_em) continue;
    if (v.expira_em && String(v.expira_em).slice(0, 10) <= hoje) continue;
    const idade = idadeEmAnos(v.data_nascimento, hoje);
    if (idade === null || idade >= MAIORIDADE_ANOS) continue;
    if (vistos.has(v.dependente_id)) continue;
    vistos.add(v.dependente_id);
    elegiveis.push({ id: v.dependente_id, nome: v.nome });
  }
  return elegiveis;
}

/**
 * Pacientes da mesma clínica que o titular pode acessar como responsável.
 *
 * CLIN-QA-512, contenção (CA0): o banco ainda não tem vínculo explícito, só o
 * texto `cpf_responsavel`, que qualquer pessoa sem sessão consegue usar a
 * partir de um cadastro criado pelo agendamento público
 * (docs/seguranca/auditoria-rodada-2.md, seção 2.2). Por isso esta função não
 * consulta `cpf_responsavel` e devolve lista vazia. Quando a tabela de vínculo
 * confirmado existir, a consulta entra aqui e passa por
 * `filtrarDependentesElegiveis`.
 */
export function dependentesDoTitular(
  _db: DbPortal,
  _titular: TitularPortal,
  _hoje: string,
): Promise<{ id: string; nome: string }[]> {
  return Promise.resolve([]);
}

/** Erro devolvido pelo portal quando a sessão tenta agir por outro paciente. */
export const ERRO_DEPENDENTE_NAO_AUTORIZADO = {
  error: 'Acesso a dependente não autorizado. Procure a recepção da clínica para confirmar o vínculo.',
  code: 'dependent_not_authorized',
} as const;

/** Ações que só o titular pode executar, mesmo com um dependente ativo. */
export const ACOES_SO_DO_TITULAR = new Set(['update_contact']);

/**
 * Decide para qual paciente a sessão age.
 * Sem `dependente_id` (ou com o próprio titular), a sessão é do titular.
 * Qualquer outro id só passa se estiver na lista de dependentes elegíveis.
 */
export function resolverPacienteDaSessao(
  titularId: string,
  dependenteIdRecebido: unknown,
  dependentesPermitidos: { id: string }[],
): { ok: true; pacienteId: string; comoDependente: boolean } | { ok: false } {
  if (dependenteIdRecebido === undefined || dependenteIdRecebido === null || dependenteIdRecebido === '') {
    return { ok: true, pacienteId: titularId, comoDependente: false };
  }
  if (typeof dependenteIdRecebido !== 'string') return { ok: false };
  if (dependenteIdRecebido === titularId) return { ok: true, pacienteId: titularId, comoDependente: false };
  if (!dependentesPermitidos.some((d) => d.id === dependenteIdRecebido)) return { ok: false };
  return { ok: true, pacienteId: dependenteIdRecebido, comoDependente: true };
}

/** `true` quando a ação precisa ser recusada porque a sessão não está no titular. */
export function acaoExigeTitular(action: unknown, pacienteId: string, titularId: string): boolean {
  return ACOES_SO_DO_TITULAR.has(String(action)) && pacienteId !== titularId;
}
