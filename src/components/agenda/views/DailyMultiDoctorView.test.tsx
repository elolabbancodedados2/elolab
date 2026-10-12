import { fireEvent, render, screen } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { describe, expect, it, vi } from 'vitest';
import { DailyMultiDoctorView } from './DailyMultiDoctorView';

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

    const firstTabStop = screen.getByRole('button', { name: 'Criar consulta 06:00 com Dr(a). Ana Silva' });
    expect(firstTabStop).toHaveAttribute('tabindex', '0');
    firstTabStop.focus();
    expect(firstTabStop).toHaveFocus();

    fireEvent.keyDown(firstTabStop, { key: 'ArrowDown' });
    expect(screen.getByRole('button', { name: 'Criar consulta 06:05 com Dr(a). Ana Silva' })).toHaveFocus();

    fireEvent.click(screen.getByRole('button', { name: 'Criar consulta 06:05 com Dr(a). Ana Silva' }));
    expect(onSlotClick).toHaveBeenCalledWith('med-1', '06:05');
  });
});
