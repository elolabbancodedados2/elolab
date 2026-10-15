import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { isWhatsAppToolAllowed, normalizeMedicalSpecialty, parseExplicitConfirmation } from '../../../supabase/functions/_shared/whatsappAgentPolicy';
import { plainWhatsAppText } from '../../../supabase/functions/_shared/whatsappText';

function load() {
  const source = readFileSync('supabase/functions/whatsapp-webhook/index.ts', 'utf8').replace(/^import .*$/gm, '');
  const context = vm.createContext({ Deno: { serve: () => {} }, isWhatsAppToolAllowed, normalizeMedicalSpecialty, parseExplicitConfirmation, plainWhatsAppText });
  vm.runInContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText, context);
  context.todaySaoPauloDateOnly = () => '2026-10-14';
  return context;
}

function database(rows: Record<string, unknown[]>) {
  const changes: Array<{ table: string; data: any }> = [];
  const filters: Array<{ table: string; field: string; value: unknown }> = [];
  return { changes, filters, rpc: vi.fn(async () => ({ data: { success: true, completed: true, agendamento_id: 'a1', message: 'Consulta cancelada.' }, error: null })), from: (table: string) => {
    const query: any = {};
    for (const method of ['select','in','gte','order','limit']) query[method] = () => query;
    query.eq = (field: string, value: unknown) => { filters.push({ table, field, value }); return query; };
    query.update = (data: unknown) => { changes.push({ table, data }); return query; };
    query.maybeSingle = async () => ({ data: rows[table]?.[0] ?? null, error: null });
    query.then = (resolve: any) => Promise.resolve(resolve({ data: rows[table] ?? [], error: null }));
    return query;
  } };
}

describe('reception tools', () => {
  const conversation = { id: 'c1', paciente_id: 'p1', contexto: [], acao_pendente: null };
  it('exposes enabled information and agenda change tools', () => {
    const tools = load().getAgentTools('geral', ['informacoes_clinica','cancelar_agendamento','reagendar_agendamento','consultar_agendamentos_paciente']);
    expect(tools.map((tool: any) => tool.name)).toEqual(expect.arrayContaining(['consultar_informacoes_clinica','cancelar_agendamento','reagendar_agendamento','confirmar_presenca']));
  });
  it('gives each agenda-change tool its own parameters so the model cannot confuse them', () => {
    const tools = load().getAgentTools('geral', ['cancelar_agendamento', 'reagendar_agendamento', 'consultar_agendamentos_paciente'])
    const byName = Object.fromEntries(tools.map((tool: any) => [tool.name, tool.parameters]))
    expect(byName.cancelar_agendamento.required).toEqual(['agendamento_id', 'motivo'])
    expect(byName.cancelar_agendamento.properties).not.toHaveProperty('data')
    expect(byName.cancelar_agendamento.properties).not.toHaveProperty('hora_inicio')
    expect(byName.reagendar_agendamento.required).toEqual(['agendamento_id', 'medico_id', 'data', 'hora_inicio'])
    expect(byName.reagendar_agendamento.properties).not.toHaveProperty('motivo')
    expect(byName.confirmar_presenca.required).toEqual(['agendamento_id'])
    expect(byName.confirmar_presenca.properties).not.toHaveProperty('motivo')
    expect(byName.confirmar_presenca.properties).not.toHaveProperty('data')
    expect(byName.confirmar_presenca.properties).not.toHaveProperty('hora_inicio')
  })
  it('returns only clinic registered address', async () => {
    const db = database({ configuracoes_clinica: [{ valor: { nomeClinica: 'Clínica DEMO', endereco: 'Rua fictícia, 10' } }] });
    const result = await load().executeAgentTool(db, 'consultar_informacoes_clinica', { assunto: 'endereco' }, conversation, 'clinic1', ['informacoes_clinica']);
    expect(result.message).toContain('Rua fictícia, 10');
    expect(db.filters).toContainEqual({ table: 'configuracoes_clinica', field: 'clinica_id', value: 'clinic1' });
  });
  it('reads actual opening and closing configuration fields', async () => {
    const db = database({ configuracoes_clinica: [{ valor: { horarioAbertura: '08:00', horarioFechamento: '18:00', diasFuncionamento: ['seg','ter'] } }] });
    const result = await load().executeAgentTool(db, 'consultar_informacoes_clinica', { assunto: 'horarios' }, conversation, 'clinic1', ['informacoes_clinica']);
    expect(result.message).toContain('08:00');
    expect(result.message).toContain('18:00');
  });
  it('asks cancellation reason before requesting confirmation', async () => {
    const db = database({ agendamentos: [{ id: 'a1', data: '2026-10-15', hora_inicio: '15:00', status: 'agendado' }] });
    const result = await load().executeAgentTool(db, 'cancelar_agendamento', { agendamento_id: 'a1' }, conversation, 'clinic1', ['cancelar_agendamento']);
    expect(result.message).toContain('motivo');
    expect(db.changes).toHaveLength(0);
  });
  it('prepares cancellation for SIM without changing an appointment', async () => {
    const db = database({ agendamentos: [{ id: 'a1', data: '2026-10-15', hora_inicio: '15:00', status: 'agendado' }] });
    const result = await load().executeAgentTool(db, 'cancelar_agendamento', { agendamento_id: 'a1', motivo: 'Compromisso' }, { ...conversation }, 'clinic1', ['cancelar_agendamento']);
    expect(result.requires_confirmation).toBe(true);
    expect(result.message).toContain('SIM');
    expect(db.changes).toHaveLength(1);
    expect(db.changes[0].table).toBe('whatsapp_conversations');
    expect(db.changes[0].data.acao_pendente.action).toBe('cancelar_agendamento');
    expect(db.filters).toContainEqual({ table: 'agendamentos', field: 'paciente_id', value: 'p1' });
  });
  it('confirms through the atomic RPC and refuses ambiguous confirmation', async () => {
    const db = database({});
    const context = load();
    const pending = { action: 'cancelar_agendamento', args: { agendamento_id: 'a1', motivo: 'Compromisso' }, expires_at: '2099-01-01T00:00:00Z' };
    const current = { ...conversation, acao_pendente: pending };
    expect(await context.handlePendingAgendaAction(db, current, 'clinic1', 'sim, mas amanhã')).toContain('SIM');
    expect(db.rpc).not.toHaveBeenCalled();
    expect(await context.handlePendingAgendaAction(db, current, 'clinic1', 'SIM')).toBe('Consulta cancelada.');
    expect(db.rpc).toHaveBeenCalledWith('confirmar_acao_agenda_whatsapp', { p_conversation_id: 'c1', p_clinica_id: 'clinic1' });
  });
  it('does not prepare changes when the appointment is not found for this patient', async () => {
    const db = database({});
    const result = await load().executeAgentTool(db, 'reagendar_agendamento', { agendamento_id: 'foreign' }, conversation, 'clinic1', ['reagendar_agendamento']);
    expect(result.success).toBe(false);
    expect(db.changes).toHaveLength(0);
  });
  it('records a survey rating only when the database identifies an actual sent survey', async () => {
    const db = database({});
    const context = load();
    db.rpc.mockResolvedValueOnce({ data: false, error: null } as any);
    expect(await context.capturePatientSatisfaction(db, 'clinic1', '5511969153824@s.whatsapp.net', '5')).toBeNull();
    db.rpc.mockResolvedValueOnce({ data: true, error: null } as any);
    expect(await context.capturePatientSatisfaction(db, 'clinic1', '5511969153824@s.whatsapp.net', '5')).toContain('Obrigado');
    expect(db.rpc).toHaveBeenLastCalledWith('registrar_satisfacao_whatsapp', { p_clinica_id: 'clinic1', p_telefone: '5511969153824', p_nota: 5, p_comentario: null });
  });
});
