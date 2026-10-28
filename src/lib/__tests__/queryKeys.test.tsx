import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ampliarFiltroLegado,
  chavePertenceAClinica,
  filtroSomenteLegado,
  instalarCompatibilidadeTabelas,
  prefixoTabela,
  queryKeys,
} from '@/lib/queryKeys';

const mocks = vi.hoisted(() => ({
  auth: {
    user: { id: 'user-1' } as { id: string } | null,
    profile: { clinica_id: 'clinica-a', roles: ['medico'] as string[] },
    hasRole: (role: string) => role === 'medico',
    isAdmin: () => false,
  },
  rpc: vi.fn(),
}));

vi.mock('@/contexts/SupabaseAuthContext', () => ({ useSupabaseAuth: () => mocks.auth }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }));

import { useCurrentMedico } from '@/hooks/useCurrentMedico';

afterEach(() => {
  vi.clearAllMocks();
  mocks.auth.user = { id: 'user-1' };
  mocks.auth.profile = { clinica_id: 'clinica-a', roles: ['medico'] };
});

describe('queryKeys', () => {
  it('coloca clinica_id como primeiro segmento de todas as chaves do domínio', () => {
    const chaves = [
      queryKeys.clinica('c1'),
      queryKeys.agenda.todos('c1'),
      queryKeys.agenda.reagendar('c1', 'ag-1'),
      queryKeys.agenda.expediente('c1', 2, ['m1', 'm2']),
      queryKeys.agenda.ultimoAtendimento('c1', 'p1', 'ag-1'),
      queryKeys.medicoAtual('c1', 'u1'),
      queryKeys.pacienteResumo('c1', 'u1', 'p1'),
      queryKeys.tabela.todos('c1', 'pacientes'),
      queryKeys.tabela.consulta('c1', 'pacientes', 'u1', { limit: 10 }),
    ];
    for (const chave of chaves) {
      expect(chave[0]).toBe('c1');
      expect(chavePertenceAClinica(chave, 'c1')).toBe(true);
      expect(chavePertenceAClinica(chave, 'c2')).toBe(false);
    }
  });

  it('normaliza ausência de clínica e de ids para null', () => {
    expect(queryKeys.agenda.reagendar(undefined, undefined)).toEqual([null, 'agenda', 'reagendar', null]);
    expect(queryKeys.agenda.ultimoAtendimento(null, undefined, undefined)).toEqual([null, 'agenda', 'ultimo-atendimento', null, null]);
  });

  it('gera chaves diferentes para a mesma consulta em clínicas diferentes', () => {
    expect(queryKeys.agenda.expediente('c1', 1, ['m1'])).not.toEqual(queryKeys.agenda.expediente('c2', 1, ['m1']));
  });

  it('agrupa a agenda sob um prefixo comum da clínica', () => {
    const todos = queryKeys.agenda.todos('c1');
    const detalhe = queryKeys.agenda.reagendar('c1', 'ag-1');
    expect(detalhe.slice(0, todos.length)).toEqual([...todos]);
  });

  it('mantém o prefixo legado por tabela para as consultas genéricas', () => {
    expect(prefixoTabela('agendamentos')).toEqual(['agendamentos']);
    expect(chavePertenceAClinica(['agendamentos', 'u1', 'c1', {}], 'c1')).toBe(false);
  });
});

describe('compatibilidade do prefixo legado por tabela', () => {
  const novoCliente = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const semear = (client: QueryClient) => {
    const chaves = {
      novaA: queryKeys.tabela.consulta('c1', 'pacientes', 'u1', { limit: 10 }),
      novaB: queryKeys.tabela.consulta('c2', 'pacientes', 'u2', null),
      outraTabela: queryKeys.tabela.consulta('c1', 'medicos', 'u1', null),
      legado: ['pacientes', 'busca', 'x'],
      agenda: queryKeys.agenda.todos('c1'),
    };
    for (const chave of Object.values(chaves)) client.setQueryData(chave, ['dado']);
    return chaves;
  };
  const invalidadas = (client: QueryClient) =>
    client.getQueryCache().getAll().filter((q) => q.state.isInvalidated).map((q) => q.queryKey);

  it('faz o prefixo [tabela] alcançar as chaves novas e as legadas, sem tocar outras tabelas', async () => {
    const client = novoCliente();
    instalarCompatibilidadeTabelas(client);
    const chaves = semear(client);
    await client.invalidateQueries({ queryKey: prefixoTabela('pacientes') });
    expect(invalidadas(client)).toEqual(expect.arrayContaining([chaves.novaA, chaves.novaB, chaves.legado]));
    expect(invalidadas(client)).toHaveLength(3);
    client.clear();
  });

  it('invalida só a clínica informada pela chave da fábrica', async () => {
    const client = novoCliente();
    instalarCompatibilidadeTabelas(client);
    const chaves = semear(client);
    await client.invalidateQueries({ queryKey: queryKeys.tabela.todos('c1', 'pacientes') });
    expect(invalidadas(client)).toEqual([chaves.novaA]);
    client.clear();
  });

  it('o filtro somente legado não alcança as chaves da fábrica', async () => {
    const client = novoCliente();
    instalarCompatibilidadeTabelas(client);
    const chaves = semear(client);
    await client.invalidateQueries(filtroSomenteLegado('pacientes'));
    expect(invalidadas(client)).toEqual([chaves.legado]);
    client.clear();
  });

  it('também vale para removeQueries e é idempotente', () => {
    const client = novoCliente();
    instalarCompatibilidadeTabelas(client);
    instalarCompatibilidadeTabelas(client);
    const chaves = semear(client);
    client.removeQueries({ queryKey: ['pacientes'] });
    const restantes = client.getQueryCache().getAll().map((q) => q.queryKey);
    expect(restantes).toEqual(expect.arrayContaining([chaves.outraTabela, chaves.agenda]));
    expect(restantes).toHaveLength(2);
    client.clear();
  });

  it('mantém filtros exatos, com predicate ou ausentes como estão', () => {
    const exato = { queryKey: ['pacientes'], exact: true };
    const comPredicate = { queryKey: ['pacientes'], predicate: () => true };
    expect(ampliarFiltroLegado(exato)).toBe(exato);
    expect(ampliarFiltroLegado(comPredicate)).toBe(comPredicate);
    expect(ampliarFiltroLegado(undefined)).toBeUndefined();
  });

  it('passa o filtro original adiante quando nenhuma chave nova seria alcançada', () => {
    const client = novoCliente();
    const espiao = vi.spyOn(client, 'invalidateQueries');
    instalarCompatibilidadeTabelas(client);
    void client.invalidateQueries({ queryKey: ['platform-billing-overview'] });
    expect(espiao).toHaveBeenCalledWith({ queryKey: ['platform-billing-overview'] });
    client.clear();
  });
});

describe('troca de clínica', () => {
  it('não mostra o médico da clínica anterior enquanto a nova consulta carrega', async () => {
    let liberarB!: (r: { data: Array<{ id: string }>; error: null }) => void;
    const respostaB = new Promise<{ data: Array<{ id: string }>; error: null }>((resolve) => { liberarB = resolve; });
    mocks.rpc.mockImplementation(() => mocks.auth.profile.clinica_id === 'clinica-a'
      ? Promise.resolve({ data: [{ id: 'medico-a' }], error: null })
      : respostaB);

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
    const { result, rerender } = renderHook(() => useCurrentMedico(), { wrapper });

    await waitFor(() => expect(result.current.medicoId).toBe('medico-a'));
    mocks.auth.profile = { clinica_id: 'clinica-b', roles: ['medico'] };
    rerender();

    expect(result.current.medicoId).toBeNull();
    liberarB({ data: [{ id: 'medico-b' }], error: null });
    await waitFor(() => expect(result.current.medicoId).toBe('medico-b'));

    const chaves = client.getQueryCache().getAll().map((q) => q.queryKey);
    expect(chaves.every((k) => chavePertenceAClinica(k, 'clinica-a') || chavePertenceAClinica(k, 'clinica-b'))).toBe(true);
    client.clear();
  });
});
