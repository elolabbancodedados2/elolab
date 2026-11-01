import { parseDateOnly, todaySaoPauloDateOnly } from '@/lib/dateOnly';

/**
 * Regras puras da tela de evolução clínica, separadas para teste.
 */

/** Separa uma lista digitada livremente ("A, B; C" ou uma por linha). */
function separarItens(valor: unknown): string[] {
  if (Array.isArray(valor)) return valor.map(item => String(item ?? '').trim()).filter(Boolean);
  if (typeof valor !== 'string') return [];
  return valor.split(/[;\n,]+/).map(item => item.trim()).filter(Boolean);
}

/**
 * Medicamentos para a checagem de interações: o que está sendo prescrito mais
 * o que o paciente já usa. Sem repetir o mesmo nome (ignora caixa e acento).
 */
export function listarMedicamentosParaChecagem(prescritos: unknown[], emUso: unknown): string[] {
  const vistos = new Set<string>();
  const resultado: string[] = [];
  for (const item of [...separarItens(prescritos), ...separarItens(emUso)]) {
    const chave = item.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    resultado.push(item);
  }
  return resultado;
}

/**
 * Diagnósticos secundários: durante a digitação a caixa guarda as linhas como
 * estão (inclusive a linha vazia que surge ao apertar Enter); só ao salvar ou
 * imprimir a lista é limpa.
 */
export function limparDiagnosticosSecundarios(valor: unknown): string[] {
  if (!Array.isArray(valor)) return typeof valor === 'string' ? limparDiagnosticosSecundarios(valor.split('\n')) : [];
  return valor.map(item => String(item ?? '').trim()).filter(Boolean);
}

/** CPF parcialmente oculto para exibição na tela: ***.456.789-** */
export function mascararCpf(cpf: unknown): string {
  const digitos = String(cpf ?? '').replace(/\D/g, '');
  if (digitos.length !== 11) return digitos ? '***' : '';
  return `***.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-**`;
}

/**
 * Idade por extenso: "3 meses", "1 ano e 2 meses", "34 anos".
 * Bebês com menos de um mês aparecem em dias. Data inválida ou futura: null.
 */
export function idadePorExtenso(dataNascimento: string | null | undefined, hoje = todaySaoPauloDateOnly()): string | null {
  const nascimento = parseDateOnly(dataNascimento ?? '');
  const referencia = parseDateOnly(hoje);
  if (!nascimento || !referencia || Number.isNaN(nascimento.getTime()) || Number.isNaN(referencia.getTime())) return null;
  if (nascimento.getTime() > referencia.getTime()) return null;

  let meses = (referencia.getFullYear() - nascimento.getFullYear()) * 12 + (referencia.getMonth() - nascimento.getMonth());
  if (referencia.getDate() < nascimento.getDate()) meses -= 1;

  if (meses < 1) {
    const dias = Math.round((referencia.getTime() - nascimento.getTime()) / 86_400_000);
    return dias === 1 ? '1 dia' : `${dias} dias`;
  }
  const anos = Math.floor(meses / 12);
  const resto = meses % 12;
  const textoMeses = resto === 1 ? '1 mês' : `${resto} meses`;
  if (anos === 0) return textoMeses;
  const textoAnos = anos === 1 ? '1 ano' : `${anos} anos`;
  // A partir de 2 anos, os meses deixam de ajudar na leitura rápida.
  if (anos >= 2 || resto === 0) return textoAnos;
  return `${textoAnos} e ${textoMeses}`;
}

/**
 * Campos que fazem sentido trazer da evolução anterior. Queixa, exame físico,
 * conduta e sinais vitais são do atendimento de hoje e nunca são copiados.
 */
export const CAMPOS_COPIAVEIS_DA_ULTIMA_EVOLUCAO = [
  'historia_patologica_pregressa',
  'historia_familiar',
  'historia_social',
  'alergias_relatadas',
  'medicamentos_em_uso',
  'diagnostico_principal',
  'plano_terapeutico',
] as const;

export type CampoCopiavel = typeof CAMPOS_COPIAVEIS_DA_ULTIMA_EVOLUCAO[number];

/**
 * O que copiar da última evolução: só campos preenchidos lá e ainda vazios
 * aqui, para não sobrescrever o que o médico já digitou.
 */
export function camposDaUltimaEvolucao(
  ultima: Record<string, unknown> | null | undefined,
  atual: Record<string, unknown>,
): Partial<Record<CampoCopiavel, string>> {
  if (!ultima) return {};
  const copia: Partial<Record<CampoCopiavel, string>> = {};
  for (const campo of CAMPOS_COPIAVEIS_DA_ULTIMA_EVOLUCAO) {
    const anterior = typeof ultima[campo] === 'string' ? (ultima[campo] as string).trim() : '';
    const presente = typeof atual[campo] === 'string' ? (atual[campo] as string).trim() : '';
    if (anterior && !presente) copia[campo] = anterior;
  }
  return copia;
}

export type FiltroSituacaoEvolucao = 'todas' | 'rascunhos' | 'assinadas';

/** Filtro da lista de evoluções por situação e por médico responsável. */
export function filtrarEvolucoes<T extends { assinado?: boolean | null; medico_id?: string | null }>(
  evolucoes: T[],
  filtro: { situacao: FiltroSituacaoEvolucao; medicoId: string | 'todos' },
): T[] {
  return evolucoes.filter(evolucao => {
    if (filtro.situacao === 'rascunhos' && evolucao.assinado) return false;
    if (filtro.situacao === 'assinadas' && !evolucao.assinado) return false;
    if (filtro.medicoId !== 'todos' && evolucao.medico_id !== filtro.medicoId) return false;
    return true;
  });
}
