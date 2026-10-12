import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { lerConfigComVersoes, salvarConfig, toast, medicosResult } = vi.hoisted(() => ({
  lerConfigComVersoes: vi.fn(),
  salvarConfig: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
  medicosResult: { current: { data: [], isLoading: false, isError: false, error: null } as any },
}));

vi.mock('@/lib/configClinica', () => ({
  lerConfigsClinica: lerConfigComVersoes,
  lerConfigsClinicaComVersoes: lerConfigComVersoes,
  salvarConfigClinica: salvarConfig,
}));
vi.mock('@/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => ({ user: { id: 'user-1' }, profile: { clinica_id: 'clinic-1' } }),
}));
vi.mock('@/hooks/useSupabaseData', () => ({ useMedicos: () => medicosResult.current }));
vi.mock('sonner', () => ({ toast }));

import { AgendamentoOnlineConfig } from './AgendamentoOnlineConfig';

function renderConfig() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <AgendamentoOnlineConfig />
    </QueryClientProvider>,
  );
  return { ...result, queryClient };
}

describe('Configuração do agendamento online', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    medicosResult.current = { data: [], isLoading: false, isError: false, error: null };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('bloqueia alterações e oferece nova tentativa quando a configuração não carrega', async () => {
    lerConfigComVersoes
      .mockRejectedValueOnce(new Error('network failed'))
      .mockResolvedValueOnce({ configs: { agendamento_online: { ativo: true, mensagem: 'Bem-vindo', dias_antecedencia: 14, medicos: [] } }, updatedAtByKey: { agendamento_online: '2026-01-01T00:00:00Z' } });
    renderConfig();

    expect(await screen.findByRole('heading', { name: 'Não foi possível carregar o agendamento online' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument();
    expect(salvarConfig).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByRole('button', { name: 'Salvar' })).toBeEnabled();
    expect(lerConfigComVersoes).toHaveBeenCalledTimes(2);
  });

  it('só permite salvar depois de carregar os dados atuais', async () => {
    lerConfigComVersoes.mockResolvedValue({ configs: { agendamento_online: { ativo: true, mensagem: 'Bem-vindo', dias_antecedencia: 14, medicos: [] } }, updatedAtByKey: { agendamento_online: '2026-01-01T00:00:00Z' } });
    renderConfig();

    const save = await screen.findByRole('button', { name: 'Salvar' });
    expect(save).toBeEnabled();
    fireEvent.click(save);

    await waitFor(() => expect(salvarConfig).toHaveBeenCalledWith({
      clinicaId: 'clinic-1',
      userId: 'user-1',
      chave: 'agendamento_online',
      valor: { ativo: true, mensagem: 'Bem-vindo', dias_antecedencia: 14, medicos: [] },
      expectedUpdatedAt: '2026-01-01T00:00:00Z',
    }));
  });

  it('blocks saving when the professionals list fails to load', async () => {
    lerConfigComVersoes.mockResolvedValue({ configs: { agendamento_online: { ativo: true, mensagem: '', dias_antecedencia: 30, medicos: [] } }, updatedAtByKey: { agendamento_online: '2026-01-01T00:00:00Z' } });
    medicosResult.current = { data: [], isLoading: false, isError: true, error: new Error('medicos unavailable'), refetch: vi.fn() };
    renderConfig();

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument();
    expect(salvarConfig).not.toHaveBeenCalled();
  });
});
