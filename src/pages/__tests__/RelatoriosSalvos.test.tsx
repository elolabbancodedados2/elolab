import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: [], isLoading: false, isError: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock('@/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => ({ user: { id: 'user-1' }, profile: { clinica_id: 'clinic-1' } }),
}));

import RelatoriosSalvos from '../RelatoriosSalvos';

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

describe('RelatoriosSalvos', () => {
  it('oferece criar um relatório e navega para a área de relatórios', () => {
    render(
      <MemoryRouter initialEntries={['/relatorios-salvos']}>
        <Routes>
          <Route path="/relatorios-salvos" element={<RelatoriosSalvos />} />
          <Route path="/relatorios" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Nenhum relatório salvo ainda')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Criar relatório' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/relatorios');
  });
});
