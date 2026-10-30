import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fromMock, rpcMock, historyQuery, readCurrentMock, toastSuccess, toastError } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
  historyQuery: { select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn() },
  readCurrentMock: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: fromMock, rpc: rpcMock } }));
vi.mock('@/contexts/SupabaseAuthContext', () => ({ useSupabaseAuth: () => ({ user: { id: 'admin-teste', email: 'admin@teste.local' }, profile: { clinica_id: 'clinica-teste' } }) }));
vi.mock('@/lib/configClinica', () => ({ chaveDaClinica: (key: string) => key === 'config_clinica', lerConfigsClinicaComVersoes: readCurrentMock }));
vi.mock('@/lib/reautenticacao', () => ({ exigeReautenticacao: () => false }));
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: toastError } }));

import ConfiguracaoHistoricoPage from '@/pages/ConfiguracaoHistoricoPage';

function ReturnPage() {
  const location = useLocation();
  return <><h1>Configurações</h1><output>{`${location.pathname}${location.search}`}</output></>;
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([
    { path: '/configuracoes/historico-versoes', element: <ConfiguracaoHistoricoPage /> },
    { path: '/configuracoes', element: <ReturnPage /> },
  ], { initialEntries: ['/configuracoes/historico-versoes?chave=config_clinica&origem=clinica'] });
  return render(<QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>);
}

describe('ConfiguracaoHistoricoPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    historyQuery.select.mockReturnValue(historyQuery);
    historyQuery.eq.mockReturnValue(historyQuery);
    historyQuery.order.mockReturnValue(historyQuery);
    historyQuery.limit.mockResolvedValue({ data: [
      { id: 'versao-atual', valor: { nomeClinica: 'Clínica atual', telefone: '2222' }, criado_em: '2026-10-02T12:00:00Z', operacao: 'salvar', restaurada_de: null },
      { id: 'versao-antiga', valor: { nomeClinica: 'Clínica anterior', telefone: '1111' }, criado_em: '2026-10-01T12:00:00Z', operacao: 'salvar', restaurada_de: null },
    ], error: null });
    fromMock.mockReturnValue(historyQuery);
    readCurrentMock.mockResolvedValue({ configs: { config_clinica: { nomeClinica: 'Clínica atual', telefone: '2222' } }, updatedAtByKey: { config_clinica: 'versao-etag' } });
    rpcMock.mockResolvedValue({ error: null });
  });

  it('compara uma versão antes de restaurar e retorna à aba de origem', async () => {
    renderPage();
    expect(await screen.findByText('Clínica atual')).toBeInTheDocument();
    const versions = screen.getAllByRole('button', { name: /Alteração salva/ });
    fireEvent.click(versions[0]);
    expect(screen.getByText('A versão selecionada é igual à configuração atual.')).toBeInTheDocument();
    fireEvent.click(versions[1]);
    expect(await screen.findByText('Clínica anterior')).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar versão comparada' }));

    await waitFor(() => expect(rpcMock).toHaveBeenCalledWith('restaurar_configuracao_clinica_versao', {
      p_versao_id: 'versao-antiga',
      p_versao_esperada: 'versao-etag',
    }));
    expect(await screen.findByRole('heading', { name: 'Configurações' })).toBeInTheDocument();
    expect(screen.getByText('/configuracoes?tab=clinica')).toBeInTheDocument();
    expect(toastSuccess).toHaveBeenCalledWith('Versão restaurada e registrada no histórico.');
  });
});
