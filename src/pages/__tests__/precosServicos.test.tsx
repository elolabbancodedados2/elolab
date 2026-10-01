import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../PrecosExames', () => ({ default: () => <div>Conteúdo da tabela de preços</div> }));
vi.mock('../TiposConsulta', () => ({ default: () => <div>Conteúdo dos tipos de consulta</div> }));

import PrecosServicos from '@/pages/PrecosServicos';

function CurrentSearch() {
  const location = useLocation();
  return <output data-testid="current-search">{location.search}</output>;
}

describe('PrecosServicos', () => {
  it('abre diretamente na aba de tipos de consulta e mantém a aba na URL', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/precos-servicos?tab=tipos']}>
        <Routes>
          <Route path="/precos-servicos" element={<PrecosServicos />} />
        </Routes>
        <CurrentSearch />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Conteúdo dos tipos de consulta')).toBeVisible();
    await user.click(screen.getByRole('tab', { name: /Tabela de Preços/ }));
    expect(await screen.findByText('Conteúdo da tabela de preços')).toBeVisible();
    expect(screen.getByTestId('current-search')).toHaveTextContent('tab=precos');
  });
});
