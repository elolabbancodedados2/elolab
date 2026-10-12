import { fireEvent, render, screen } from '@testing-library/react';
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
          totals={{ total: 0, confirmados: 0, aguardando: 0, cancelados: 0 }}
          defaultView={null}
          onSetDefaultView={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('textbox', { name: 'Buscar paciente, CPF ou telefone' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Limpar busca' }));
    expect(onSearchChange).toHaveBeenCalledWith('');
    fireEvent.click(screen.getByRole('button', { name: /Nova consulta/ }));
    expect(onNewAppointment).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: /Status/ }));
    expect(screen.getByText('Aguardando triagem')).toBeInTheDocument();
    expect(screen.getByText('Em triagem')).toBeInTheDocument();
    expect(screen.getByText('Aguardando pagamento')).toBeInTheDocument();
  });
});
