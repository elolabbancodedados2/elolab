import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { plainWhatsAppText } from '../../../supabase/functions/_shared/whatsappText';
import { isWhatsAppToolAllowed, normalizeMedicalSpecialty } from '../../../supabase/functions/_shared/whatsappAgentPolicy';

function loadAgent(completion = vi.fn()) {
  const source = readFileSync('supabase/functions/whatsapp-webhook/index.ts', 'utf8').replace(/^import .*$/gm, '');
  const context = vm.createContext({ Deno: { serve: () => {} }, createNvidiaChatCompletion: completion, isWhatsAppToolAllowed, plainWhatsAppText, normalizeMedicalSpecialty });
  vm.runInContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText, context);
  return context;
}

describe('WhatsApp appointment replies', () => {
  function clinicData() {
    const rows: Record<string, unknown[]> = {
      medicos: [{ id: 'doctor-1', nome: 'Dr. Alex DEMONSTRAÇÃO', crm: 'DEMO', especialidade: 'Clínico geral' }],
      medico_disponibilidade: [{ medico_id: 'doctor-1', hora_inicio: '08:00', hora_fim: '18:00', duracao_consulta: 30, intervalo_consultas: 0 }],
      agendamentos: [],
    };
    const mutations: Array<{ table: string; kind: string }> = [];
    return { mutations, from: (table: string) => {
      const query: Record<string, unknown> = {};
      for (const method of ['select','eq','in','or','limit','lte','gte']) query[method] = () => query;
      query.maybeSingle = async () => ({ data: rows[table]?.[0] || null, error: null });
      for (const kind of ['update','insert']) query[kind] = () => { mutations.push({ table, kind }); return query; };
      query.then = (resolve: (data: { data: unknown[]; error: null }) => unknown) => Promise.resolve(resolve({ data: rows[table] || [], error: null }));
      return query;
    } };
  }

  it('finds the registered general practitioner and does not offer past slots today', async () => {
    const context = loadAgent();
    context.todaySaoPauloDateOnly = () => '2026-10-14';
    context.clinicCurrentTimeMinutes = () => 18 * 60;
    const result = await context.executeAgentTool(clinicData(), 'consultar_disponibilidade', { especialidade: 'clinico geral', data_preferencia: '2026-10-14' }, {}, 'clinic-1', ['consultar_disponibilidade']);
    expect(result.success).toBe(true);
    expect(result.message).toBe('Não há mais horários livres para hoje. Posso consultar amanhã?');
  });

  it('offers the requested future time using the actual registered doctor name', async () => {
    const context = loadAgent();
    context.todaySaoPauloDateOnly = () => '2026-10-14';
    context.clinicCurrentTimeMinutes = () => 18 * 60;
    const result = await context.executeAgentTool(clinicData(), 'consultar_disponibilidade', { especialidade: 'clinica geral', data_preferencia: '2026-10-15', hora_preferencia: '15:00' }, {}, 'clinic-1', ['consultar_disponibilidade']);
    expect(result.success).toBe(true);
    expect(result.message).toBe('Em 15/10 temos:\nDr. Alex DEMONSTRAÇÃO: 15:00\nQual horário você prefere?');
  });

  it('prepares a single confirmation when the patient already chose a free time, without booking yet', async () => {
    const context = loadAgent();
    context.todaySaoPauloDateOnly = () => '2026-10-14';
    context.clinicCurrentTimeMinutes = () => 18 * 60;
    const db = clinicData();
    const result = await context.executeAgentTool(db, 'consultar_disponibilidade', { especialidade: 'clinico geral', data_preferencia: '2026-10-15', hora_preferencia: '15:00' }, { id: 'conversation', paciente_id: 'patient', contexto: [] }, 'clinic-1', ['consultar_disponibilidade','criar_agendamento']);
    expect(result.requires_confirmation).toBe(true);
    expect(result.message).toBe('Posso marcar 15/10 às 15:00 com Dr. Alex DEMONSTRAÇÃO? Responda SIM para confirmar ou NÃO para cancelar.');
    expect(db.mutations).toEqual([{ table: 'whatsapp_conversations', kind: 'update' }]);
  });

  it('sends the configured welcome without asterisks', async () => {
    const completion = vi.fn().mockResolvedValue({ choices: [{ message: { content: 'Olá! Qual **especialidade** você procura?' } }] });
    const context = loadAgent(completion);
    const reply = await context.runNvidiaAgent({ apiKey: 'placeholder', agent: { habilidades: [], mensagem_boas_vindas: 'Olá! Qual **especialidade** você procura?' }, systemPrompt: '', conversationHistory: [], messageContent: 'Olá', supabase: {}, conversation: { id: 'demo' }, clinicaId: 'demo' });
    expect(reply).toBe('Olá! Qual especialidade você procura?');
    expect(completion).not.toHaveBeenCalled();
  });

  it('does not let the model claim availability without a real tool call', async () => {
    const completion = vi.fn().mockResolvedValue({ choices: [{ message: { content: 'Não há médicos amanhã.' } }] });
    const context = loadAgent(completion);
    await expect(context.runNvidiaAgent({ apiKey: 'placeholder', agent: { habilidades: ['consultar_disponibilidade'] }, systemPrompt: '', conversationHistory: [], messageContent: 'e amanhã?', supabase: {}, conversation: { id: 'demo' }, clinicaId: 'demo' })).rejects.toThrow('required tool');
    expect(completion.mock.calls[0][0].toolChoice).toBe('required');
  });
  it('gives the model the clinic date to understand tomorrow', () => {
    const context = loadAgent();
    const prompt = context.buildSystemPrompt({ nome: 'Demo', habilidades: [] }, '');
    expect(prompt).toContain(context.todaySaoPauloDateOnly());
  });

  it('preserves an authoritative tool reply when the final model response is empty', async () => {
    const completion = vi.fn()
      .mockResolvedValueOnce({ choices: [{ message: { tool_calls: [{ id: 'call-1', function: { name: 'consultar_disponibilidade', arguments: '{"data_preferencia":"2000-01-01"}' } }] } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: '' } }] });
    const context = loadAgent(completion);
    const insert = vi.fn(async () => ({}));
    const supabase = { from: vi.fn(() => ({ insert, update: () => ({ eq: () => ({ eq: async () => ({}) }) }) })) };
    const reply = await context.runNvidiaAgent({ apiKey: 'placeholder', agent: { habilidades: ['consultar_disponibilidade'] }, systemPrompt: '', conversationHistory: [], messageContent: 'amanhã', supabase, conversation: { id: 'demo' }, clinicaId: 'demo-clinic' });
    expect(reply).toBe('Informe uma data válida a partir de hoje para eu consultar a agenda.');
    expect(completion).toHaveBeenCalledTimes(1);
  });
});
