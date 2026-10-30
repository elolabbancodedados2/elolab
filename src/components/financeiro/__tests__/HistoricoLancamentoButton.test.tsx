import { readFileSync } from 'node:fs';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { HistoricoLancamentoButton } from '../HistoricoLancamentoButton';
import { formatarValorTrilha } from '@/lib/trilhaLancamento';

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location-state">{JSON.stringify({ pathname: location.pathname, search: location.search, state: location.state })}</output>;
}

describe('trilha de alterações do lançamento', () => {
  it('formata vencimento, valor e classificação', () => {
    expect(formatarValorTrilha('data_vencimento', '2026-10-05')).toBe('05/10/2026');
    expect(formatarValorTrilha('valor', '1234.5')).toMatch(/^R\$\s1\.234,50$/);
    expect(formatarValorTrilha('categoria', 'aluguel', { aluguel: 'Aluguel' })).toBe('Aluguel');
    expect(formatarValorTrilha('centro_custo', null)).toBe('—');
  });

  it('abre uma página própria e preserva o retorno à lista e os rótulos', () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/contas', search: '?tab=pagar', state: { filtro: 'atrasadas' } }]}>
        <HistoricoLancamentoButton lancamentoId="l1" descricao="Aluguel" rotulos={{ aluguel: 'Aluguel' }} restoreSearchTerm="Luz" />
        <LocationProbe />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Histórico de alterações de Aluguel' })).toHaveAttribute('href', '/contas/pagar/l1/historico');
    fireEvent.click(screen.getByRole('link', { name: 'Histórico de alterações de Aluguel' }));
    expect(JSON.parse(screen.getByTestId('location-state').textContent || '{}')).toEqual({
      pathname: '/contas/pagar/l1/historico',
      search: '',
      state: { returnTo: '/contas?tab=pagar', returnState: { filtro: 'atrasadas', restoreSearchTerm: 'Luz' }, rotulos: { aluguel: 'Aluguel' } },
    });
  });

  it('migration expõe só os quatro campos do lançamento da clínica a quem tem acesso financeiro', () => {
    const sql = readFileSync('supabase/migrations/20261024133000_trilha_alteracoes_lancamento.sql', 'utf8');
    expect(sql).toMatch(/can_access_financial\(auth\.uid\(\)\)/);
    expect(sql).toMatch(/l\.clinica_id = v_clinica/);
    expect(sql).toMatch(/c\.key IN \('data_vencimento', 'valor', 'categoria', 'centro_custo'\)/);
  });
});
