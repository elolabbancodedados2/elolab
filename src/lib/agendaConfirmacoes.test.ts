import { beforeEach, describe, expect, it, vi } from 'vitest';
const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from } }));
import { estadoLembrete, confirmarSelecionadas } from './agendaConfirmacoes';

describe('lembretes e confirmação em lote', () => {
  const aviso = { status: 'enviado', enviado_em: '2026-11-02T10:00:00Z', dados_extras: { agendamento_id: 'a', tipo_lembrete: '24h' } };
  it('não confunde envio pendente ou aviso de outra consulta com lembrete entregue', () => {
    expect(estadoLembrete('a', [{ ...aviso, status: 'pendente', enviado_em: null }], []).enviado).toBe(false);
    expect(estadoLembrete('b', [aviso], []).enviado).toBe(false);
    expect(estadoLembrete('a', [aviso], [])).toMatchObject({ enviado: true, respondeu: false, semResposta: true });
  });
  it('reconhece resposta do agente apenas para a mesma consulta depois do lembrete', () => {
    const resposta = { tipo_acao: 'confirmar_presenca', sucesso: true, created_at: '2026-11-02T11:00:00Z', dados_entrada: { agendamento_id: 'a' }, dados_saida: { completed: true } };
    expect(estadoLembrete('a', [aviso], [resposta])).toMatchObject({ respondeu: true, semResposta: false });
    expect(estadoLembrete('a', [aviso], [{ ...resposta, created_at: '2026-11-01T11:00:00Z' }]).semResposta).toBe(true);
    expect(estadoLembrete('a', [aviso], [{ ...resposta, sucesso: false }]).semResposta).toBe(true);
  });
  beforeEach(() => from.mockReset());
  it('confirma só as selecionadas com trava de clínica, status e updated_at; identifica conflito e erro', async () => {
    const filtros: unknown[][] = [];
    from.mockImplementation(() => {
      const filtro: unknown[] = [];
      filtros.push(filtro);
      return { update(value: unknown) { filtro.push(value); return this; }, eq(key: string, value: unknown) { filtro.push([key, value]); return this; }, is(key: string, value: unknown) { filtro.push([key, value]); return this; }, select() { return this; }, maybeSingle: async () => filtros.length === 1 ? { data: { id: 'a' }, error: null } : filtros.length === 2 ? { data: null, error: null } : { data: null, error: new Error('Sem acesso') } };
    });
    const resultado = await confirmarSelecionadas([{ id: 'a', updated_at: 'versao-a', pacientes: { nome: 'Ana' } }, { id: 'b', updated_at: null, pacientes: { nome: 'Bia' } }, { id: 'c', updated_at: 'versao-c', pacientes: { nome: 'Caio' } }], 'clinica');
    expect(resultado.confirmadas).toEqual(['a']);
    expect(resultado.falhas.map(f => f.nome)).toEqual(['Bia', 'Caio']);
    expect(filtros[0]).toEqual([{ status: 'confirmado' }, ['id', 'a'], ['clinica_id', 'clinica'], ['status', 'agendado'], ['updated_at', 'versao-a']]);
    expect(filtros[1]).toContainEqual(['updated_at', null]);
  });
});
