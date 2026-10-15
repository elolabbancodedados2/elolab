import type { Active, Announcements, Over, ScreenReaderInstructions } from '@dnd-kit/core';
import { nomeMedico } from '@/lib/formatters';

/**
 * Textos do leitor de tela para arrastar consultas na Agenda.
 *
 * O padrão do dnd-kit anuncia em inglês e lê o id interno do item
 * ("Picked up draggable item ag:<uuid>"). Aqui tudo sai em português e
 * descrito pelo paciente, horário e profissional.
 */
export const agendaScreenReaderInstructions: ScreenReaderInstructions = {
  draggable:
    'Para mover, pressione Espaço. Use as setas para escolher o novo horário, '
    + 'Espaço novamente para soltar ou Esc para cancelar.',
};

type Medicos = Record<string, { nome?: string | null; crm?: string | null } | undefined>;

function nomePaciente(p?: { nome_social?: string | null; nome?: string | null } | null) {
  return p?.nome_social || p?.nome || 'paciente';
}

function descreverItem(active: Active) {
  const data = active.data.current as any;
  if (data?.agendamento) {
    const ag = data.agendamento;
    const hora = String(ag.hora_inicio || '').slice(0, 5);
    return `a consulta de ${nomePaciente(ag.pacientes)}${hora ? ` às ${hora}` : ''}`;
  }
  if (data?.waiting) return `${nomePaciente(data.waiting.pacientes)} (lista de espera)`;
  return 'o item';
}

function descreverDestino(over: Over, medicos: Medicos) {
  const slot = over.data.current as any;
  if (!slot?.hora_inicio) return 'uma área sem horário';
  const medico = slot.medico_id ? medicos[slot.medico_id] : undefined;
  const [, mes, dia] = String(slot.data || '').split('-');
  const quando = dia && mes ? ` de ${dia}/${mes}` : '';
  const com = medico ? ` com ${nomeMedico(medico.nome || medico.crm)}` : '';
  return `o horário ${slot.hora_inicio}${quando}${com}`;
}

export function criarAnunciosAgenda(medicos: Medicos): Announcements {
  return {
    onDragStart: ({ active }) => `Movendo ${descreverItem(active)}.`,
    onDragOver: ({ active, over }) => over
      ? `Movendo ${descreverItem(active)} para ${descreverDestino(over, medicos)}.`
      : `Movendo ${descreverItem(active)} fora da grade de horários.`,
    onDragEnd: ({ active, over }) => over
      ? `Soltou ${descreverItem(active)} em ${descreverDestino(over, medicos)}.`
      : `Soltou ${descreverItem(active)} fora da grade. Nada foi alterado.`,
    onDragCancel: ({ active }) => `Movimento cancelado. Nada foi alterado em ${descreverItem(active)}.`,
  };
}
