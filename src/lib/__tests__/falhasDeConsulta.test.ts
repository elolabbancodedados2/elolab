import { describe, expect, it, vi } from 'vitest';
import { criarTratadorSessaoExpirada, deveRepetirConsulta, ehFalhaDePermissaoOuRequisicao, ehFalhaDeSessao } from '../falhasDeConsulta';

describe('classificação de falhas', () => {
  it('reconhece sessão vencida', () => {
    expect(ehFalhaDeSessao({ code: 'PGRST301', message: 'JWT expired' })).toBe(true);
    expect(ehFalhaDeSessao({ message: 'JWT expired' })).toBe(true);
    expect(ehFalhaDeSessao({ status: 401, message: 'Unauthorized' })).toBe(true);
    expect(ehFalhaDeSessao({ context: { status: 401 }, message: 'Edge Function returned a non-2xx status code' })).toBe(true);
    expect(ehFalhaDeSessao(new Error('Failed to fetch'))).toBe(false);
  });

  it('não repete permissão, 4xx e dado inválido; repete uma vez falha transitória', () => {
    expect(ehFalhaDePermissaoOuRequisicao({ code: '42501', message: 'permission denied for table x' })).toBe(true);
    expect(ehFalhaDePermissaoOuRequisicao({ status: 403 })).toBe(true);
    expect(ehFalhaDePermissaoOuRequisicao({ code: '22P02' })).toBe(true);
    expect(ehFalhaDePermissaoOuRequisicao({ status: 429 })).toBe(false);

    expect(deveRepetirConsulta(0, { code: '42501' })).toBe(false);
    expect(deveRepetirConsulta(0, { message: 'JWT expired' })).toBe(false);
    expect(deveRepetirConsulta(0, new Error('Failed to fetch'))).toBe(true);
    expect(deveRepetirConsulta(1, new Error('Failed to fetch'))).toBe(false);
    expect(deveRepetirConsulta(0, { status: 503 })).toBe(true);
  });
});

describe('tratador de sessão expirada', () => {
  const deps = (overrides: Partial<Parameters<typeof criarTratadorSessaoExpirada>[0]> = {}) => ({
    temSessao: vi.fn(async () => true),
    renovarSessao: vi.fn(async () => ({ ok: true })),
    encerrarSessaoLocal: vi.fn(async () => undefined),
    avisarSessaoExpirada: vi.fn(),
    ...overrides,
  });

  it('renova a sessão uma única vez para várias falhas simultâneas', async () => {
    const d = deps();
    const tratar = criarTratadorSessaoExpirada(d);
    const resultados = await Promise.all([tratar(), tratar(), tratar()]);
    expect(resultados).toEqual(['renovada', 'renovada', 'renovada']);
    expect(d.renovarSessao).toHaveBeenCalledTimes(1);
    expect(d.encerrarSessaoLocal).not.toHaveBeenCalled();
  });

  it('sem renovação, avisa e encerra só a sessão local', async () => {
    const d = deps({ renovarSessao: vi.fn(async () => ({ ok: false })) });
    await expect(criarTratadorSessaoExpirada(d)()).resolves.toBe('encerrada');
    expect(d.avisarSessaoExpirada).toHaveBeenCalledTimes(1);
    expect(d.encerrarSessaoLocal).toHaveBeenCalledTimes(1);
  });

  it('em página pública sem sessão, não encerra nada', async () => {
    const d = deps({ temSessao: vi.fn(async () => false) });
    await expect(criarTratadorSessaoExpirada(d)()).resolves.toBe('sem-sessao');
    expect(d.renovarSessao).not.toHaveBeenCalled();
    expect(d.encerrarSessaoLocal).not.toHaveBeenCalled();
  });
});
