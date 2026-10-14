import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('supabase/functions/whatsapp-webhook/index.ts', 'utf8');

describe('WhatsApp patient-service webhook policy', () => {
  it('builds model tools from the saved clinic capabilities', () => {
    expect(source).toContain('getAgentTools(agent.tipo, agent.habilidades)');
    expect(source).toMatch(/tools\.filter\(\(tool\) => isWhatsAppToolAllowed/);
    expect(source).toMatch(/if \(!isWhatsAppToolAllowed\(toolName, agentCapabilities\)\)/);
  });

  it('requires an explicit patient confirmation before inserting an appointment', () => {
    const confirmGate = source.indexOf('if (options.patientConfirmed !== true)');
    const appointmentInsert = source.indexOf("supabase.from('agendamentos').insert({", confirmGate);
    const explicitConfirmation = source.indexOf('{ patientConfirmed: true }');
    const pendingConfirmation = source.indexOf('requires_confirmation: true', confirmGate);

    expect(confirmGate).toBeGreaterThan(-1);
    expect(pendingConfirmation).toBeGreaterThan(confirmGate);
    expect(appointmentInsert).toBeGreaterThan(confirmGate);
    expect(explicitConfirmation).toBeGreaterThan(-1);
    expect(source).toContain('if (confirmation === \'yes\' || confirmation === \'no\')');
    expect(source).toContain('Ainda não marquei. Responda somente SIM');
    expect(source).toContain('Date.parse(pendingBooking.expires_at) <= Date.now()');
    expect(source).not.toContain('args.confirmed');
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
    expect(source).toContain('para cancelar ou remarcar, transfira para a equipe humana');
  });

  it('does not guess a patient from a partial phone match', () => {
    expect(source).toContain('findUniquePatientIdByPhone(phoneNumber, candidates || [])');
    expect(source).not.toMatch(/select\('id'\)[\s\S]{0,250}telefone\.ilike/);
  });
});
