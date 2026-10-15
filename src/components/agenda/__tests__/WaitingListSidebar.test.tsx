import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { WaitingListSidebar } from '@/components/agenda/WaitingListSidebar';

const item = (id: string, prioridade: string | null) => ({
  id,
  paciente_id: `paciente-${id}`,
  prioridade,
  status: 'aguardando',
  pacientes: { nome: `Paciente ${id}` },
});

describe('WaitingListSidebar', () => {
  it('exibe as prioridades persistidas com rótulo e cor do domínio', () => {
    render(
      <DndContext>
        <WaitingListSidebar
          open
          onToggle={() => {}}
          items={[item('1', 'normal'), item('2', 'preferencial'), item('3', 'urgente'), item('4', 'alta'), item('5', null)]}
        />
      </DndContext>,
    );

    expect(screen.getByText('Normal').className).toContain('text-muted-foreground');
    expect(screen.getByText('Preferencial').className).toContain('text-info');
    expect(screen.getByText('Urgente').className).toContain('text-destructive');
    const desconhecida = screen.getByText('Prioridade desconhecida (alta)');
    expect(desconhecida.className).toContain('text-warning-foreground');
    expect(desconhecida.className).not.toContain('text-destructive');
    expect(screen.getAllByText(/^(Normal|Preferencial|Urgente|Prioridade desconhecida)/)).toHaveLength(4);
  });
});
