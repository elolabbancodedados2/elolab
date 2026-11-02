import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

vi.mock('@/components/patients/PacienteCombobox', () => ({
  PacienteCombobox: ({ onChange }: { onChange: (id: string, paciente: { id: string; nome: string; nome_social: null; telefone: string | null }) => void }) => (
    <button type="button" onClick={() => onChange('patient-1', { id: 'patient-1', nome: 'Ana Souza', nome_social: null, telefone: '11999999999' })}>Selecionar Ana Souza</button>
  ),
}));

import PortalPacientesClinica from '@/pages/PortalPacientesClinica';

function TelaDoLink() {
  const location = useLocation();
  const state = location.state as { patientId?: string; returnTo?: string } | null;
  return <p data-testid="tela-link">{`${location.pathname}|${state?.patientId}|${state?.returnTo}`}</p>;
}

function renderPagina() {
  return render(
    <MemoryRouter initialEntries={['/portal-pacientes']}>
      <Routes>
        <Route path="/portal-pacientes" element={<PortalPacientesClinica />} />
        <Route path="/pacientes/:patientId/portal/link" element={<TelaDoLink />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Acesso ao Portal do Paciente', () => {
  it('só libera a emissão depois de escolher o paciente', () => {
    renderPagina();
    expect(screen.getByRole('heading', { name: 'Como funciona' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Gerar link de acesso/ })).toBeDisabled();
  });

  it('leva à mesma tela de emissão usada pela ficha, com volta para cá', () => {
    renderPagina();
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar Ana Souza' }));
    expect(screen.getByText('Ana Souza')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Gerar link de acesso/ }));
    expect(screen.getByTestId('tela-link')).toHaveTextContent('/pacientes/patient-1/portal/link|patient-1|/portal-pacientes');
  });
});
