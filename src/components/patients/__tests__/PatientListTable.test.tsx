import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PatientListTable } from '../PatientListTable';

vi.mock('@/components/clinical', () => ({ PatientPhoto: () => null, AllergyAlert: () => null }));

const baseProps = {
  pacientes: [],
  totalPacientesCarregado: true,
  pagina: 0,
  hasMore: false,
  onPaginaChange: vi.fn(),
  onLimparFiltros: vi.fn(),
  onView: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  onGeneratePortalLink: vi.fn(),
  onRevokePortalLinks: vi.fn(),
  getConvenioNome: () => 'Particular',
  calcularIdade: () => 0,
};

describe('PatientListTable empty state', () => {
  it('offers patient creation when the clinic has no patients and creation is allowed', () => {
    const onCreate = vi.fn();
    render(<PatientListTable {...baseProps} totalPacientes={0} onCreate={onCreate} />);

    expect(screen.getAllByRole('heading', { name: 'Ainda não há pacientes cadastrados' })).toHaveLength(2);
    fireEvent.click(screen.getAllByRole('button', { name: 'Novo paciente' })[0]);
    expect(onCreate).toHaveBeenCalledOnce();
  });

  it('offers to clear filters when patients exist but the current search has no matches', () => {
    const onLimparFiltros = vi.fn();
    render(<PatientListTable {...baseProps} totalPacientes={4} hasFiltrosAtivos onLimparFiltros={onLimparFiltros} />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Limpar busca e filtros' })[0]);
    expect(onLimparFiltros).toHaveBeenCalledOnce();
  });
});

describe('PatientListTable portal access actions', () => {
  it('keeps the edit action when no status-change handler is supplied', () => {
    render(
      <PatientListTable
        {...baseProps}
        pacientes={[{ id: 'patient-active', nome: 'Ana Silva', ativo: true, data_nascimento: null, convenio_id: null }]}
        totalPacientes={1}
      />,
    );

    expect(screen.getAllByRole('button', { name: 'Editar Ana Silva' })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Inativar Ana Silva' })).not.toBeInTheDocument();
  });

  it('sends the selected patient to the explicit revoke confirmation flow', () => {
    const onRevokePortalLinks = vi.fn();
    render(
      <PatientListTable
        {...baseProps}
        pacientes={[{ id: 'patient-1', nome: 'Ana Silva', data_nascimento: null, convenio_id: null }]}
        totalPacientes={1}
        onRevokePortalLinks={onRevokePortalLinks}
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Revogar links do portal de Ana Silva' })[0]);

    expect(onRevokePortalLinks).toHaveBeenCalledWith('patient-1', 'Ana Silva');
  });

  it('shows inactive status, hides portal controls, and exposes reactivation', () => {
    const onChangeStatus = vi.fn();
    render(
      <PatientListTable
        {...baseProps}
        pacientes={[{ id: 'patient-inactive', nome: 'Ana Silva', ativo: false, data_nascimento: null, convenio_id: null }]}
        totalPacientes={1}
        onChangeStatus={onChangeStatus}
      />,
    );

    expect(screen.getAllByText('Inativo')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Gerar link do portal para Ana Silva' })).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Reativar Ana Silva' })[0]);
    expect(onChangeStatus).toHaveBeenCalledWith(expect.objectContaining({ id: 'patient-inactive', ativo: false }));
  });

  it('shows missing phone and email in the contact list on mobile and desktop layouts', () => {
    render(
      <PatientListTable
        {...baseProps}
        pacientes={[{ id: 'patient-2', nome: 'João Lima', telefone: null, email: '', data_nascimento: null, convenio_id: null }]}
        totalPacientes={1}
      />,
    );

    expect(screen.getAllByText('Sem telefone e e-mail')).toHaveLength(2);
  });
});
