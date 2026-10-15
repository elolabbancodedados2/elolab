import { fireEvent, render, screen } from '@testing-library/react';
import { DndContext, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AppointmentCard } from './AppointmentCard';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock('@/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => ({ profile: { clinica_id: 'clinica-teste', roles: ['recepcao'] } }),
}));

// Mesmos códigos de teclado que a AgendaPage usa.
function Dnd({ children, onDragStart }: { children: ReactNode; onDragStart?: () => void }) {
  const sensors = useSensors(useSensor(KeyboardSensor, {
    keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] },
  }));
  return <DndContext sensors={sensors} onDragStart={onDragStart}>{children}</DndContext>;
}

function renderCard(agendamento: Record<string, unknown>, extra: { onClick?: () => void; onDragStart?: () => void } = {}) {
  const onClick = extra.onClick ?? vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <Dnd onDragStart={extra.onDragStart}>
          <AppointmentCard
            agendamento={{
              id: 'ag-ficticio-1',
              paciente_id: 'pac-ficticio-1',
              medico_id: 'med-ficticio-1',
              data: '2026-10-13',
              status: 'confirmado',
              tipo: 'consulta',
              pacientes: { nome: 'Paciente Exemplo Silva' },
              ...agendamento,
            }}
            color="#7B6CF6"
            slotHeight={7}
            minutesToPx={(m) => (m / 5) * 7}
            onClick={onClick}
          />
        </Dnd>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { onClick };
}

describe('AppointmentCard', () => {
  it.each([
    ['15', '09:00:00', '09:15:00'],
    ['20', '09:00:00', '09:20:00'],
  ])('mantém o nome do paciente visível em cards de %s minutos', (_min, hora_inicio, hora_fim) => {
    renderCard({ hora_inicio, hora_fim, pacientes: { nome: 'Fulana Teste', nome_social: 'Fulane Exemplo' } });

    const card = screen.getByRole('button', { name: /Consulta de Fulane Exemplo/ });
    // Linha única: horário e paciente juntos, sem o avatar de iniciais.
    expect(card).toHaveTextContent('09:00');
    expect(card).toHaveTextContent('Fulane Exemplo');
    expect(card.querySelector('.items-start')).toBeNull();
  });

  it('tem nome acessível útil e não anuncia o id interno', () => {
    renderCard({ hora_inicio: '10:00:00', hora_fim: '10:30:00' });

    const card = screen.getByRole('button', {
      name: 'Consulta de Paciente Exemplo Silva, 10:00 às 10:30, Consulta, Confirmado',
    });
    expect(card).toHaveAttribute('aria-roledescription', 'consulta');
    expect(card.getAttribute('aria-label')).not.toContain('ag-ficticio-1');
  });

  it('abre a consulta com Enter sem iniciar o arraste', () => {
    const onDragStart = vi.fn();
    const { onClick } = renderCard({ hora_inicio: '10:00:00', hora_fim: '10:15:00' }, { onDragStart });

    const card = screen.getByRole('button', { name: /Consulta de Paciente Exemplo Silva/ });
    card.focus();
    fireEvent.keyDown(card, { key: 'Enter', code: 'Enter' });

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onDragStart).not.toHaveBeenCalled();
  });

  it('continua arrastável por teclado com Espaço', () => {
    const onDragStart = vi.fn();
    const { onClick } = renderCard({ hora_inicio: '10:00:00', hora_fim: '10:30:00' }, { onDragStart });

    const card = screen.getByRole('button', { name: /Consulta de Paciente Exemplo Silva/ });
    card.focus();
    fireEvent.keyDown(card, { key: ' ', code: 'Space' });

    expect(onDragStart).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('não permite arrastar consulta finalizada, mas ainda abre com Enter', () => {
    const onDragStart = vi.fn();
    const { onClick } = renderCard({ hora_inicio: '10:00:00', hora_fim: '10:30:00', status: 'finalizado' }, { onDragStart });

    const card = screen.getByRole('button', { name: /Consulta de Paciente Exemplo Silva/ });
    fireEvent.keyDown(card, { key: ' ', code: 'Space' });
    expect(onDragStart).not.toHaveBeenCalled();

    fireEvent.keyDown(card, { key: 'Enter', code: 'Enter' });
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
