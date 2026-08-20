import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { RouteAccessibility, getRouteAnnouncement } from '@/components/RouteAccessibility';

function NavigationHarness() {
  const navigate = useNavigate();
  return (
    <>
      <button onClick={() => navigate('/agenda')}>Abrir agenda</button>
      <main id="main-content" tabIndex={-1} />
      <RouteAccessibility />
    </>
  );
}

describe('RouteAccessibility', () => {
  it('gera nomes legíveis inclusive para rotas sem rótulo cadastrado', () => {
    expect(getRouteAnnouncement('/pacientes')).toBe('Pacientes carregado');
    expect(getRouteAnnouncement('/relatorios-agendados')).toBe('Relatorios agendados carregado');
    expect(getRouteAnnouncement('/')).toBe('Página carregada');
  });

  it('move o foco ao conteúdo e anuncia a navegação interna', async () => {
    vi.useFakeTimers();
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="*" element={<NavigationHarness />} />
        </Routes>
      </MemoryRouter>,
    );

    act(() => fireEvent.click(screen.getByRole('button', { name: 'Abrir agenda' })));
    await act(async () => vi.runAllTimers());

    expect(document.activeElement).toBe(screen.getByRole('main'));
    expect(screen.getByTestId('route-announcer')).toHaveTextContent('Agenda carregado');
    vi.useRealTimers();
  });
});
