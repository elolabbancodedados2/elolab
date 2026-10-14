import { fireEvent, render, screen } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { describe, expect, it, vi } from 'vitest';
import { DailyMultiDoctorView } from './DailyMultiDoctorView';

// O cartão depende de React Query/Router/Auth; aqui só importa a grade.
vi.mock('../AppointmentCard', () => ({
  AppointmentCard: ({ agendamento }: any) => <div data-testid="appointment-card">{agendamento.hora_inicio}</div>,
}));

describe('DailyMultiDoctorView', () => {
  it('permite criar consulta em um horario da grade usando teclado', () => {
    const onSlotClick = vi.fn();
    render(
      <DndContext>
        <DailyMultiDoctorView
          date="2026-10-11"
          medicos={[{ id: 'med-1', nome: 'Ana Silva', ativo: true }]}
          agendamentos={[]}
          bloqueios={[]}
          colorFor={() => '#005ECC'}
          onSlotClick={onSlotClick}
          onCardClick={vi.fn()}
        />
      </DndContext>,
    );

    expect(screen.getByTestId('agenda-doctor-header')).toHaveStyle({ height: '75px' });
    expect(screen.getByTestId('agenda-doctor-header-strip').closest('.sticky')).toHaveClass('top-0');

    const firstTabStop = screen.getByRole('button', { name: 'Criar consulta 06:00 com Dr(a). Ana Silva' });
    expect(firstTabStop).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('button', { name: 'Criar consulta 06:30 com Dr(a). Ana Silva' })).toHaveAttribute('tabindex', '-1');
    expect(document.querySelectorAll('[data-agenda-slot="true"][tabindex="0"]')).toHaveLength(1);
    firstTabStop.focus();
    expect(firstTabStop).toHaveFocus();

    fireEvent.keyDown(firstTabStop, { key: 'ArrowDown' });
    expect(screen.getByRole('button', { name: 'Criar consulta 06:05 com Dr(a). Ana Silva' })).toHaveFocus();

    fireEvent.click(screen.getByRole('button', { name: 'Criar consulta 06:05 com Dr(a). Ana Silva' }));
    expect(onSlotClick).toHaveBeenCalledWith('med-1', '06:05');
  });

  it('deixa a rolagem vertical para a pagina e sincroniza o cabecalho na horizontal', () => {
    const medicos = Array.from({ length: 6 }, (_, i) => ({ id: `med-${i}`, nome: `Profissional ${i}`, ativo: true }));
    const agendamentos = Array.from({ length: 80 }, (_, i) => ({
      id: `ag-${i}`,
      medico_id: `med-${i % 6}`,
      data: '2026-10-11',
      hora_inicio: `${String(6 + Math.floor(i / 6)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`,
      hora_fim: `${String(6 + Math.floor(i / 6)).padStart(2, '0')}:${i % 2 ? '50' : '20'}`,
      status: 'agendado',
      pacientes: { nome: `Paciente ${i}` },
    }));
    render(
      <DndContext>
        <DailyMultiDoctorView
          date="2026-10-11"
          medicos={medicos}
          agendamentos={agendamentos}
          bloqueios={[]}
          colorFor={() => '#005ECC'}
          onSlotClick={vi.fn()}
          onCardClick={vi.fn()}
        />
      </DndContext>,
    );

    const grid = screen.getByTestId('agenda-day-grid');
    expect(grid).toHaveClass('overflow-x-auto', 'overflow-y-hidden');
    expect(grid.className).not.toMatch(/max-h-|overflow-auto|overflow-y-(auto|scroll)/);
    // Nenhum ancestral dentro do componente pode virar contêiner de rolagem vertical.
    for (let el: HTMLElement | null = grid; el && el !== document.body; el = el.parentElement) {
      expect(el.className).not.toMatch(/max-h-|overflow-auto|overflow-hidden|overflow-y-(auto|scroll)/);
    }
    expect(screen.getAllByTestId('agenda-doctor-header')).toHaveLength(6);
    expect(document.querySelectorAll('[data-agenda-slot="true"][tabindex="0"]')).toHaveLength(6);

    grid.scrollLeft = 320;
    fireEvent.scroll(grid);
    expect(screen.getByTestId('agenda-doctor-header-strip').scrollLeft).toBe(320);
  });
});
