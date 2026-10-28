import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('supabase/functions/whatsapp-webhook/index.ts', 'utf8');

describe('WhatsApp patient-service webhook policy', () => {
  it('builds model tools from the saved clinic capabilities', () => {
    expect(source).toContain('getAgentTools(agent.tipo, agent.habilidades)');
    expect(source).toMatch(/tools\.filter\(\(tool\) => isWhatsAppToolAllowed/);
    expect(source).toMatch(/if \(!isWhatsAppToolAllowed\(toolName, agentCapabilities\)\)/);
  });

  it('requires an explicit patient confirmation before writing to the agenda', () => {
    const prepareDefinition = source.indexOf('async function prepareAgendaAction(');
    const pendingGuard = source.indexOf('if (conversation.acao_pendente)', prepareDefinition);
    const handlePendingDefinition = source.indexOf('async function handlePendingAgendaAction(');
    const parseConfirmation = source.indexOf('parseExplicitConfirmation(text)', handlePendingDefinition);
    const rpcCall = source.indexOf("db.rpc('confirmar_acao_agenda_whatsapp'", handlePendingDefinition);

    expect(prepareDefinition).toBeGreaterThan(-1);
    expect(pendingGuard).toBeGreaterThan(prepareDefinition);
    expect(handlePendingDefinition).toBeGreaterThan(-1);
    expect(parseConfirmation).toBeGreaterThan(handlePendingDefinition);
    expect(rpcCall).toBeGreaterThan(parseConfirmation);
    expect(source).not.toContain("supabase.from('agendamentos').insert({");
  });

  it('aligns the assistant prompt with enabled capabilities and handles cancel/reschedule directly with explicit SIM', () => {
    expect(source).toContain('HABILIDADES HABILITADAS: ${capabilityInstructions');
    expect(source).toContain('confirmacao explicita SIM');
    expect(source).toContain('Todas as alteracoes exigem SIM.');
    expect(source).not.toContain('para cancelar ou remarcar, transfira para a equipe humana');
  });

  it('keeps triage in conversation context instead of writing to the clinical chart', () => {
    const start = source.indexOf("case 'registrar_triagem':");
    const end = source.indexOf("case 'transferir_humano':", start);
    const triageTool = source.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(triageTool).toContain(".from('whatsapp_conversations')");
    expect(triageTool).toContain(".update({ contexto:");
    expect(triageTool).not.toMatch(/\.from\(['"](?:prontuarios|prontuario_adendos|prescricoes)['"]\)/);
  });

  it('does not link a patient by phone: a new conversation starts unlinked (CLIN-QA-003)', () => {
    expect(source).not.toContain('findUniquePatientIdByPhone');
    expect(source).not.toMatch(/telefone\.ilike/);
    const insert = source.indexOf(".from('whatsapp_conversations')\n            .insert(");
    const insertCrlf = source.indexOf(".from('whatsapp_conversations')\r\n            .insert(");
    const start = insert > -1 ? insert : insertCrlf;
    expect(start).toBeGreaterThan(-1);
    expect(source.slice(start, start + 400)).toContain('paciente_id: null');
  });

  it('links a patient only through identificar_paciente with CPF and birth date', () => {
    const start = source.indexOf('async function identificarPaciente(');
    const body = source.slice(start, source.indexOf('\nfunction ', start));
    expect(start).toBeGreaterThan(-1);
    expect(body).toContain('decidirVinculoPaciente(');
    expect(body).toContain('normalizarDataNascimento(');
    expect(body).toContain(".is('paciente_id', null)");
    expect(body).toContain('failClosed: true');
  });

  it('answers plain informational questions directly instead of letting the model pick an agenda action', () => {
    const shortcut = source.indexOf('const infoAssunto =');
    const toolCall = source.indexOf("executeAgentTool(supabase, 'consultar_informacoes_clinica'", shortcut);

    expect(shortcut).toBeGreaterThan(-1);
    expect(toolCall).toBeGreaterThan(shortcut);
  });

  it('refuses to execute an agenda-changing tool for a message that reads like a plain question', () => {
    const guard = source.indexOf("blocked likely-wrong tool call");
    const riskyList = source.indexOf("'cancelar_agendamento', 'reagendar_agendamento', 'confirmar_presenca', 'criar_agendamento'");

    expect(guard).toBeGreaterThan(-1);
    expect(riskyList).toBeGreaterThan(-1);
    expect(riskyList).toBeLessThan(guard);
  });

  it('answers a chosen specialty directly instead of re-listing it when the model repeats itself', () => {
    const shortcut = source.indexOf("priorReceptionState?.data?.medicos");
    const matchCheck = source.indexOf('normalizeMedicalSpecialty(messageContent)', shortcut);
    const toolCall = source.indexOf("executeAgentTool(supabase, 'consultar_disponibilidade'", shortcut);

    expect(shortcut).toBeGreaterThan(-1);
    expect(matchCheck).toBeGreaterThan(shortcut);
    expect(toolCall).toBeGreaterThan(matchCheck);
  });
});
