import { supabase } from '@/integrations/supabase/client';

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
