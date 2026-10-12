import { supabase } from '@/integrations/supabase/client';

export interface PatientBasicData {
  id: string;
  nome: string;
  nome_social: string | null;
  cpf: string | null;
  telefone: string | null;
  email: string | null;
  data_nascimento: string | null;
  convenio_id: string | null;
  created_at?: string;
}

/** A aba financeira da ficha mostra o extrato completo, que enfermagem não acessa. */
export function canViewPatientFinancialTab(roles: readonly string[] | null | undefined): boolean {
  return Boolean(roles?.includes('admin') || roles?.includes('recepcao'));
}

/** A ficha clinica completa e sua timeline são restritas a admin e médico. */
export function canViewPatientClinicalTimeline(roles: readonly string[] | null | undefined): boolean {
  return Boolean(roles?.includes('admin') || roles?.includes('medico'));
}

/** Busca dados de identificação sem dar acesso financeiro ao restante do cadastro clínico. */
export async function buscarDadosBasicosPacientes(ids: string[]): Promise<Map<string, PatientBasicData>> {
  const unicos = [...new Set(ids.filter(Boolean))];
  const resultado = new Map<string, PatientBasicData>();
  for (let inicio = 0; inicio < unicos.length; inicio += 500) {
    const { data, error } = await (supabase as any).rpc('buscar_pacientes_resumo_financeiro', {
      p_ids: unicos.slice(inicio, inicio + 500),
      p_termo: null,
      p_limite: 500,
    });
    if (error) throw error;
    for (const paciente of (data ?? []) as PatientBasicData[]) resultado.set(paciente.id, paciente);
  }
  return resultado;
}
