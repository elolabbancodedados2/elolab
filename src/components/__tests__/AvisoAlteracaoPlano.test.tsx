import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { AvisoAlteracaoPlano } from '../AvisoAlteracaoPlano';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));

function renderAviso() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><AvisoAlteracaoPlano /></QueryClientProvider>);
}

describe('AvisoAlteracaoPlano', () => {
  it('explica a mudança de preço e limite e quando ela afeta a conta', async () => {
    rpc.mockResolvedValue({
      data: [{
        id: 'n1', plano_nome: 'EloLab Ultra', alterado_em: '2026-10-20T12:00:00Z',
        campos: { valor: { antes: 499, depois: 549 }, max_medicos: { antes: 3, depois: 2 } },
        efeito_preco: 'proximo_periodo', vigencia_preco: '2026-11-15T12:00:00Z',
      }],
      error: null,
    });
    renderAviso();

    const aviso = await screen.findByRole('status');
    expect(rpc).toHaveBeenCalledWith('avisos_alteracao_plano');
    expect(aviso).toHaveTextContent(/preço: de R\$\s*499,00 para R\$\s*549,00/i);
    expect(aviso).toHaveTextContent(/médicos: de 3 para 2/i);
    expect(aviso).toHaveTextContent(`O novo preço vale a partir do próximo período, depois de ${new Date('2026-11-15T12:00:00Z').toLocaleDateString('pt-BR')}`);
    expect(aviso).toHaveTextContent(/limites valem desde/i);
  });

  it('não mostra nada sem alteração recente', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const { container } = renderAviso();
    await vi.waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
