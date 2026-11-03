import { supabase } from '@/integrations/supabase/client';
import { mensagemDeErro } from './erros';
import type { ConsultaConfirmacao } from './agendaConfirmacoes';

export interface ConsultaFalta extends ConsultaConfirmacao { data: string; hora_inicio: string; status: string }

export function candidatosAFalta<T extends ConsultaFalta>(consultas: T[], fila: { agendamento_id: string }[], hoje: string, minutosAgora: number, tolerancia: number): T[] {
  if (!Number.isFinite(tolerancia) || tolerancia < 0) return [];
  const chegaram = new Set(fila.map(item => item.agendamento_id));
  return consultas.filter(consulta => {
    const hora = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(consulta.hora_inicio ?? '');
    if (!hora || Number(hora[1]) > 23 || Number(hora[2]) > 59) return false;
    return consulta.data === hoje && ['agendado', 'confirmado'].includes(consulta.status) && !chegaram.has(consulta.id)
      && Number(hora[1]) * 60 + Number(hora[2]) + tolerancia < minutosAgora;
  });
}

export async function marcarFaltasSelecionadas(consultas: ConsultaFalta[], clinicaId: string) {
  const marcadas: string[] = [];
  const falhas: { id: string; nome: string; motivo: string }[] = [];
  for (const consulta of consultas) {
    try {
      if (!clinicaId) throw new Error('Unidade não identificada.');
      const fila = await supabase.from('fila_atendimento').select('id').eq('agendamento_id', consulta.id).eq('clinica_id', clinicaId).limit(1);
      if (fila.error) throw fila.error;
      if (fila.data?.length) throw new Error('O paciente já chegou.');
      // O check-in atualiza status/versão sob trava no banco: não pode perder para esta gravação.
      let update = supabase.from('agendamentos').update({ status: 'faltou' }).eq('id', consulta.id)
        .eq('clinica_id', clinicaId).in('status', ['agendado', 'confirmado']);
      update = consulta.updated_at ? update.eq('updated_at', consulta.updated_at) : update.is('updated_at', null);
      const { data, error } = await update.select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('A consulta mudou. Atualize a lista antes de marcar falta.');
      marcadas.push(consulta.id);
    } catch (error) {
      falhas.push({ id: consulta.id, nome: consulta.pacientes?.nome_social || consulta.pacientes?.nome || 'Paciente', motivo: mensagemDeErro(error) });
    }
  }
  return { marcadas, falhas };
}
