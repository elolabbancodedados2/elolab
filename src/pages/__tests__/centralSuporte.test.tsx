import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
  invalidateQueries: vi.fn(),
  insert: vi.fn(),
  from: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  auth: { user: { id: 'user-1' }, profile: { clinica_id: 'clinica-1' }, isPlatformAdmin: false },
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: mocks.useQuery,
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));
vi.mock('@/contexts/SupabaseAuthContext', () => ({ useSupabaseAuth: () => mocks.auth }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mocks.from } }));
vi.mock('sonner', () => ({ toast: { success: mocks.toastSuccess, error: mocks.toastError } }));

import CentralSuporte from '@/pages/CentralSuporte';

describe('CentralSuporte', () => {
  beforeEach(() => {
    mocks.auth = { user: { id: 'user-1' }, profile: { clinica_id: 'clinica-1' }, isPlatformAdmin: false };
    mocks.useQuery.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => ({
      data: queryKey[0] === 'support-tickets' ? [] : undefined,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    }));
    mocks.invalidateQueries.mockResolvedValue(undefined);
    mocks.insert.mockResolvedValue({ error: null });
    mocks.from.mockReturnValue({ insert: mocks.insert });
  });

  afterEach(() => vi.clearAllMocks());

  it('diferencia uma fila vazia de um carregamento ou erro', () => {
    render(<CentralSuporte />);
    expect(screen.getByText('Nenhum chamado por aqui')).toBeVisible();
    expect(screen.getByText('0 chamado(s)')).toBeVisible();
  });

  it('abre um chamado com os dados validados e a clínica atual', async () => {
    render(<CentralSuporte />);
    fireEvent.change(screen.getByLabelText('Resumo do problema'), { target: { value: 'Erro ao salvar paciente' } });
    fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'O botão salvar não conclui o cadastro.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Abrir chamado' }));

    await waitFor(() => expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      titulo: 'Erro ao salvar paciente',
      descricao: 'O botão salvar não conclui o cadastro.',
      clinica_id: 'clinica-1',
      solicitante_id: 'user-1',
    })));
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['support-tickets'] });
  });

  it('mostra uma ação de retry quando a fila falha', () => {
    const refetch = vi.fn();
    mocks.useQuery.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => ({
      data: undefined,
      error: new Error('network error'),
      isLoading: false,
      isError: queryKey[0] === 'support-tickets',
      refetch,
    }));
    render(<CentralSuporte />);

    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(refetch).toHaveBeenCalledOnce();
  });
});
