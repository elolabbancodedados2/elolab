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

describe('abas de Recepção e caixa por perfil', () => {
  beforeEach(() => {
    mocks.roles = ['financeiro'];
  });

  it('mantém o perfil financeiro na aba de caixa mesmo se pedir recepção pela URL', () => {
    render(
      <MemoryRouter initialEntries={['/recepcao?tab=recepcao']}>
        <Routes><Route path="/recepcao" element={<RecepcaoCaixa />} /></Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Caixa da clínica')).toBeInTheDocument();
    expect(screen.queryByText('Recepção da equipe')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Recepção' })).not.toBeInTheDocument();
  });

  it('oferece as duas abas para administração e abre recepção por padrão', () => {
    mocks.roles = ['admin'];
    render(
      <MemoryRouter initialEntries={['/recepcao']}>
        <Routes><Route path="/recepcao" element={<RecepcaoCaixa />} /></Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('tab', { name: /Recepção/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Caixa Diário/ })).toBeInTheDocument();
    expect(screen.getByText('Recepção da equipe')).toBeInTheDocument();
  });
});
