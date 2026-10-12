import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/clinical', () => ({
  PatientPhoto: () => <span>Foto</span>,
  AllergyAlert: () => null,
}));

import { PatientListTable } from '@/components/patients/PatientListTable';

const paciente = { id: 'p1', nome: 'Ana Silva', data_nascimento: '1990-01-01', convenio_id: null };
const props = {
  pacientes: [paciente], totalPacientes: 1, totalPacientesCarregado: true,
  pagina: 0, hasMore: false,
  onPaginaChange: vi.fn(), onLimparFiltros: vi.fn(), onView: vi.fn(),
  onEdit: vi.fn(), onDelete: vi.fn(), onGeneratePortalLink: vi.fn(),
  getConvenioNome: () => 'Particular', calcularIdade: () => 36,
};

describe('ações da lista de pacientes por permissão', () => {
  it('oculta a edição para perfis sem permissão de atualização', () => {
    render(<PatientListTable {...props} podeEditarPaciente={false} />);
    expect(screen.queryByRole('button', { name: 'Editar Ana Silva' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver detalhes de Ana Silva' })).toBeInTheDocument();
  });

  it('mantém edição disponível para perfis com permissão', () => {
    render(<PatientListTable {...props} podeEditarPaciente />);
    expect(screen.getAllByRole('button', { name: 'Editar Ana Silva' }).length).toBeGreaterThan(0);
  });
});
