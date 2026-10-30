import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router-dom';

const mocks = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('sonner', () => ({ toast: mocks.toast }));

import FilaPassagemPage from '@/pages/FilaPassagemPage';

function LocationOutput() {
  const location = useLocation();
  return <output data-testid="current-location">{location.pathname}{location.search}</output>;
}

function setup(initialEntry: string | { pathname: string; state: unknown }) {
  const router = createMemoryRouter([
    { path: '/fila/passagem', element: <><LocationOutput /><FilaPassagemPage /></> },
    { path: '/fila', element: <LocationOutput /> },
  ], { initialEntries: [initialEntry] });
  return render(<RouterProvider router={router} />);
}

describe('FilaPassagemPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mostra o resumo na página e copia sem modal', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    setup({ pathname: '/fila/passagem', state: { summary: 'Fila de 30/10/2026\nAguardando: 4', returnTo: '/fila?tab=fila' } });

    expect(screen.getByRole('heading', { name: 'Passagem de turno' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Resumo operacional da passagem de turno' })).toHaveValue('Fila de 30/10/2026\nAguardando: 4');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copiar resumo' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Fila de 30/10/2026\nAguardando: 4'));
    expect(mocks.toast.success).toHaveBeenCalledWith('Resumo de passagem de turno copiado.');
  });

  it('não inventa resumo ao abrir uma URL sem o snapshot da fila', () => {
    setup('/fila/passagem');

    expect(screen.getByRole('heading', { name: 'Resumo indisponível' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copiar resumo' })).not.toBeInTheDocument();
  });
});
