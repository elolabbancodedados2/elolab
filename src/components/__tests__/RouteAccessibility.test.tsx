import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { RouteAccessibility } from '@/components/RouteAccessibility';
import { getRouteAnnouncement } from '@/config/routeLabels';

function NavigationHarness() {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <>
      <button onClick={() => navigate('/agenda')}>Abrir agenda</button>
      <main id="main-content" tabIndex={-1}>
        {location.pathname === '/agenda' && <button>Ação da agenda</button>}
      </main>
      <RouteAccessibility />
    </>
  );
}

describe('RouteAccessibility', () => {
  it('gera nomes legíveis inclusive para rotas sem rótulo cadastrado', () => {
    expect(getRouteAnnouncement('/pacientes')).toBe('Pacientes carregado');
    expect(getRouteAnnouncement('/admin/relatorios-agendados')).toBe('Relatórios agendados carregado');
    expect(getRouteAnnouncement('/gestao-fluxo')).toBe('Salas e lista de espera carregado');
    expect(getRouteAnnouncement('/relatorios/salvos')).toBe('Relatórios salvos carregado');
    expect(getRouteAnnouncement('/agendar/clinica-teste')).toBe('Agendamento online carregado');
    expect(getRouteAnnouncement('/')).toBe('Início carregado');
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

  it('preserva o foco de uma ação que a página de destino já selecionou', async () => {
    vi.useFakeTimers();
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="*" element={<NavigationHarness />} />
        </Routes>
      </MemoryRouter>,
    );

    act(() => fireEvent.click(screen.getByRole('button', { name: 'Abrir agenda' })));
    const destinationAction = screen.getByRole('button', { name: 'Ação da agenda' });
    destinationAction.focus();
    await act(async () => vi.runAllTimers());

    expect(document.activeElement).toBe(destinationAction);
    expect(screen.getByTestId('route-announcer')).toHaveTextContent('Agenda carregado');
    vi.useRealTimers();
  });
});
