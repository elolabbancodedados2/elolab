import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountSessionsPanel } from '../AccountSessionsPanel';

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: rpcMock } }));

const currentSession = {
  session_id: 'current-session-id-hidden',
  created_at: '2026-10-14T07:30:00.000Z',
  last_activity_at: '2026-10-14T08:00:00.000Z',
  user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
  is_current: true,
};

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AccountSessionsPanel />
    </QueryClientProvider>,
  );
}

describe('AccountSessionsPanel', () => {
  beforeEach(() => rpcMock.mockReset());

  it('shows the current device and approximate device label without exposing session IDs or IPs', async () => {
    rpcMock.mockResolvedValue({ data: [currentSession], error: null });
    renderPanel();

    expect(await screen.findByText('Edge · Windows')).toBeInTheDocument();
    expect(screen.getByText('Este dispositivo')).toBeInTheDocument();
    expect(document.querySelector('time')).toHaveAttribute('datetime', currentSession.last_activity_at);
    expect(screen.queryByText(currentSession.session_id)).not.toBeInTheDocument();
    expect(screen.queryByText(/\bIP\b|\b192\.0\.2\.1\b/i)).not.toBeInTheDocument();
  });

  it('distinguishes an empty session list', async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    renderPanel();

    expect(await screen.findByText('Nenhuma sessão ativa encontrada.')).toBeInTheDocument();
  });

  it('explains when the session list cannot be loaded', async () => {
    rpcMock.mockResolvedValue({ data: null, error: new Error('synthetic failure') });
    renderPanel();

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar suas sessões.');
  });

  it('refreshes the list on demand', async () => {
    rpcMock
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [currentSession], error: null });
    renderPanel();
    expect(await screen.findByText('Nenhuma sessão ativa encontrada.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Atualizar sessões' }));

    expect(await screen.findByText('Edge · Windows')).toBeInTheDocument();
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(2));
  });
});
