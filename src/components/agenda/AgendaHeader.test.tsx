import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AgendaHeader } from './AgendaHeader';

describe('AgendaHeader', () => {
  it('mantém pesquisa acessível e abre o cadastro de consulta', () => {
    const onNewAppointment = vi.fn();
    const onSearchChange = vi.fn();

    render(
      <MemoryRouter>
        <AgendaHeader
          date="2026-10-10"
          view="daily"
          onDateChange={vi.fn()}
          onViewChange={vi.fn()}
          search="Ana"
          onSearchChange={onSearchChange}
          medicos={[]}
          statusFilter={[]}
          medicoFilter={[]}
          onStatusFilterChange={vi.fn()}
          onMedicoFilterChange={vi.fn()}
          onNewAppointment={onNewAppointment}
          onNewBlock={vi.fn()}
          onOpenColorScheme={vi.fn()}
          onToggleWaiting={vi.fn()}
          waitingCount={0}
          totals={{ total: 0, confirmados: 0, aConfirmar: 0, naClinica: 0, cancelados: 0 }}
          defaultView={null}
          onSetDefaultView={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: /A confirmar/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Na clínica/ })).toBeInTheDocument();

    expect(screen.getByRole('textbox', { name: 'Buscar paciente, CPF ou telefone' })).toBeInTheDocument();
    const views = screen.getByRole('group', { name: 'Visualização da agenda' });
    expect(within(views).getByRole('button', { name: 'Visualização diária' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(views).getByRole('button', { name: 'Visualização semanal' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('heading', { name: 'Sábado, 10 de out' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Visualização diária' }).className).toContain('bg-foreground');
    expect(screen.getByRole('button', { name: 'Nova consulta' }).className).toContain('bg-primary');
    fireEvent.click(screen.getByRole('button', { name: 'Limpar busca' }));
    expect(onSearchChange).toHaveBeenCalledWith('');
    fireEvent.click(screen.getByRole('button', { name: /Nova consulta/ }));
    expect(onNewAppointment).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: /Status/ }));
    expect(screen.getByText('Aguardando triagem')).toBeInTheDocument();
    expect(screen.getByText('Em triagem')).toBeInTheDocument();
    expect(screen.getByText('Aguardando pagamento')).toBeInTheDocument();
  });

  it('esconde o filtro de médicos para o médico e separa os totais por situação', () => {
    const onStatusFilterChange = vi.fn();
    render(
      <MemoryRouter>
        <AgendaHeader
          date="2026-10-10"
          view="weekly"
          onDateChange={vi.fn()}
          onViewChange={vi.fn()}
          search=""
          onSearchChange={vi.fn()}
          medicos={[{ id: 'm1', nome: 'Ana' }]}
          statusFilter={[]}
          medicoFilter={['m1']}
          hideMedicoFilter
          onStatusFilterChange={onStatusFilterChange}
          onMedicoFilterChange={vi.fn()}
          onNewAppointment={vi.fn()}
          onNewBlock={vi.fn()}
          onOpenColorScheme={vi.fn()}
          onToggleWaiting={vi.fn()}
          waitingCount={0}
          totals={{ total: 9, confirmados: 2, aConfirmar: 4, naClinica: 1, cancelados: 2 }}
          totalsLabel="na semana"
          defaultView={null}
          onSetDefaultView={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('button', { name: /Médicos/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Limpar filtros' })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: /na semana: 9 no total/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Na clínica/ }));
    expect(onStatusFilterChange).toHaveBeenCalledWith(['aguardando', 'aguardando_triagem', 'em_triagem', 'fila_atendimento', 'em_atendimento']);
  });
});
