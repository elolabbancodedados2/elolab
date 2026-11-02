import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('@/pages/Salas', () => ({ default: () => <div>Conteúdo das salas</div> }));
vi.mock('@/pages/ListaEspera', () => ({ default: () => <div>Conteúdo da lista de espera</div> }));

import GestaoFluxo from '@/pages/GestaoFluxo';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="/gestao-fluxo" element={<GestaoFluxo />} /></Routes>
    </MemoryRouter>,
  );
}

describe('Gestão de salas e lista de espera', () => {
  it('abre Salas por padrão', async () => {
    renderAt('/gestao-fluxo');
    expect(await screen.findByText('Conteúdo das salas')).toBeInTheDocument();
    expect(screen.queryByText('Conteúdo da lista de espera')).not.toBeInTheDocument();
  });

  it('abre a Lista de Espera pelo link direto', async () => {
    renderAt('/gestao-fluxo?tab=espera');
    expect(screen.getByRole('tab', { name: 'Lista de espera' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('Conteúdo da lista de espera')).toBeInTheDocument();
  });
});
