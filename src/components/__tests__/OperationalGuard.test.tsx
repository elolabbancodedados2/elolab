import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  auth: { user: { id: 'u1' } as { id: string } | null, isLoading: false, isPlatformAdmin: false },
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('@/contexts/SupabaseAuthContext', () => ({ useSupabaseAuth: () => mocks.auth }));
vi.mock('@/components/BrandLoadingScreen', () => ({
  BrandLoadingScreen: ({ message }: { message: string }) => <p>{message}</p>,
}));

import { OperationalGuard } from '../OperationalGuard';

const liberado = { data: { bloqueio_emergencial: false, somente_leitura: false, mensagem: null }, error: null };

function renderGuard(client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } })) {
  const utils = render(
    <QueryClientProvider client={client}>
      <OperationalGuard><p>Conteúdo do app</p></OperationalGuard>
    </QueryClientProvider>,
  );
  return { ...utils, client };
}

describe('OperationalGuard', () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.auth = { user: { id: 'u1' }, isLoading: false, isPlatformAdmin: false };
  });

  it('libera o app quando a plataforma está liberada', async () => {
    mocks.rpc.mockResolvedValue(liberado);
    renderGuard();
    expect(await screen.findByText('Conteúdo do app')).toBeInTheDocument();
  });

  it('repete a verificação antes de bloquear por falha temporária de rede', async () => {
    mocks.rpc
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(liberado);
    const { container } = renderGuard();
    expect(await screen.findByText('Conteúdo do app', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(mocks.rpc).toHaveBeenCalledTimes(3);
    expect(container).not.toHaveTextContent('Acesso temporariamente suspenso');
  }, 10_000);

  it('sem nenhuma verificação concluída, bloqueia e permite tentar de novo', async () => {
    mocks.rpc.mockRejectedValue(new TypeError('Failed to fetch'));
    renderGuard();
    expect(await screen.findByText('Acesso temporariamente suspenso', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByText('Conteúdo do app')).not.toBeInTheDocument();

    mocks.rpc.mockResolvedValue(liberado);
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText('Conteúdo do app')).toBeInTheDocument();
  }, 10_000);

  it('falha posterior mantém o último estado e mostra faixa no topo', async () => {
    mocks.rpc.mockResolvedValueOnce(liberado);
    const { client } = renderGuard();
    expect(await screen.findByText('Conteúdo do app')).toBeInTheDocument();

    mocks.rpc.mockRejectedValue(new TypeError('Failed to fetch'));
    await client.refetchQueries({ queryKey: ['estado-operacional'] }).catch(() => undefined);

    await waitFor(() => expect(screen.getByText(/Seguimos com a última verificação/)).toBeInTheDocument(), { timeout: 8000 });
    expect(screen.getByText('Conteúdo do app')).toBeInTheDocument();
    expect(screen.queryByText('Acesso temporariamente suspenso')).not.toBeInTheDocument();
  }, 10_000);

  it('bloqueio emergencial confirmado continua bloqueando', async () => {
    mocks.rpc.mockResolvedValue({ data: { bloqueio_emergencial: true, somente_leitura: false, mensagem: 'Manutenção' }, error: null });
    renderGuard();
    expect(await screen.findByText('Manutenção')).toBeInTheDocument();
    expect(screen.queryByText('Conteúdo do app')).not.toBeInTheDocument();
  });
});
