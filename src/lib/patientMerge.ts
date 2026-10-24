import { supabase } from '@/integrations/supabase/client';

/** Cadastral fields the merge RPC accepts; must match `v_permitidos` in the migration. */
export const MERGE_FIELDS = [
  { campo: 'nome', rotulo: 'Nome' },
  { campo: 'nome_social', rotulo: 'Nome social' },
  { campo: 'cpf', rotulo: 'CPF' },
  { campo: 'data_nascimento', rotulo: 'Nascimento' },
  { campo: 'sexo', rotulo: 'Sexo' },
  { campo: 'telefone', rotulo: 'Telefone' },
  { campo: 'email', rotulo: 'E-mail' },
  { campo: 'cep', rotulo: 'CEP' },
  { campo: 'logradouro', rotulo: 'Logradouro' },
  { campo: 'numero', rotulo: 'Número' },
  { campo: 'complemento', rotulo: 'Complemento' },
  { campo: 'bairro', rotulo: 'Bairro' },
  { campo: 'cidade', rotulo: 'Cidade' },
  { campo: 'estado', rotulo: 'UF' },
  { campo: 'convenio_id', rotulo: 'Convênio' },
  { campo: 'numero_carteira', rotulo: 'Carteirinha' },
  { campo: 'validade_carteira', rotulo: 'Validade da carteirinha' },
  { campo: 'estado_civil', rotulo: 'Estado civil' },
  { campo: 'profissao', rotulo: 'Profissão' },
  { campo: 'nome_responsavel', rotulo: 'Responsável' },
  { campo: 'cpf_responsavel', rotulo: 'CPF do responsável' },
  { campo: 'parentesco_responsavel', rotulo: 'Parentesco do responsável' },
] as const;

export type MergeField = typeof MERGE_FIELDS[number]['campo'];
type PatientRecord = Record<string, unknown>;

export interface FieldDifference {
  campo: MergeField;
  rotulo: string;
  destino: unknown;
  origem: unknown;
}

const isEmpty = (value: unknown) => value === null || value === undefined || String(value).trim() === '';
const comparable = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

/** Fields where the duplicate holds a non-empty value different from the record that stays. */
export function diffPatientFields(destino: PatientRecord, origem: PatientRecord): FieldDifference[] {
  return MERGE_FIELDS
    .filter(({ campo }) => !isEmpty(origem[campo]) && comparable(origem[campo]) !== comparable(destino[campo]))
    .map(({ campo, rotulo }) => ({ campo, rotulo, destino: destino[campo] ?? null, origem: origem[campo] }));
}

const REASON_LABELS: Record<string, string> = {
  cpf: 'CPF igual',
  nome_data_nascimento: 'Nome e nascimento iguais',
  telefone: 'Telefone igual',
  nome: 'Mesmo nome',
};

export function describeDuplicateReasons(motivos: string[]): string {
  return motivos.map(motivo => REASON_LABELS[motivo] ?? motivo).join(' · ');
}

export interface DuplicatePair {
  paciente_a: string;
  nome_a: string;
  nascimento_a: string | null;
  telefone_final_a: string | null;
  paciente_b: string;
  nome_b: string;
  nascimento_b: string | null;
  telefone_final_b: string | null;
  pontuacao: number;
  motivos: string[];
}

export async function listPatientDuplicates(limiar: number): Promise<DuplicatePair[]> {
  const { data, error } = await supabase.rpc('listar_duplicidades_pacientes', { p_limiar: limiar, p_limite: 100 });
  if (error) throw error;
  return (data ?? []) as DuplicatePair[];
}

export async function dismissPatientDuplicate(pacienteA: string, pacienteB: string): Promise<void> {
  const { error } = await supabase.rpc('descartar_duplicidade_pacientes', { p_paciente_a: pacienteA, p_paciente_b: pacienteB });
  if (error) throw error;
}

export async function mergePatients(input: { origemId: string; destinoId: string; campos: MergeField[]; motivo: string }) {
  const { data, error } = await supabase.rpc('mesclar_pacientes', {
    p_origem: input.origemId,
    p_destino: input.destinoId,
    p_campos: input.campos,
    p_motivo: input.motivo.trim(),
  });
  if (error) throw error;
  const result = data as { mesclagem_id?: string; agendamentos_movidos?: number; lista_espera_movida?: number; referencias_preservadas?: Record<string, number> } | null;
  if (!result?.mesclagem_id) throw new Error('O servidor não confirmou a mesclagem.');
  return result;
}
