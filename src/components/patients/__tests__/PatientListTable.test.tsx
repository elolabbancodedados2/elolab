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
});
