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

    expect(confirmGate).toBeGreaterThan(-1);
    expect(appointmentInsert).toBeGreaterThan(confirmGate);
    expect(explicitConfirmation).toBeGreaterThan(-1);
    expect(source).not.toContain('args.confirmed');
  });

  it('aligns the assistant prompt with enabled capabilities and hands unsupported changes to staff', () => {
    expect(source).toContain('HABILIDADES HABILITADAS: ${capabilityInstructions');
    expect(source).toContain('para cancelar ou remarcar, transfira para a equipe humana');
    expect(source).toContain('confirmacao explicita SIM');
  });

  it('does not guess a patient from a partial phone match', () => {
    expect(source).toContain('findUniquePatientIdByPhone(phoneNumber, candidates || [])');
    expect(source).not.toMatch(/select\('id'\)[\s\S]{0,250}telefone\.ilike/);
  });
});
