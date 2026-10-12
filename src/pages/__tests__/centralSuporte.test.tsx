import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
  invalidateQueries: vi.fn(),
  insert: vi.fn(),
  from: vi.fn(),
  queryConfigs: new Map<string, any>(),
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
    mocks.queryConfigs.clear();
    mocks.useQuery.mockImplementation((config: any) => {
      const queryKey = config.queryKey as unknown[];
      mocks.queryConfigs.set(String(queryKey[0]), config);
      return ({
      data: queryKey[0] === 'support-tickets' ? [] : undefined,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      });
    });
    mocks.invalidateQueries.mockResolvedValue(undefined);
    mocks.insert.mockResolvedValue({ error: null });
    mocks.from.mockReturnValue({ insert: mocks.insert });
  });

  afterEach(() => vi.clearAllMocks());

  it('diferencia uma fila vazia de um carregamento ou erro', () => {
    render(<CentralSuporte />);
    expect(screen.getByText('Nenhum chamado por aqui')).toBeVisible();
    expect(screen.getByText(/0 de 0 nesta página/)).toBeVisible();
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

  it('não consulta e-mail dos solicitantes quando a fila é da clínica', async () => {
    const rows = [{ id: 'ticket-1', clinica_id: 'clinica-1', solicitante_id: 'user-2', titulo: 'Ajuda', descricao: 'Problema', prioridade: 'normal', status: 'aberto', sla_limite: '2099-01-01T00:00:00Z', primeira_resposta_em: null, created_at: '2026-01-01T00:00:00Z', categoria: 'duvida' }];
    const ticketBuilder: any = {
      select: vi.fn(() => ticketBuilder), order: vi.fn(() => ticketBuilder),
      range: vi.fn().mockResolvedValue({ data: rows, error: null, count: 1 }),
    };
    const clinicBuilder: any = { select: vi.fn(() => clinicBuilder), in: vi.fn().mockResolvedValue({ data: [{ id: 'clinica-1', nome: 'Clínica' }], error: null }) };
    const profileBuilder: any = { select: vi.fn(() => profileBuilder), in: vi.fn().mockResolvedValue({ data: [{ id: 'user-2', nome: 'Solicitante' }], error: null }) };
    mocks.from.mockImplementation((table: string) => table === 'support_tickets' ? ticketBuilder : table === 'clinicas' ? clinicBuilder : profileBuilder);
    render(<CentralSuporte />);

    await mocks.queryConfigs.get('support-tickets').queryFn();

    expect(profileBuilder.select).toHaveBeenCalledWith('id,nome');
  });

  it('mantém e-mail disponível para a equipe da plataforma', async () => {
    mocks.auth = { user: { id: 'platform-1' }, profile: { clinica_id: null }, isPlatformAdmin: true };
    const ticketBuilder: any = {
      select: vi.fn(() => ticketBuilder), order: vi.fn(() => ticketBuilder),
      range: vi.fn().mockResolvedValue({ data: [{ id: 'ticket-1', clinica_id: 'clinica-1', solicitante_id: 'user-2', titulo: 'Ajuda', descricao: 'Problema', prioridade: 'normal', status: 'aberto', sla_limite: '2099-01-01T00:00:00Z', primeira_resposta_em: null, created_at: '2026-01-01T00:00:00Z', categoria: 'duvida' }], error: null, count: 1 }),
    };
    const clinicBuilder: any = { select: vi.fn(() => clinicBuilder), in: vi.fn().mockResolvedValue({ data: [{ id: 'clinica-1', nome: 'Clínica' }], error: null }) };
    const profileBuilder: any = { select: vi.fn(() => profileBuilder), in: vi.fn().mockResolvedValue({ data: [{ id: 'user-2', nome: 'Solicitante', email: 'solicitante@example.com' }], error: null }) };
    mocks.from.mockImplementation((table: string) => table === 'support_tickets' ? ticketBuilder : table === 'clinicas' ? clinicBuilder : profileBuilder);
    render(<CentralSuporte />);

    await mocks.queryConfigs.get('support-tickets').queryFn();

    expect(profileBuilder.select).toHaveBeenCalledWith('id,nome,email');
  });
});
