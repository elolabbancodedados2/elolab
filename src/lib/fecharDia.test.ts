import { describe, expect, it, vi } from 'vitest';
const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from } }));
import { candidatosAFalta, marcarFaltasSelecionadas } from './fecharDia';

describe('fechar o dia', () => {
  const consulta = { id: 'a', data: '2026-11-03', hora_inicio: '09:00:00', status: 'agendado', updated_at: 'versao', pacientes: { nome: 'Ana' } };
  it('respeita dia, horário e tolerância e nunca inclui quem chegou ou foi atendido', () => {
    const consultas = [consulta, ...['confirmado', 'aguardando', 'pago', 'em_triagem', 'em_atendimento', 'finalizado', 'faltou', 'cancelado'].map(status => ({ ...consulta, id: status, status })), { ...consulta, id: 'ontem', data: '2026-11-02' }, { ...consulta, id: 'futuro', hora_inicio: '10:00' }, { ...consulta, id: 'fila' }, { ...consulta, id: 'invalido', hora_inicio: '' }];
    expect(candidatosAFalta(consultas, [{ agendamento_id: 'fila' }], '2026-11-03', 9 * 60 + 16, 15).map(a => a.id)).toEqual(['a', 'confirmado']);
    expect(candidatosAFalta([consulta], [], '2026-11-03', 9 * 60 + 15, 15)).toEqual([]);
  });
  it('marca somente a seleção e informa conflito se houve check-in em outro terminal', async () => {
    const filtros: unknown[][] = [];
    from.mockImplementation((tabela: string) => {
      const filtro: unknown[] = [tabela]; filtros.push(filtro);
      return { update(v: unknown) { filtro.push(v); return this; }, select() { return this; }, eq(k: string,v: unknown) { filtro.push([k,v]); return this; }, in(k: string,v: unknown) { filtro.push([k,v]); return this; }, is(k: string,v: unknown) { filtro.push([k,v]); return this; }, limit() { return this; }, maybeSingle: async () => ({ data: null, error: null }), then(resolve: (value: unknown) => unknown) { return Promise.resolve({ data: [], error: null }).then(resolve); } };
    });
    const resultado = await marcarFaltasSelecionadas([consulta], 'clinica');
    expect(resultado.falhas[0].nome).toBe('Ana');
    expect(resultado.marcadas).toEqual([]);
    expect(filtros.find(f => f[0] === 'agendamentos')).toEqual(['agendamentos', { status: 'faltou' }, ['id', 'a'], ['clinica_id', 'clinica'], ['status', ['agendado', 'confirmado']], ['updated_at', 'versao']]);
  });
});
