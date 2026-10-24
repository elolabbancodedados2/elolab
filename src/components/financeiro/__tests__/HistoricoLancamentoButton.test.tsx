import { readFileSync } from 'node:fs';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));

import { HistoricoLancamentoButton } from '../HistoricoLancamentoButton';
import { formatarValorTrilha } from '@/lib/trilhaLancamento';

describe('trilha de alterações do lançamento', () => {
  it('formata vencimento, valor e classificação', () => {
    expect(formatarValorTrilha('data_vencimento', '2026-10-05')).toBe('05/10/2026');
    expect(formatarValorTrilha('valor', '1234.5')).toMatch(/^R\$\s1\.234,50$/);
    expect(formatarValorTrilha('categoria', 'aluguel', { aluguel: 'Aluguel' })).toBe('Aluguel');
    expect(formatarValorTrilha('centro_custo', null)).toBe('—');
  });

  it('abre a trilha sob demanda e mostra autor, data, antes e depois', async () => {
    rpc.mockResolvedValue({ data: [
      { alterado_em: '2026-10-20T13:00:00Z', alterado_por_nome: 'Bruno', campo: 'valor', valor_anterior: '100', valor_novo: '120' },
    ], error: null });
    render(<QueryClientProvider client={new QueryClient()}><HistoricoLancamentoButton lancamentoId="l1" descricao="Aluguel" /></QueryClientProvider>);
    expect(rpc).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Histórico de alterações de Aluguel' }));
    expect(await screen.findByText('Bruno')).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith('historico_alteracoes_lancamento', { p_lancamento_id: 'l1' });
    expect(screen.getByText('Valor')).toBeInTheDocument();
    expect(screen.getByText(/R\$\s100,00/)).toBeInTheDocument();
    expect(screen.getByText(/R\$\s120,00/)).toBeInTheDocument();
  });

  it('migration expõe só os quatro campos do lançamento da clínica a quem tem acesso financeiro', () => {
    const sql = readFileSync('supabase/migrations/20261024133000_trilha_alteracoes_lancamento.sql', 'utf8');
    expect(sql).toMatch(/can_access_financial\(auth\.uid\(\)\)/);
    expect(sql).toMatch(/l\.clinica_id = v_clinica/);
    expect(sql).toMatch(/c\.key IN \('data_vencimento', 'valor', 'categoria', 'centro_custo'\)/);
  });
});
