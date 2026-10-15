import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: [], isLoading: false, refetch: vi.fn(), isError: false }) }));
vi.mock('@/contexts/SupabaseAuthContext', () => ({ useSupabaseAuth: () => ({ profile: { clinica_id: 'clinic-1' } }) }));

import CobrancaInadimplentes from '../CobrancaInadimplentes';

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

describe('CobrancaInadimplentes', () => {
  it('oferece consultar contas a receber sem iniciar uma cobrança', () => {
    render(
      <MemoryRouter initialEntries={['/inadimplentes']}>
        <Routes>
          <Route path="/inadimplentes" element={<CobrancaInadimplentes />} />
          <Route path="/contas" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Cobran\u00e7a de inadimplentes' })).toBeInTheDocument();
    expect(screen.getByText('Nenhuma pendência vencida')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir contas a receber' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/contas?tab=receber');
  });
});
