import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';

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

function LocationStateProbe() {
  const location = useLocation();
  return <output data-testid="support-route-state">{JSON.stringify({ pathname: location.pathname, state: location.state })}</output>;
}

function renderCentral(state?: unknown) {
  return render(<MemoryRouter initialEntries={[{ pathname: '/suporte', state }]}><CentralSuporte /><LocationStateProbe /></MemoryRouter>);
}

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
    renderCentral();
    expect(screen.getByText('Nenhum chamado por aqui')).toBeVisible();
    expect(screen.getByText(/Exibindo 0–0 de 0 chamados/)).toBeVisible();
  });

  it('busca em toda a fila no servidor e remove sintaxe de filtro do texto', async () => {
    const ticketBuilder: any = {
      select: vi.fn(() => ticketBuilder),
      eq: vi.fn(() => ticketBuilder),
      or: vi.fn(() => ticketBuilder),
      order: vi.fn(() => ticketBuilder),
      range: vi.fn().mockResolvedValue({ data: [], error: null, count: 0 }),
    };
    const relatedBuilder: any = { select: vi.fn(() => relatedBuilder), in: vi.fn().mockResolvedValue({ data: [], error: null }) };
    mocks.from.mockImplementation((table: string) => table === 'support_tickets' ? ticketBuilder : relatedBuilder);
    renderCentral();

    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar no título ou na descrição de todos os chamados' }), {
      target: { value: 'falha (scanner), %' },
    });
    await waitFor(() => {
      const key = mocks.queryConfigs.get('support-tickets').queryKey;
      if (!key.includes('falha scanner')) throw new Error(`query key: ${JSON.stringify(key)}`);
    });
    const config = mocks.queryConfigs.get('support-tickets');
    await config.queryFn();
    expect(ticketBuilder.or).toHaveBeenCalledWith('titulo.ilike.%falha scanner%,descricao.ilike.%falha scanner%');
    expect(ticketBuilder.range).toHaveBeenCalledWith(0, 99);

  });

  it('navega para a página própria e preserva os filtros e a página da fila', async () => {
    const filters = { busca: 'Impressora', buscaAplicada: 'Impressora', status: 'aberto', prioridade: 'alta', pagina: 2 };
    mocks.useQuery.mockImplementation((config: any) => {
      mocks.queryConfigs.set(String(config.queryKey[0]), config);
      return { data: config.queryKey[0] === 'support-tickets' ? { items: [], total: 301 } : undefined, isLoading: false, isError: false, refetch: vi.fn() };
    });
    renderCentral({ supportFilters: filters });
    await waitFor(() => expect(mocks.queryConfigs.get('support-tickets').queryKey).toEqual(expect.arrayContaining(['Impressora', 'aberto', 'alta', 2])));
    expect(screen.getByText('Página 3 de 4')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir chamado' }));
    const routeState = JSON.parse(screen.getByTestId('support-route-state').textContent || '{}');
    expect(routeState).toEqual({
      pathname: '/suporte/novo',
      state: { supportReturnTo: '/suporte', supportReturnState: { supportFilters: filters } },
    });
  });

  it('mantém a ação de criação disponível para a clínica atual', async () => {
    renderCentral();
    expect(screen.getByRole('button', { name: 'Abrir chamado' })).toBeVisible();
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
    renderCentral();

    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('mantem o rascunho associado ao chamado correto ao alternar a selecao', () => {
    const rows = [
      { id: 'ticket-1', clinica_id: 'clinica-1', solicitante_id: 'user-2', titulo: 'Erro na agenda', descricao: 'Problema na agenda', prioridade: 'normal', status: 'aberto', sla_limite: '2099-01-01T00:00:00Z', primeira_resposta_em: null, created_at: '2026-01-02T00:00:00Z', categoria: 'duvida', clinica_nome: 'Clinica', solicitante_nome: 'Solicitante', solicitante_email: null },
      { id: 'ticket-2', clinica_id: 'clinica-1', solicitante_id: 'user-2', titulo: 'Duvida sobre pacientes', descricao: 'Problema no cadastro', prioridade: 'normal', status: 'aberto', sla_limite: '2099-01-01T00:00:00Z', primeira_resposta_em: null, created_at: '2026-01-01T00:00:00Z', categoria: 'duvida', clinica_nome: 'Clinica', solicitante_nome: 'Solicitante', solicitante_email: null },
    ];
    mocks.useQuery.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => ({
      data: queryKey[0] === 'support-tickets' ? { items: rows, total: rows.length } : [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    }));
    renderCentral();

    fireEvent.click(screen.getByRole('button', { name: /Erro na agenda/ }));
    fireEvent.change(screen.getByLabelText('Responder'), { target: { value: 'Resposta para a agenda' } });
    fireEvent.click(screen.getByRole('button', { name: /sobre pacientes/ }));
    expect(screen.getByLabelText('Responder')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('Responder'), { target: { value: 'Resposta para pacientes' } });
    fireEvent.click(screen.getByRole('button', { name: /Erro na agenda/ }));

    expect(screen.getByLabelText('Responder')).toHaveValue('Resposta para a agenda');
    fireEvent.click(screen.getByRole('button', { name: /sobre pacientes/ }));
    expect(screen.getByLabelText('Responder')).toHaveValue('Resposta para pacientes');
  });

  it('filtra notas internas na consulta feita pela clínica', async () => {
    const ticket = { id: 'ticket-1', clinica_id: 'clinica-1', solicitante_id: 'user-2', titulo: 'Ajuda', descricao: 'Problema', prioridade: 'normal', status: 'aberto', sla_limite: '2099-01-01T00:00:00Z', primeira_resposta_em: null, created_at: '2026-01-01T00:00:00Z', categoria: 'duvida', clinica_nome: 'Clínica', solicitante_nome: 'Solicitante', solicitante_email: null };
    const messagesBuilder: any = {
      select: vi.fn(() => messagesBuilder),
      eq: vi.fn(() => messagesBuilder),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    mocks.useQuery.mockImplementation((config: { queryKey: unknown[] }) => {
      mocks.queryConfigs.set(String(config.queryKey[0]), config);
      return {
        data: config.queryKey[0] === 'support-tickets' ? { items: [ticket], total: 1 } : [],
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      };
    });
    mocks.from.mockImplementation((table: string) => table === 'support_ticket_messages' ? messagesBuilder : { select: vi.fn() });
    renderCentral();

    fireEvent.click(screen.getByRole('button', { name: /Ajuda/ }));
    const messagesQuery = mocks.queryConfigs.get('support-messages');
    expect(messagesQuery.queryKey).toContain(false);
    await messagesQuery.queryFn();

    expect(messagesBuilder.eq).toHaveBeenCalledWith('ticket_id', 'ticket-1');
    expect(messagesBuilder.eq).toHaveBeenCalledWith('interno', false);
  });

  it('mantém notas internas na consulta feita pela plataforma', async () => {
    mocks.auth = { user: { id: 'platform-1' }, profile: { clinica_id: null }, isPlatformAdmin: true };
    const ticket = { id: 'ticket-1', clinica_id: 'clinica-1', solicitante_id: 'user-2', titulo: 'Ajuda', descricao: 'Problema', prioridade: 'normal', status: 'aberto', sla_limite: '2099-01-01T00:00:00Z', primeira_resposta_em: null, created_at: '2026-01-01T00:00:00Z', categoria: 'duvida', clinica_nome: 'Clínica', solicitante_nome: 'Solicitante', solicitante_email: 'solicitante@example.com' };
    const messagesBuilder: any = {
      select: vi.fn(() => messagesBuilder),
      eq: vi.fn(() => messagesBuilder),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    mocks.useQuery.mockImplementation((config: { queryKey: unknown[] }) => {
      mocks.queryConfigs.set(String(config.queryKey[0]), config);
      return {
        data: config.queryKey[0] === 'support-tickets' ? { items: [ticket], total: 1 } : [],
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      };
    });
    mocks.from.mockImplementation((table: string) => table === 'support_ticket_messages' ? messagesBuilder : { select: vi.fn() });
    renderCentral();

    fireEvent.click(screen.getByRole('button', { name: /Ajuda/ }));
    const messagesQuery = mocks.queryConfigs.get('support-messages');
    expect(messagesQuery.queryKey).toContain(true);
    await messagesQuery.queryFn();

    expect(messagesBuilder.eq).toHaveBeenCalledWith('ticket_id', 'ticket-1');
    expect(messagesBuilder.eq).not.toHaveBeenCalledWith('interno', false);
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
    renderCentral();

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
    renderCentral();

    await mocks.queryConfigs.get('support-tickets').queryFn();

    expect(profileBuilder.select).toHaveBeenCalledWith('id,nome,email');
  });
});
