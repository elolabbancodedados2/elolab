import { supabase } from '@/integrations/supabase/client';
import { ordenarFilaPorPrioridade } from './filaPrioridade';
import { todaySaoPauloDateOnly } from './dateOnly';

type ProximoItem = { id: string; status: string; posicao: number; prioridade?: string | null; agendamentos: { medico_id?: string | null; data?: string | null } | null };

export function proximoDaFilaDoMedico<T extends ProximoItem>(items: T[], medicoId: string, dia: string): T | null {
  return ordenarFilaPorPrioridade(items.filter(item => item.status === 'aguardando' && item.agendamentos?.medico_id === medicoId && item.agendamentos.data === dia))[0] ?? null;
}

export async function chamarProximoDoMedico(clinicaId: string, medicoId: string): Promise<'chamado' | 'mudou' | 'vazia'> {
  const dia = todaySaoPauloDateOnly();
  const { data, error } = await supabase.from('fila_atendimento')
    .select('id, status, prioridade, posicao, updated_at, agendamentos!inner(medico_id, data)')
    .eq('clinica_id', clinicaId).eq('status', 'aguardando')
    .eq('agendamentos.medico_id', medicoId).eq('agendamentos.data', dia);
  if (error) throw error;
  const next = proximoDaFilaDoMedico(data ?? [], medicoId, dia);
  if (!next) return 'vazia';
  return chamarPacienteNaFila({ filaId: next.id, clinicaId, versao: next.updated_at });
}

/**
 * Chama um paciente só se a linha da fila ainda estiver na versão que a tela
 * leu. O trigger `update_fila_atendimento_updated_at` renova `updated_at` a
 * cada gravação, então de duas recepções concorrentes apenas a primeira grava;
 * a segunda recebe 'mudou' e não dispara um segundo anúncio no Painel TV.
 */
export async function chamarPacienteNaFila({ filaId, clinicaId, versao, salaId }: {
  filaId: string;
  clinicaId: string;
  versao: string | null | undefined;
  salaId?: string | null;
}): Promise<'chamado' | 'mudou'> {
  const query = supabase
    .from('fila_atendimento')
    .update(salaId === undefined ? { status: 'chamado' } : { status: 'chamado', sala_id: salaId })
    .eq('id', filaId)
    .eq('clinica_id', clinicaId)
    .in('status', ['aguardando', 'chamado']);
  const { data, error } = await (versao ? query.eq('updated_at', versao) : query.is('updated_at', null)).select('id');
  if (error) throw error;
  return data?.length ? 'chamado' : 'mudou';
}
