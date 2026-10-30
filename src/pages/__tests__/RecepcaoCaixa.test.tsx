import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ roles: ['financeiro'] as string[] }));

vi.mock('@/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => ({ profile: { roles: mocks.roles, role: mocks.roles[0] } }),
}));
vi.mock('../Recepcao', () => ({ default: () => <div>Recepção da equipe</div> }));
vi.mock('../CaixaDiario', () => ({ default: () => <div>Caixa da clínica</div> }));

import RecepcaoCaixa from '../RecepcaoCaixa';

describe('destinos separados de Recepção e Caixa Diário', () => {
  beforeEach(() => {
    mocks.roles = ['financeiro'];
  });

  it('redireciona o atalho legado do caixa para o destino próprio', () => {
    render(
      <MemoryRouter initialEntries={['/recepcao?tab=caixa']}>
        <Routes>
          <Route path="/recepcao" element={<RecepcaoCaixa />} />
          <Route path="/caixa-diario" element={<div>Caixa da clínica</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Caixa da clínica')).toBeInTheDocument();
    expect(screen.queryByText('Recepção da equipe')).not.toBeInTheDocument();
  });

  it('abre a Recepção sem exibir caixa na mesma tela', () => {
    mocks.roles = ['admin'];
    render(
      <MemoryRouter initialEntries={['/recepcao']}>
        <Routes><Route path="/recepcao" element={<RecepcaoCaixa />} /></Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Recepção da equipe')).toBeInTheDocument();
    expect(screen.queryByText('Caixa da clínica')).not.toBeInTheDocument();
  });
});
