/**
 * Identificação do paciente nos canais públicos (link de agendamento e
 * WhatsApp). CLIN-QA-003.
 *
 * Um único dado não identifica ninguém: CPF digitado errado, telefone
 * reaproveitado ou cadastro duplicado levavam a consulta para o prontuário de
 * outra pessoa. A regra aqui é CPF + data de nascimento, e só existe vínculo
 * quando há exatamente um cadastro da clínica com aquele CPF e o nascimento
 * confere. Qualquer outro caso é ambíguo e vai para a recepção.
 *
 * Sem dependência de Deno, para rodar também no vitest.
 */

export interface CandidatoPaciente {
  id: string;
  data_nascimento: string | null;
}

export type MotivoPendencia =
  | 'nascimento_divergente'
  | 'nascimento_ausente_no_cadastro'
  | 'cpf_duplicado';

export type DecisaoVinculo =
  | { tipo: 'novo' }
  | { tipo: 'vinculado'; pacienteId: string }
  | { tipo: 'pendente'; motivo: MotivoPendencia };

/** Texto para a recepção. Nunca devolva isto ao paciente. */
export const DESCRICAO_MOTIVO_PENDENCIA: Record<MotivoPendencia, string> = {
  nascimento_divergente: 'A data de nascimento informada não confere com o cadastro existente para este CPF.',
  nascimento_ausente_no_cadastro: 'O cadastro existente para este CPF não tem data de nascimento para conferir.',
  cpf_duplicado: 'Há mais de um cadastro com este CPF na clínica.',
};

function dataExiste(ano: number, mes: number, dia: number): boolean {
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

/**
 * Aceita `AAAA-MM-DD` (formulário) e `DD/MM/AAAA` (texto digitado no
 * WhatsApp). Devolve `AAAA-MM-DD` ou `null` se a data não existir, for
 * posterior a `hoje` ou anterior a 1900.
 */
export function normalizarDataNascimento(valor: unknown, hoje: string): string | null {
  const texto = String(valor ?? '').trim();
  let ano: number, mes: number, dia: number;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  const br = /^(\d{2})[/.-](\d{2})[/.-](\d{4})$/.exec(texto);
  if (iso) {
    [ano, mes, dia] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else if (br) {
    [dia, mes, ano] = [Number(br[1]), Number(br[2]), Number(br[3])];
  } else {
    return null;
  }
  if (ano < 1900 || !dataExiste(ano, mes, dia)) return null;
  const normalizada = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  return normalizada > hoje ? null : normalizada;
}

/** `data_nascimento` vem do Postgres como `date`, às vezes com hora. */
function somenteData(valor: string | null): string | null {
  if (!valor) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(valor);
  return m ? m[1] : null;
}

export function decidirVinculoPaciente(
  candidatos: CandidatoPaciente[],
  nascimento: string,
): DecisaoVinculo {
  const unicos = [...new Map(candidatos.map((c) => [c.id, c])).values()];
  if (unicos.length === 0) return { tipo: 'novo' };
  if (unicos.length > 1) return { tipo: 'pendente', motivo: 'cpf_duplicado' };
  const [candidato] = unicos;
  const cadastrado = somenteData(candidato.data_nascimento);
  if (!cadastrado) return { tipo: 'pendente', motivo: 'nascimento_ausente_no_cadastro' };
  if (cadastrado !== nascimento) return { tipo: 'pendente', motivo: 'nascimento_divergente' };
  return { tipo: 'vinculado', pacienteId: candidato.id };
}

export const mascararCpf = (d: string) => `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;

/**
 * Todos os cadastros da clínica com este CPF. A consulta direta cobre os dois
 * formatos gravados pelo sistema (com e sem máscara) e devolve todos, para a
 * duplicidade aparecer. A RPC normalizada cobre formatos legados, mas tem
 * `LIMIT 1`, então serve só de reforço.
 */
interface ResultadoDb<T> {
  data: T | null;
  error: unknown;
}

interface ConsultaCandidatos {
  eq(coluna: string, valor: string): ConsultaCandidatos;
  in(coluna: string, valores: string[]): ConsultaCandidatos;
  limit(n: number): PromiseLike<ResultadoDb<CandidatoPaciente[]>>;
  maybeSingle(): PromiseLike<ResultadoDb<CandidatoPaciente>>;
}

/** O mínimo do cliente Supabase que a busca usa; facilita o teste. */
export interface DbIdentificacao {
  from(tabela: 'pacientes'): { select(colunas: string): ConsultaCandidatos };
  rpc(funcao: string, args: Record<string, unknown>): PromiseLike<ResultadoDb<unknown>>;
}

/**
 * `cliente` é o supabase-js (ou o banco falso dos testes). A entrada é `unknown`
 * porque comparar o tipo do SupabaseClient com `DbIdentificacao` estoura o
 * limite de instanciação do TypeScript (TS2589) no `deno check` das funções.
 */
export async function buscarCandidatosPorCpf(cliente: unknown, clinicaId: string, cpfDigitos: string): Promise<CandidatoPaciente[]> {
  const db = cliente as DbIdentificacao;
  const { data: diretos, error } = await db
    .from('pacientes')
    .select('id, data_nascimento')
    .eq('clinica_id', clinicaId)
    .in('cpf', [cpfDigitos, mascararCpf(cpfDigitos)])
    .limit(5);
  if (error) throw error;
  const candidatos: CandidatoPaciente[] = [...(diretos ?? [])];

  const { data: idNormalizado, error: erroRpc } = await db.rpc('find_patient_id_by_normalized_cpf', {
    p_clinica_id: clinicaId,
    p_cpf: cpfDigitos,
  });
  if (erroRpc) throw erroRpc;
  if (typeof idNormalizado === 'string' && !candidatos.some((c) => c.id === idNormalizado)) {
    const { data: extra, error: erroExtra } = await db
      .from('pacientes')
      .select('id, data_nascimento')
      .eq('clinica_id', clinicaId)
      .eq('id', idNormalizado)
      .maybeSingle();
    if (erroExtra) throw erroExtra;
    if (extra) candidatos.push(extra);
  }
  return candidatos;
}

export function cpfValido(cpf: string): boolean {
  const d = cpf.replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const dv = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}
