import { describe, expect, it, vi } from 'vitest';
import {
  buscarCandidatosPorCpf,
  cpfValido,
  decidirVinculoPaciente,
  normalizarDataNascimento,
  type CandidatoPaciente,
  type DbIdentificacao,
} from '../../../supabase/functions/_shared/identificacaoPaciente';

const HOJE = '2026-10-27';

describe('normalizarDataNascimento', () => {
  it('aceita o formato do formulário e o digitado no WhatsApp', () => {
    expect(normalizarDataNascimento('1990-05-31', HOJE)).toBe('1990-05-31');
    expect(normalizarDataNascimento('31/05/1990', HOJE)).toBe('1990-05-31');
    expect(normalizarDataNascimento(' 31.05.1990 ', HOJE)).toBe('1990-05-31');
  });

  it('recusa data inexistente, futura, muito antiga ou vazia', () => {
    expect(normalizarDataNascimento('31/02/1990', HOJE)).toBeNull();
    expect(normalizarDataNascimento('2026-10-28', HOJE)).toBeNull();
    expect(normalizarDataNascimento('1899-12-31', HOJE)).toBeNull();
    expect(normalizarDataNascimento('', HOJE)).toBeNull();
    expect(normalizarDataNascimento(undefined, HOJE)).toBeNull();
    expect(normalizarDataNascimento('maio de 1990', HOJE)).toBeNull();
  });
});

describe('decidirVinculoPaciente (CLIN-QA-003)', () => {
  it('sem cadastro com o CPF, cria paciente novo', () => {
    expect(decidirVinculoPaciente([], '1990-05-31')).toEqual({ tipo: 'novo' });
  });

  it('vincula só quando há um cadastro e o nascimento confere', () => {
    expect(decidirVinculoPaciente([{ id: 'p1', data_nascimento: '1990-05-31' }], '1990-05-31'))
      .toEqual({ tipo: 'vinculado', pacienteId: 'p1' });
    expect(decidirVinculoPaciente([{ id: 'p1', data_nascimento: '1990-05-31T00:00:00' }], '1990-05-31'))
      .toEqual({ tipo: 'vinculado', pacienteId: 'p1' });
  });

  it('caso (a): CPF existente com nascimento divergente vira pendência, não vínculo', () => {
    expect(decidirVinculoPaciente([{ id: 'p1', data_nascimento: '1985-01-10' }], '1990-05-31'))
      .toEqual({ tipo: 'pendente', motivo: 'nascimento_divergente' });
  });

  it('cadastro sem nascimento não pode ser conferido e vira pendência', () => {
    expect(decidirVinculoPaciente([{ id: 'p1', data_nascimento: null }], '1990-05-31'))
      .toEqual({ tipo: 'pendente', motivo: 'nascimento_ausente_no_cadastro' });
  });

  it('CPF duplicado é ambíguo mesmo que um dos cadastros confira', () => {
    expect(decidirVinculoPaciente([
      { id: 'p1', data_nascimento: '1990-05-31' },
      { id: 'p2', data_nascimento: '1990-05-31' },
    ], '1990-05-31')).toEqual({ tipo: 'pendente', motivo: 'cpf_duplicado' });
  });

  it('o mesmo cadastro achado por dois caminhos conta uma vez', () => {
    expect(decidirVinculoPaciente([
      { id: 'p1', data_nascimento: '1990-05-31' },
      { id: 'p1', data_nascimento: '1990-05-31' },
    ], '1990-05-31')).toEqual({ tipo: 'vinculado', pacienteId: 'p1' });
  });
});

describe('buscarCandidatosPorCpf', () => {
  function dbMock(opts: { diretos: CandidatoPaciente[]; rpcId: string | null; extra?: CandidatoPaciente }) {
    const filtros: Array<[string, unknown]> = [];
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn((col: string, val: unknown) => { filtros.push([col, val]); return builder; }),
      in: vi.fn((col: string, val: unknown) => { filtros.push([col, val]); return builder; }),
      limit: vi.fn(async () => ({ data: opts.diretos, error: null })),
      maybeSingle: vi.fn(async () => ({ data: opts.extra ?? null, error: null })),
    };
    const from = vi.fn(() => builder);
    const rpc = vi.fn(async () => ({ data: opts.rpcId, error: null }));
    return { filtros, from, db: { from, rpc } as unknown as DbIdentificacao };
  }

  it('busca nos dois formatos de CPF dentro da clínica e não repete o achado da RPC', async () => {
    const { db, filtros, from } = dbMock({ diretos: [{ id: 'p1', data_nascimento: null }], rpcId: 'p1' });
    const candidatos = await buscarCandidatosPorCpf(db, 'clinica-1', '52998224725');
    expect(candidatos).toEqual([{ id: 'p1', data_nascimento: null }]);
    expect(filtros).toContainEqual(['clinica_id', 'clinica-1']);
    expect(filtros).toContainEqual(['cpf', ['52998224725', '529.982.247-25']]);
    expect(from).toHaveBeenCalledTimes(1);
  });

  it('acrescenta o cadastro legado achado só pela RPC normalizada, revelando a duplicidade', async () => {
    const { db } = dbMock({
      diretos: [{ id: 'p1', data_nascimento: '1990-05-31' }],
      rpcId: 'p2',
      extra: { id: 'p2', data_nascimento: '1990-05-31' },
    });
    const candidatos = await buscarCandidatosPorCpf(db, 'clinica-1', '52998224725');
    expect(candidatos.map((c) => c.id)).toEqual(['p1', 'p2']);
    expect(decidirVinculoPaciente(candidatos, '1990-05-31')).toEqual({ tipo: 'pendente', motivo: 'cpf_duplicado' });
  });
});

describe('cpfValido', () => {
  it('confere dígitos verificadores', () => {
    expect(cpfValido('529.982.247-25')).toBe(true);
    expect(cpfValido('52998224724')).toBe(false);
    expect(cpfValido('11111111111')).toBe(false);
  });
});
