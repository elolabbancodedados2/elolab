import { supabase } from '@/integrations/supabase/client';
import { proximaVagaLivre } from '@/lib/proximaVagaLivre';

/**
 * Próxima vaga de cada profissional, numa busca só (três consultas para todos
 * os médicos), para "Encontrar vaga" da lista de espera e "Buscar vaga" da
 * agenda. É sugestão: o formulário confere conflito, bloqueio e expediente.
 */

export interface MedicoParaVaga {
  id: string;
  intervalo_consulta?: number | string | null;
}

export interface VagaEncontrada {
  medico_id: string;
  data: string;
  hora_inicio: string;
}

export const JANELAS_PERIODO: Record<string, readonly [number, number]> = {
  manha: [6 * 60, 12 * 60],
  tarde: [12 * 60, 18 * 60],
  noite: [18 * 60, 24 * 60],
};

function somarDias(data: string, dias: number): string {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function ordenarVagas(vagas: VagaEncontrada[]): VagaEncontrada[] {
  return [...vagas].sort((a, b) => a.data.localeCompare(b.data) || a.hora_inicio.localeCompare(b.hora_inicio));
}

export async function buscarVagas(params: {
  clinicaId: string;
  medicos: MedicoParaVaga[];
  hoje: string;
  agoraMinutos: number;
  dias?: number;
  periodo?: string | null;
  /** Duração fixa; sem ela, vale o intervalo de consulta de cada médico. */
  duracaoMinutos?: number;
}): Promise<VagaEncontrada[]> {
  const ids = params.medicos.map(m => m.id);
  if (!ids.length) return [];
  const dias = params.dias ?? 14;
  const fim = somarDias(params.hoje, dias - 1);
  const [jornada, ocupacao, bloqueios] = await Promise.all([
    (supabase.from('medico_disponibilidade' as any).select('medico_id, dia_semana, hora_inicio, hora_fim')
      .in('medico_id', ids).eq('ativo', true) as any),
    supabase.from('agendamentos').select('medico_id, data, hora_inicio, hora_fim, status')
      .eq('clinica_id', params.clinicaId).in('medico_id', ids).gte('data', params.hoje).lte('data', fim),
    (supabase.from('bloqueios_agenda' as any).select('medico_id, data_inicio, data_fim, hora_inicio, hora_fim, dia_inteiro')
      .in('medico_id', ids).lte('data_inicio', fim).gte('data_fim', params.hoje) as any),
  ]);
  if (jornada.error) throw jornada.error;
  if (ocupacao.error) throw ocupacao.error;
  if (bloqueios.error) throw bloqueios.error;
  const janela = params.periodo ? JANELAS_PERIODO[params.periodo] : undefined;

  const vagas: VagaEncontrada[] = [];
  for (const medico of params.medicos) {
    const vaga = proximaVagaLivre({
      hoje: params.hoje,
      agoraMinutos: params.agoraMinutos,
      duracaoMinutos: params.duracaoMinutos || Number(medico.intervalo_consulta) || 30,
      jornada: ((jornada.data ?? []) as any[]).filter(j => j.medico_id === medico.id),
      agendamentos: ((ocupacao.data ?? []) as any[]).filter(a => a.medico_id === medico.id),
      bloqueios: ((bloqueios.data ?? []) as any[]).filter(b => b.medico_id === medico.id),
      dias,
      janela,
    });
    if (vaga) vagas.push({ medico_id: medico.id, ...vaga });
  }
  return ordenarVagas(vagas);
}
