import { nomeMedico } from '@/lib/formatters';

/** Status que não ocupam a agenda: aparecem riscados, mas não entram nas contagens. */
const STATUS_FORA_DA_CONTAGEM = new Set(['cancelado', 'faltou']);

export function contaNaAgenda(agendamento: { status?: string | null }): boolean {
  return !STATUS_FORA_DA_CONTAGEM.has(String(agendamento.status ?? ''));
}

interface BloqueioAgenda {
  id?: string;
  medico_id?: string | null;
  data_inicio: string;
  data_fim: string;
  hora_inicio?: string | null;
  hora_fim?: string | null;
  motivo?: string | null;
  tipo?: string | null;
}

/** Bloqueios que cobrem o dia (yyyy-MM-dd), opcionalmente limitados aos médicos visíveis. */
export function bloqueiosDoDia<T extends BloqueioAgenda>(bloqueios: T[], dia: string, medicosVisiveis?: string[]): T[] {
  return bloqueios.filter((b) =>
    dia >= b.data_inicio && dia <= b.data_fim
    && (!medicosVisiveis?.length || !b.medico_id || medicosVisiveis.includes(b.medico_id)),
  );
}

/** "Bloqueado: Férias · Dr. Fulano (08:00–12:00)" — o médico só aparece se houver mais de um na tela. */
export function rotuloBloqueio(b: BloqueioAgenda, medicoById: Record<string, any> = {}, mostrarMedico = true): string {
  const motivo = (b.motivo || b.tipo || 'sem motivo informado').trim();
  const medico = mostrarMedico && b.medico_id && medicoById[b.medico_id]
    ? ` · ${nomeMedico(medicoById[b.medico_id].nome || medicoById[b.medico_id].crm)}`
    : '';
  const horario = b.hora_inicio && b.hora_fim ? ` (${b.hora_inicio.slice(0, 5)}–${b.hora_fim.slice(0, 5)})` : '';
  return `Bloqueado: ${motivo}${medico}${horario}`;
}
