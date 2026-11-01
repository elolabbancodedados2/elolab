import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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

  it('agenda sem arrastar, mostra o status do pedido e oferece incluir quando vazia', () => {
    const onAgendar = vi.fn();
    const { unmount } = render(
      <DndContext>
        <WaitingListSidebar open onToggle={() => {}} onAgendar={onAgendar}
          items={[{ ...item('1', 'normal'), status: 'confirmado' }]} />
      </DndContext>,
    );
    expect(screen.getByText('Confirmado')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Agendar Paciente 1' }));
    expect(onAgendar).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }));
    unmount();

    const onAdicionar = vi.fn();
    render(
      <DndContext>
        <WaitingListSidebar open onToggle={() => {}} items={[]} onAdicionar={onAdicionar} />
      </DndContext>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Adicionar paciente/ }));
    expect(onAdicionar).toHaveBeenCalledOnce();
  });
});
