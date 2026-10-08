import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('framer-motion', () => ({
  motion: { div: ({ children }: { children: React.ReactNode }) => <div>{children}</div> },
}));
vi.mock('@/components/clinical', () => ({
  PatientPhoto: () => null,
  AllergyAlert: () => null,
}));

import { PatientListTable } from '@/components/patients/PatientListTable';

function renderLista({
  totalPacientes,
  totalPacientesCarregado = true,
  hasFiltrosAtivos = false,
}: {
  totalPacientes: number | null;
  totalPacientesCarregado?: boolean;
  hasFiltrosAtivos?: boolean;
}) {
  return render(
    <PatientListTable
      pacientes={[]}
      totalPacientes={totalPacientes}
      totalPacientesCarregado={totalPacientesCarregado}
      hasFiltrosAtivos={hasFiltrosAtivos}
      pagina={0}
      hasMore={false}
      onPaginaChange={vi.fn()}
      onLimparFiltros={vi.fn()}
      onView={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onGeneratePortalLink={vi.fn()}
      getConvenioNome={() => 'Particular'}
      calcularIdade={() => 0}
    />,
  );
}

describe('PatientListTable', () => {
  it('só afirma que a clínica está vazia quando o total zero foi confirmado', () => {
    const { container } = renderLista({ totalPacientes: 0 });

    expect(container).toHaveTextContent('Ainda não há pacientes cadastrados');
    expect(container).not.toHaveTextContent('Não foi possível confirmar se há pacientes cadastrados');
  });

  it('mostra que o total ainda está sendo verificado durante o carregamento', () => {
    const { container } = renderLista({ totalPacientes: null, totalPacientesCarregado: false });

    expect(container).toHaveTextContent('Verificando o cadastro de pacientes…');
    expect(container).not.toHaveTextContent('Ainda não há pacientes cadastrados');
  });

  it('não transforma falha nos indicadores em lista vazia e permite limpar filtros', () => {
    renderLista({ totalPacientes: null, hasFiltrosAtivos: true });

    expect(screen.getAllByText(/Não foi possível confirmar se há pacientes cadastrados/)).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Limpar busca e filtros' })).toHaveLength(2);
  });
});
