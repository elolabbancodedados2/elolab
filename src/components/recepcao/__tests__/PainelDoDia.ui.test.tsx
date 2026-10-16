import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: { eventos: [], atingiuLimite: false }, isLoading: false, isError: false, refetch: vi.fn() }),
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { PainelDoDia } from '../PainelDoDia';

const renderPanel = (overrides: Partial<React.ComponentProps<typeof PainelDoDia>> = {}) => {
  const onFiltrar = vi.fn();
  render(
    <PainelDoDia
      atendimentos={[]}
      clinicaId="clinic-1"
      hoje="2026-10-12"
      onFiltrar={onFiltrar}
      abaAtiva="todos"
      {...overrides}
    />,
  );
  return onFiltrar;
};

describe('PainelDoDia', () => {
  it('expõe filtros selecionados e acionáveis', () => {
    const onFiltrar = renderPanel({ abaAtiva: 'balcao' });
    const resumo = screen.getByRole('group', { name: 'Resumo de atendimento e recebimentos' });
    const faltaPagar = within(resumo).getByRole('button', { name: /Falta pagar/ });

    expect(faltaPagar).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(resumo).getByRole('button', { name: /Ainda não chegaram/ }));
    expect(onFiltrar).toHaveBeenCalledWith('checkin');
    expect(within(resumo).getByRole('button', { name: /Recebido líquido/ })).not.toHaveAttribute('aria-pressed');
  });

  it('não mostra zeros de atendimento antes de a agenda carregar', () => {
    renderPanel({ carregandoAtendimentos: true });
    const resumo = screen.getByRole('group', { name: 'Resumo de atendimento e recebimentos' });

    expect(resumo).toHaveAttribute('aria-busy', 'true');
    expect(within(resumo).getAllByText('…')).toHaveLength(6);
    expect(within(resumo).getAllByText('Carregando agenda e atendimento…')).toHaveLength(6);
  });

  it('oculta contagens incompletas quando a agenda ou fila falha', () => {
    renderPanel({ erroAtendimentos: true });
    const resumo = screen.getByRole('group', { name: 'Resumo de atendimento e recebimentos' });

    expect(within(resumo).getAllByText('—')).toHaveLength(6);
    expect(within(resumo).getAllByText('Não foi possível carregar os atendimentos')).toHaveLength(6);
  });

  it('oculta valores pendentes quando os lançamentos financeiros falham', () => {
    renderPanel({ erroFinanceiro: true });
    const resumo = screen.getByRole('group', { name: 'Resumo de atendimento e recebimentos' });

    expect(within(resumo).getByRole('button', { name: /Falta pagar/ })).toHaveTextContent('—');
    expect(within(resumo).getByRole('button', { name: /Devem o adicional/ })).toHaveTextContent('—');
    expect(within(resumo).getByText('Não foi possível carregar o saldo a receber do dia')).toBeInTheDocument();
  });
});
