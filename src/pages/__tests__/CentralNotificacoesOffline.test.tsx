import { act, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('@/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => ({ user: { id: 'qa-user' }, profile: { clinica_id: 'qa-clinic' } }),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn().mockResolvedValue({ data: [], error: null }) },
}));

import CentralNotificacoes from '../CentralNotificacoes';

afterEach(() => onlineManager.setOnline(true));

it('só mostra notificações vazias depois de concluir a primeira leitura após reconectar', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  onlineManager.setOnline(false);
  const view = render(<QueryClientProvider client={client}><MemoryRouter><CentralNotificacoes /></MemoryRouter></QueryClientProvider>);
  try {
    expect(screen.queryByText('Nenhuma notificação por enquanto')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Notificações aguardando conexão');
    await act(async () => { onlineManager.setOnline(true); });
    expect(await screen.findByText('Nenhuma notificação por enquanto')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  } finally {
    view.unmount();
    client.clear();
  }
});
