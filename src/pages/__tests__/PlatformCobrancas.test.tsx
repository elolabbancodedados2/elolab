import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PlatformCobrancas from '../PlatformCobrancas';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
vi.mock('@/hooks/usePlatformRealtime', () => ({ usePlatformRealtime: () => undefined }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const overview = {
  generated_at: '2026-10-24T12:00:00Z',
  metrics: { mrr: 0, ativas: 0, trials: 0, vencidas: 0, sem_assinatura: 0, webhooks_pendentes: 0, webhooks_falha_24h: 0, webhooks_sinalizados_24h: 2 },
  subscriptions: [],
  webhooks: [
    { id: 'w1', event_id: 'order:1', event_type: 'order', data_id: '1', processado: true, tentativas: 1, erro_mensagem: null, created_at: '2026-10-24T11:00:00Z', repeticoes: 2, ultima_repeticao_em: '2026-10-24T11:30:00Z', sinal_ordem: null },
    { id: 'w2', event_id: 'order:2', event_type: 'order', data_id: '2', processado: true, tentativas: 1, erro_mensagem: null, created_at: '2026-10-24T11:00:00Z', repeticoes: 0, ultima_repeticao_em: null, sinal_ordem: 'fora_de_ordem' },
  ],
};
const attempts = [
  { id: 'pix-1', origem: 'pix_periodo', referencia: 'pix-1', metodo: 'pix', valor: 499, status: 'em_processamento', detalhe: 'valor_divergente', criado_em: '2026-10-24T10:00:00Z', atualizado_em: null, clinica_nome: 'Clínica Sintética', dono_email: 'dono@example.test', divergente: true },
  { id: 'card-1', origem: 'cartao_assinatura', referencia: 'ref-1', metodo: 'cartao', valor: 379, status: 'cancelada', detalhe: 'recusado', criado_em: '2026-10-24T09:00:00Z', atualizado_em: null, clinica_nome: 'Clínica Sintética', dono_email: 'dono@example.test', divergente: false },
];

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<MemoryRouter><QueryClientProvider client={client}><PlatformCobrancas /></QueryClientProvider></MemoryRouter>);
}

describe('PlatformCobrancas — tentativas, webhooks e reconciliação', () => {
  beforeEach(() => {
    rpc.mockReset();
    rpc.mockImplementation(async (name: string) => {
      if (name === 'platform_billing_overview') return { data: overview, error: null };
      if (name === 'platform_checkout_attempts') return { data: attempts, error: null };
      if (name === 'platform_reconciliar_cobranca') return { data: { status_novo: 'pago' }, error: null };
      return { data: [], error: null };
    });
  });

  it('mostra cada tentativa com estado final e sinais de webhook repetido ou fora de ordem', async () => {
    renderPage();
    const tentativas = within(await screen.findByRole('region', { name: /tentativas de checkout/i }));
    expect(await tentativas.findByText('Cancelada')).toBeInTheDocument();
    expect(tentativas.getByText('Cartão recusado')).toBeInTheDocument();
    expect(tentativas.getByText('Divergente')).toBeInTheDocument();
    expect(await screen.findByText('Repetido 2×')).toBeInTheDocument();
    expect(screen.getByText('Fora de ordem')).toBeInTheDocument();
  });

  it('exige justificativa e registra a reconciliação pelo servidor', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /reconciliar/i }));
    const dialog = within(screen.getByRole('dialog'));
    const confirmar = dialog.getByRole('button', { name: /confirmar pagamento/i });
    expect(confirmar).toBeDisabled();
    fireEvent.change(dialog.getByLabelText(/justificativa/i), { target: { value: 'Comprovante conferido no banco' } });
    fireEvent.click(confirmar);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('platform_reconciliar_cobranca', {
      p_origem: 'pix_periodo', p_id: 'pix-1', p_resolucao: 'confirmar_pagamento', p_justificativa: 'Comprovante conferido no banco',
    }));
  });
});
