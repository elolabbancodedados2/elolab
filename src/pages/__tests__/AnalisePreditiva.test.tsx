import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }) }));
vi.mock('@/contexts/SupabaseAuthContext', () => ({ useSupabaseAuth: () => ({ profile: { clinica_id: 'clinic-1' } }) }));

import AnalisePreditiva from '../AnalisePreditiva';

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

describe('AnalisePreditiva', () => {
  it('orienta quando não há previsões e permite abrir a agenda', () => {
    render(
      <MemoryRouter initialEntries={['/risco-faltas']}>
        <Routes>
          <Route path="/risco-faltas" element={<AnalisePreditiva />} />
          <Route path="/agenda" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Nenhuma previsão disponível para hoje')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir agenda' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/agenda');
  });
});
