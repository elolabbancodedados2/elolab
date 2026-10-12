import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('../Medicos', () => ({ default: () => <div>Conteúdo do corpo clínico</div> }));
vi.mock('../Funcionarios', () => ({ default: () => <div>Conteúdo dos funcionários</div> }));
vi.mock('@/components/ConvitesList', () => ({ ConvitesList: () => <div>Conteúdo dos convites</div> }));

import Equipe from '../Equipe';

function CurrentLocation() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

describe('Equipe', () => {
  it('nomeia para leitor de tela o controle que limpa a especialidade do médico', () => {
    const source = readFileSync('src/pages/Medicos.tsx', 'utf8');
    expect(source).toMatch(/<button[^>]*aria-label="Limpar especialidade"[^>]*>[\s\S]*?<X className="h-4 w-4" \/>/);
  });

  it('abre a aba indicada pela URL e mantém a navegação sincronizada com a aba', async () => {
    render(
      <MemoryRouter initialEntries={['/equipe?aba=convites']}>
        <CurrentLocation />
        <Equipe />
      </MemoryRouter>,
    );

    expect(screen.getByRole('tab', { name: 'Convites' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('Conteúdo dos convites')).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('tab', { name: /Funcionários/ }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/equipe?aba=funcionarios'));
    expect(screen.getByRole('tab', { name: /Funcionários/ })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('Conteúdo dos funcionários')).toBeInTheDocument();
  });
});
