import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  readFilters: [] as Array<[string, unknown]>,
  writeFilters: [] as Array<[string, unknown]>,
  updates: [] as Array<Record<string, unknown>>,
  audits: [] as Array<Record<string, unknown>>,
  pendingUpdateIds: [] as string[],
  roles: ['recepcao'] as string[],
}));

vi.mock('@/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => ({
    user: { id: 'staff-1' },
    profile: { id: 'staff-1', clinica_id: 'clinic-1' },
    isAdmin: () => mocks.roles.includes('admin'),
    hasRole: (role: string) => mocks.roles.includes(role),
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      if (table !== 'tarefas') throw new Error(`Tabela inesperada: ${table}`);
      let isUpdate = false;
      const chain: Record<string, (...args: any[]) => any> = {
        select: () => chain,
        eq: (column: string, value: unknown) => {
          (isUpdate ? mocks.writeFilters : mocks.readFilters).push([column, value]);
          return chain;
        },
        order: () => chain,
        range: async () => {
          for (const id of mocks.pendingUpdateIds) {
            const task = mocks.rows.find((row) => row.id === id);
            if (task) task.status = 'concluida';
          }
          mocks.pendingUpdateIds = [];
          return { data: mocks.rows, error: null };
        },
        update: (values: Record<string, unknown>) => {
          isUpdate = true;
          mocks.updates.push(values);
          return chain;
        },
        maybeSingle: async () => {
          const updatedId = String(mocks.writeFilters.find(([column]) => column === 'id')?.[1] || '');
          const task = mocks.rows.find((row) => row.id === updatedId);
          if (task) mocks.pendingUpdateIds.push(updatedId);
          return { data: task ? { id: updatedId } : null, error: null };
        },
      };
      return chain;
    },
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/auditTrail', () => ({ logAudit: async (entry: Record<string, unknown>) => { mocks.audits.push(entry); return true; } }));

import MinhaFilaTarefas from '../MinhaFilaTarefas';

const makeTask = (overrides: Record<string, unknown> = {}) => ({
  id: 'task-1', titulo: 'Confirmar retorno', descricao: 'Confirmar o horário da consulta', status: 'pendente',
  prioridade: 'alta', categoria: 'Agenda', data_vencimento: '2026-10-13', paciente_id: 'patient-1',
  updated_at: '2026-10-13T12:00:00Z', ...overrides,
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter><MinhaFilaTarefas /></MemoryRouter></QueryClientProvider>);
}

describe('Minha fila de trabalho', () => {
  beforeEach(() => {
    mocks.rows = [makeTask()];
    mocks.readFilters = [];
    mocks.writeFilters = [];
    mocks.updates = [];
    mocks.audits = [];
    mocks.pendingUpdateIds = [];
    mocks.roles = ['recepcao'];
  });

  it('consulta somente a clínica e as tarefas atribuídas à pessoa autenticada', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Minha fila de trabalho' })).toBeInTheDocument();
    expect(mocks.readFilters).toEqual(expect.arrayContaining([
      ['clinica_id', 'clinic-1'],
      ['responsavel_id', 'staff-1'],
    ]));
    expect(await screen.findByRole('link', { name: 'Abrir paciente' })).toHaveAttribute('href', '/pacientes?paciente=patient-1');
    expect(screen.getByRole('heading', { name: /Atrasadas/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Próxima tarefa' })).toBeInTheDocument();
    expect(screen.getAllByText('Confirmar retorno').length).toBeGreaterThan(0);
  });

  it('conclui usando clínica, responsável e versão carregada da tarefa', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Concluir tarefa Confirmar retorno' }));

    await waitFor(() => expect(mocks.updates).toEqual([{ status: 'concluida' }]));
    expect(mocks.writeFilters).toEqual(expect.arrayContaining([
      ['id', 'task-1'],
      ['clinica_id', 'clinic-1'],
      ['responsavel_id', 'staff-1'],
      ['updated_at', '2026-10-13T12:00:00Z'],
    ]));
    expect(mocks.audits).toEqual([{
      action: 'update',
      collection: 'tarefas',
      recordId: 'task-1',
      userId: 'staff-1',
      changes: [{ field: 'status', oldValue: 'pendente', newValue: 'concluida' }],
    }]);
    expect(await screen.findByText('Concluídas e canceladas')).toBeInTheDocument();
  });

  it('não abre o cadastro do paciente para perfis sem acesso à lista de pacientes', async () => {
    mocks.roles = ['financeiro'];
    renderPage();

    expect((await screen.findAllByText('Confirmar retorno')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: 'Abrir paciente' })).not.toBeInTheDocument();
    expect(screen.getByText('Paciente vinculado')).toBeInTheDocument();
  });

  it('abre a ficha do paciente vinculado à tarefa do médico', async () => {
    mocks.roles = ['medico'];
    renderPage();
    expect(await screen.findByRole('link', { name: 'Abrir paciente' })).toHaveAttribute('href', '/pacientes?paciente=patient-1');
  });

  it('diferencia fila sem atribuições da fila com tudo concluído', async () => {
    mocks.rows = [];
    const { unmount } = renderPage();
    expect(await screen.findByText('Sua fila está vazia')).toBeInTheDocument();

    unmount();
    mocks.rows = [makeTask({ status: 'concluida' })];
    renderPage();
    expect(await screen.findByText('Tudo em dia: suas atribuições estão concluídas ou canceladas.')).toBeInTheDocument();
  });
});
