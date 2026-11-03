import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), historico: [] as any[], prazo: 30 as number | null, filtros: [] as unknown[][] }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }));
import { createAutoBillingDetailed, retornoDentroDoPrazo } from './autoBilling';

describe('retorno gratuito com prazo', () => {
  const ultimaConsulta = { data: '2026-10-01', medico_id: 'medico' };
  it.each([
    ['2026-10-31', 30, 'medico', true],
    ['2026-11-01', 30, 'medico', false],
    ['2027-11-01', null, 'medico', true],
    ['2026-10-02', 30, 'outro', false],
    ['2026-09-30', 30, 'medico', false],
  ] as const)('decide em %s, prazo %s, médico %s', (dataRetorno, prazoDias, medicoId, esperado) => {
    expect(retornoDentroDoPrazo({ dataRetorno, prazoDias, medicoId, ultimaConsulta })).toBe(esperado);
  });
  it('não concede gratuidade sem consulta paga ou com data inválida', () => {
    expect(retornoDentroDoPrazo({ dataRetorno: '2026-10-31', prazoDias: null, medicoId: 'medico', ultimaConsulta: null })).toBe(false);
    expect(retornoDentroDoPrazo({ dataRetorno: 'inválida', prazoDias: 30, medicoId: 'medico', ultimaConsulta })).toBe(false);
  });
  beforeEach(() => {
    mocks.prazo = 30;
    mocks.historico = [{ id: 'anterior', data: '2026-10-01', medico_id: 'medico', tipo: 'Consulta' }];
    mocks.filtros = [];
    mocks.rpc.mockReset().mockResolvedValue({ data: 'created', error: null });
    mocks.from.mockImplementation((tabela: string) => {
      const filtros: any[] = []; mocks.filtros.push([tabela, filtros]);
      const resultado = () => ({ error: null, data: tabela === 'lancamentos' ? [] : tabela === 'agendamentos' ? filtros.some(f => f[0] === 'id' && f[1] === 'atual') ? { id: 'atual', data: '2026-11-03', medico_id: 'medico' } : mocks.historico : tabela === 'tipos_consulta' ? { id: 'tipo', nome: filtros.find(f => f[0] === 'nome')?.[1] || 'Consulta', valor_particular: filtros.some(f => f[0] === 'nome' && f[1] === 'Retorno') ? 0 : 180, prazo_retorno_dias: mocks.prazo } : null });
      const q: any = { select: () => q, eq: (k: string,v: unknown) => { filtros.push([k,v]); return q; }, ilike: (k: string,v: unknown) => { filtros.push([k,v]); return q; }, neq: () => q, in: (k: string,v: unknown) => { filtros.push([k,v]); return q; }, gt: (k: string,v: unknown) => { filtros.push([k,v]); return q; }, lte: () => q, order: () => q, limit: () => q, maybeSingle: async () => resultado(), then: (resolve: any) => Promise.resolve(resultado()).then(resolve) };
      return q;
    });
  });
  const params = { agendamentoId: 'atual', pacienteId: 'paciente', pacienteNome: 'Ana', tipoConsulta: 'retorno', data: '2026-11-03', clinicaId: 'clinica' };
  it('fora do prazo cobra a consulta de referência, mesmo com Retorno cadastrado a zero', async () => {
    expect(await createAutoBillingDetailed(params)).toBe('created');
    expect(mocks.rpc).toHaveBeenCalledWith('criar_cobranca_checkin_atomica', expect.objectContaining({ p_valor: 180, p_agendamento_id: 'atual' }));
    expect(mocks.filtros.some(([t, f]) => t === 'agendamentos' && (f as any[]).some(x => x[0] === 'medico_id' && x[1] === 'medico'))).toBe(true);
  });
  it('dentro do prazo ou sem prazo não cria cobrança; consulta de outro médico não dá gratuidade', async () => {
    mocks.prazo = 40;
    expect(await createAutoBillingDetailed(params)).toBe('free');
    mocks.prazo = null;
    expect(await createAutoBillingDetailed(params)).toBe('free');
    expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.historico = [{ ...mocks.historico[0], medico_id: 'outro' }];
    expect(await createAutoBillingDetailed(params)).toBe('created');
  });
});
