import { describe, expect, it } from 'vitest';
import type { Active, Over } from '@dnd-kit/core';
import { agendaScreenReaderInstructions, criarAnunciosAgenda } from './agendaDndAccessibility';

const active = (id: string, data: Record<string, unknown>) =>
  ({ id, data: { current: data }, rect: { current: { initial: null, translated: null } } }) as unknown as Active;
const over = (id: string, data: Record<string, unknown>) =>
  ({ id, data: { current: data }, rect: {}, disabled: false }) as unknown as Over;

const anuncios = criarAnunciosAgenda({ 'med-ficticio-1': { nome: 'Ana Exemplo' } });
const consulta = active('ag:00000000-aaaa-bbbb-cccc-000000000001', {
  agendamento: { hora_inicio: '09:00:00', pacientes: { nome: 'Paciente Exemplo' } },
});
const slot = over('slot:med-ficticio-1:2026-10-13:09:30', {
  medico_id: 'med-ficticio-1', data: '2026-10-13', hora_inicio: '09:30',
});

describe('anúncios de arraste da Agenda', () => {
  it('descreve paciente, horário e profissional em português, sem ids internos', () => {
    const textos = [
      anuncios.onDragStart({ active: consulta }),
      anuncios.onDragOver({ active: consulta, over: slot }),
      anuncios.onDragEnd({ active: consulta, over: slot }),
      anuncios.onDragEnd({ active: consulta, over: null }),
      anuncios.onDragCancel({ active: consulta, over: null }),
      agendaScreenReaderInstructions.draggable,
    ];

    expect(textos[0]).toBe('Movendo a consulta de Paciente Exemplo às 09:00.');
    expect(textos[1]).toBe('Movendo a consulta de Paciente Exemplo às 09:00 para o horário 09:30 de 13/10 com Dr(a). Ana Exemplo.');
    expect(textos[3]).toContain('Nada foi alterado');
    for (const texto of textos) {
      expect(texto).not.toMatch(/ag:|slot:|med-ficticio|0000/);
      expect(texto).not.toMatch(/draggable|droppable|picked up|dropped/i);
    }
  });

  it('descreve itens da lista de espera pelo nome do paciente', () => {
    const espera = active('wait:espera-ficticia-1', { waiting: { pacientes: { nome: 'Pessoa Aguardando' } } });
    expect(anuncios.onDragStart({ active: espera })).toBe('Movendo Pessoa Aguardando (lista de espera).');
  });
});
