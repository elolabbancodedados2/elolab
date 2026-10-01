import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';

const mocks = vi.hoisted(() => ({ from: vi.fn(), profile: { clinica_id: 'clinica-1' } }));

vi.mock('@/integrations/supabase/client', () => ({ supabase: mocks }));
vi.mock('@/contexts/SupabaseAuthContext', () => ({ useSupabaseAuth: () => ({ user: { id: 'usuario-1' }, profile: mocks.profile }) }));

import {
  buscarPacientes, redefinirDeteccaoColunasDeDigitos, useBuscaPacientes, type PacienteResumo,
} from '@/hooks/useBuscaPacientes';

const ERRO_COLUNA_INEXISTENTE = { code: '42703', message: 'column pacientes.cpf_digitos does not exist' };

/**
 * Consulta falsa de um banco ainda sem a migration 20261001240000: a primeira
 * página (com `cpf_digitos`) devolve 42703; as seguintes, `dados`.
 */
function consultaSemColunasDeDigitos(dados: PacienteResumo[]) {
  let chamadas = 0;
  const query = {
    select: vi.fn(() => query),
    or: vi.fn((_filtros: string) => query),
    order: vi.fn(() => query),
    range: vi.fn(async () => {
      chamadas += 1;
      return chamadas === 1 ? { data: null, error: ERRO_COLUNA_INEXISTENTE } : { data: dados, error: null };
    }),
  };
  return query;
}

describe('buscarPacientes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.profile.clinica_id = 'clinica-1';
    redefinirDeteccaoColunasDeDigitos();
  });

  it('continua paginando até achar o paciente após candidatos sem correspondência exata', async () => {
    const candidatosParecidos = Array.from({ length: 1000 }, (_, i): PacienteResumo => ({
      id: `candidato-${i}`,
      nome: `Jxyz ${i}`,
      nome_social: null,
      cpf: null,
      telefone: null,
      email: null,
      data_nascimento: null,
    }));
    const pacienteCorreto: PacienteResumo = {
      id: 'paciente-correto', nome: 'João Silva', nome_social: null,
      cpf: null, telefone: null, email: null, data_nascimento: null,
    };
    const range = vi.fn(async (inicio: number) => ({
      data: inicio === 0 ? candidatosParecidos : [pacienteCorreto],
      error: null,
    }));
    const query = {
      select: vi.fn(() => query),
      or: vi.fn((_filtros: string) => query),
      order: vi.fn(() => query),
      range,
      limit: vi.fn(() => query),
    };
    mocks.from.mockReturnValue(query);

    const resultado = await buscarPacientes('joao', 20);

    expect(resultado).toEqual({ pacientes: [pacienteCorreto], incompleta: false });
    expect(range).toHaveBeenCalledTimes(2);
    expect(range).toHaveBeenNthCalledWith(1, 0, 999);
    expect(range).toHaveBeenNthCalledWith(2, 1000, 1999);
  });

  it('sinaliza quando limita resultados encontrados para que a recepção refine a busca', async () => {
    const candidatos = Array.from({ length: 1000 }, (_, i): PacienteResumo => ({
      id: `ana-${i}`, nome: `Ana Silva ${i}`, nome_social: null,
      cpf: null, telefone: null, email: null, data_nascimento: null,
    }));
    const query = {
      select: vi.fn(() => query),
      or: vi.fn((_filtros: string) => query),
      order: vi.fn(() => query),
      range: vi.fn(async () => ({ data: candidatos, error: null })),
    };
    mocks.from.mockReturnValue(query);

    const resultado = await buscarPacientes('Ana', 2);

    expect(resultado.pacientes).toHaveLength(2);
    expect(resultado.incompleta).toBe(true);
    expect(query.range).toHaveBeenCalledOnce();
  });

  it('busca nome mesmo quando o cadastro tem espaços duplicados', async () => {
    const paciente: PacienteResumo = {
      id: 'paciente-maria', nome: 'Maria  Silva', nome_social: null,
      cpf: null, telefone: null, email: null, data_nascimento: null,
    };
    const query = {
      select: vi.fn(() => query),
      or: vi.fn((_filtros: string) => query),
      order: vi.fn(() => query),
      range: vi.fn(async () => ({ data: [paciente], error: null })),
    };
    mocks.from.mockReturnValue(query);

    const resultado = await buscarPacientes('Maria Silva');

    expect(query.or).toHaveBeenCalledWith(expect.stringContaining('nome.ilike.%m_r__%s_lv_%'));
    expect(resultado.pacientes).toEqual([paciente]);
  });

  it('busca dígitos contínuos nas colunas sem máscara', async () => {
    const paciente: PacienteResumo = {
      id: 'paciente-cpf', nome: 'João Silva', nome_social: null,
      cpf: '123.456.789-00', telefone: null, email: null, data_nascimento: null,
    };
    const query = {
      select: vi.fn(() => query),
      or: vi.fn((_filtros: string) => query),
      order: vi.fn(() => query),
      range: vi.fn(async () => ({ data: [paciente], error: null })),
    };
    mocks.from.mockReturnValue(query);

    const resultado = await buscarPacientes('456789');
    const filtros = query.or.mock.calls[0][0];

    expect(filtros).toContain('cpf_digitos.like.%456789%');
    expect(filtros).toContain('telefone_digitos.like.%456789%');
    expect(filtros).not.toContain('cpf.ilike');
    expect(filtros).not.toContain('%4%5%6%7%8%9%');
    expect(query.or).toHaveBeenCalledOnce();
    expect(resultado.pacientes).toEqual([paciente]);
  });

  it('acha telefone gravado num formato que nenhuma máscara cobre', async () => {
    const paciente: PacienteResumo = {
      id: 'paciente-ddi', nome: 'Rita Souza', nome_social: null,
      cpf: null, telefone: '+55 11 98888-7777', email: null, data_nascimento: null,
    };
    const query = {
      select: vi.fn(() => query),
      or: vi.fn((_filtros: string) => query),
      order: vi.fn(() => query),
      range: vi.fn(async () => ({ data: [paciente], error: null })),
    };
    mocks.from.mockReturnValue(query);

    const resultado = await buscarPacientes('11988887777');

    expect(query.or.mock.calls[0][0]).toContain('telefone_digitos.like.%11988887777%');
    expect(resultado.pacientes).toEqual([paciente]);
  });

  it('cai para as máscaras enquanto a migration das colunas não foi aplicada', async () => {
    const paciente: PacienteResumo = {
      id: 'paciente-cpf', nome: 'João Silva', nome_social: null,
      cpf: '123.456.789-00', telefone: null, email: null, data_nascimento: null,
    };
    const query = consultaSemColunasDeDigitos([paciente]);
    mocks.from.mockReturnValue(query);

    const resultado = await buscarPacientes('456789');

    expect(query.or).toHaveBeenCalledTimes(2);
    expect(query.or.mock.calls[0][0]).toContain('cpf_digitos.like.%456789%');
    expect(query.or.mock.calls[1][0]).toContain('cpf.ilike."%456.789%"');
    expect(query.or.mock.calls[1][0]).not.toContain('cpf_digitos');
    expect(resultado.pacientes).toEqual([paciente]);
  });

  it('lembra que as colunas não existem e não repete a tentativa a cada busca', async () => {
    const query = consultaSemColunasDeDigitos([]);
    mocks.from.mockReturnValue(query);

    await buscarPacientes('456789');
    await buscarPacientes('4567890');

    expect(query.or).toHaveBeenCalledTimes(3);
    expect(query.or.mock.calls[2][0]).not.toContain('cpf_digitos');
    expect(query.or.mock.calls[2][0]).toContain('cpf.ilike."%456.789-0%"');
  });

  it('propaga outros erros do banco sem cair para as máscaras', async () => {
    const query = {
      select: vi.fn(() => query),
      or: vi.fn((_filtros: string) => query),
      order: vi.fn(() => query),
      range: vi.fn(async () => ({ data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } })),
    };
    mocks.from.mockReturnValue(query);

    await expect(buscarPacientes('456789')).rejects.toMatchObject({ code: '57014' });
    expect(query.or).toHaveBeenCalledOnce();
  });

  it('sem as colunas, acha telefone gravado sem espaço depois do DDD', async () => {
    const paciente: PacienteResumo = {
      id: 'paciente-tel', nome: 'Rita Souza', nome_social: null,
      cpf: null, telefone: '(11)98888-7777', email: null, data_nascimento: null,
    };
    const query = consultaSemColunasDeDigitos([paciente]);
    mocks.from.mockReturnValue(query);

    const resultado = await buscarPacientes('11988887777');
    const filtros: string = query.or.mock.calls[1][0];

    // O trecho vai do primeiro ao último dígito da máscara; o "(" fica fora
    // e é coberto pelo `%` inicial.
    expect(filtros).toContain('telefone.ilike."%11)98888-7777%"');
    expect(filtros).toContain('telefone.ilike."%11 98888-7777%"');
    expect(resultado.pacientes).toEqual([paciente]);
  });

  it('sem as colunas, acha número local sem DDD gravado com hífen', async () => {
    const query = consultaSemColunasDeDigitos([]);
    mocks.from.mockReturnValue(query);

    await buscarPacientes('988887777');

    expect(query.or.mock.calls[1][0]).toContain('telefone.ilike."%98888-7777%"');
  });

  it('sem as colunas, não repete condições geradas por máscaras diferentes', async () => {
    const query = consultaSemColunasDeDigitos([]);
    mocks.from.mockReturnValue(query);

    await buscarPacientes('123');
    const condicoes = (query.or.mock.calls[1][0] as string).split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);

    expect(new Set(condicoes).size).toBe(condicoes.length);
  });

  it('não faz busca extra quando o termo inicial tem espaço nas pontas', async () => {
    const query = {
      select: vi.fn(() => query),
      or: vi.fn((_filtros: string) => query),
      order: vi.fn(() => query),
      range: vi.fn(async () => ({ data: [], error: null })),
    };
    mocks.from.mockReturnValue(query);

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
    const { result, unmount } = renderHook(() => useBuscaPacientes('  Ana  '), { wrapper });

    expect(result.current.isDebouncing).toBe(false);
    await waitFor(() => expect(result.current.data?.pacientes).toEqual([]));
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(query.range).toHaveBeenCalledTimes(1);
    unmount();
    client.clear();
  });

  it('não mantém dados da clínica anterior como placeholder ao trocar de clínica', async () => {
    const pacienteAntigo: PacienteResumo = {
      id: 'paciente-clinica-1', nome: 'Ana da Clínica 1', nome_social: null,
      cpf: null, telefone: null, email: null, data_nascimento: null,
    };
    let liberarSegundaBusca!: (value: { data: PacienteResumo[]; error: null }) => void;
    const segundaBusca = new Promise<{ data: PacienteResumo[]; error: null }>((resolve) => { liberarSegundaBusca = resolve; });
    let chamadas = 0;
    const query = {
      select: vi.fn(() => query),
      or: vi.fn((_filtros: string) => query),
      order: vi.fn(() => query),
      range: vi.fn(() => {
        chamadas += 1;
        return chamadas === 1
          ? Promise.resolve({ data: [pacienteAntigo], error: null })
          : segundaBusca;
      }),
    };
    mocks.from.mockReturnValue(query);

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
    const { result, rerender, unmount } = renderHook(() => useBuscaPacientes('Ana'), { wrapper });

    await waitFor(() => expect(result.current.data?.pacientes).toEqual([pacienteAntigo]));
    mocks.profile.clinica_id = 'clinica-2';
    rerender();
    await waitFor(() => expect(chamadas).toBe(2));
    expect(result.current.data).toBeUndefined();

    liberarSegundaBusca({ data: [], error: null });
    await waitFor(() => expect(result.current.data?.pacientes).toEqual([]));
    unmount();
    client.clear();
    mocks.profile.clinica_id = 'clinica-1';
  });
});
