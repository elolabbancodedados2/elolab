import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationPath = 'supabase/migrations/20261011430000_automacao_envios_claims.sql';
const reminderPath = 'supabase/functions/send-appointment-reminder/index.ts';
const birthdayPath = 'supabase/functions/birthday-greetings/index.ts';
const queueWorkerPath = 'supabase/functions/process-notification-queue/index.ts';
const queueRecoveryMigrationPath = 'supabase/migrations/20261011440000_fila_notificacoes_resultado_incerto.sql';
const automationPagePath = 'src/pages/Automacoes.tsx';

describe('reserva idempotente de mensagens automáticas', () => {
  it('reserva atomicamente uma chave por clínica e notificação', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    expect(migration).toMatch(/PRIMARY KEY\s*\(clinica_id,\s*chave\)/i);
    expect(migration).toMatch(/FUNCTION public\.claim_automation_delivery/i);
    expect(migration).toMatch(/ON CONFLICT\s*\(clinica_id,\s*chave\) DO NOTHING/i);
    expect(migration).toMatch(/auth\.role\(\)\s*<>\s*'service_role'/i);
    expect(migration).toMatch(/FUNCTION public\.finish_automation_delivery/i);
    expect(migration).toMatch(/FUNCTION public\.release_automation_delivery/i);
  });

  it('reserva consulta e confirmação antes de enviar ou enfileirar', () => {
    const reminder = readFileSync(reminderPath, 'utf8');
    expect(reminder).toMatch(/claim_automation_delivery/);
    expect(reminder.indexOf('claimAutomationDelivery', reminder.indexOf('if (automationKey === \'confirmacao_agendamento\')')))
      .toBeGreaterThan(-1);
    expect(reminder.indexOf('claimAutomationDelivery', reminder.indexOf('if (automationKey === \'confirmacao_agendamento\')')))
      .toBeLessThan(reminder.indexOf('await sendSharedBrevoEmail({'));
    expect(reminder).toMatch(/await sendWhatsAppMessage\(/);
    expect(reminder.indexOf('claimAutomationDelivery', reminder.indexOf('if (automationKey === \'confirmacao_agendamento\')')))
      .toBeLessThan(reminder.indexOf('await sendWhatsAppMessage('));
    expect(reminder).toContain('tipo_notificacao: \'confirmacao_agendamento\'');
    const window24hStart = reminder.indexOf('// === LEMBRETE 24H ===');
    const window2hStart = reminder.indexOf('// === LEMBRETE 2H ===');
    const processEnd = reminder.indexOf('const duration = Date.now() - startTime', window2hStart);
    for (const section of [reminder.slice(window24hStart, window2hStart), reminder.slice(window2hStart, processEnd)]) {
      expect(section.indexOf('claimAutomationDelivery')).toBeGreaterThan(-1);
      expect(section.indexOf('claimAutomationDelivery')).toBeLessThan(section.indexOf('await sendSharedBrevoEmail({'));
      expect(section.indexOf('claimAutomationDelivery')).toBeLessThan(section.indexOf('await sendWhatsAppMessage('));
    }
  });

  it('reserva o aniversário por paciente, clínica e data local antes do envio', () => {
    const birthday = readFileSync(birthdayPath, 'utf8');
    expect(birthday).toMatch(/claim_automation_delivery/);
    expect(birthday.indexOf('claimAutomationDelivery', birthday.indexOf('for (const paciente')))
      .toBeLessThan(birthday.indexOf('await sendBrandedBrevoRequest('));
    expect(birthday).toMatch(/birthday:\$\{hojeBrasil\}:\$\{paciente\.id\}/);
  });
  it('does not automatically resend queue items with an uncertain provider result', () => {
    const migration = readFileSync(queueRecoveryMigrationPath, 'utf8');
    const worker = readFileSync(queueWorkerPath, 'utf8');
    expect(migration).toMatch(/'incerto'/i);
    expect(migration).toMatch(/SET status = 'incerto'[\s\S]*Processamento interrompido/i);
    expect(worker).toMatch(/marcarIncerto/);
    expect(worker).toMatch(/status:\s*'incerto'/);
  });

  it('labels the queue sample and keeps uncertain items out of the repeat action', () => {
    const page = readFileSync(automationPagePath, 'utf8');
    expect(page).toContain('100 mensagens mais recentes carregadas');
    expect(page).toContain('Resultado incerto');
    expect(page).toMatch(/action === 'retry' && !\['erro', 'cancelado'\]\.includes\(item\.status\)/);
  });

  it('keeps stale claims visible and isolates each reminder delivery channel', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    const reminder = readFileSync(reminderPath, 'utf8');
    const page = readFileSync(automationPagePath, 'utf8');
    expect(migration).toMatch(/UPDATE public\.automation_delivery_claims[\s\S]*estado = 'uncertain'[\s\S]*criado_em < now\(\) - interval '10 minutes'/i);
    expect(migration).toMatch(/automation_delivery_claims_admin_read[\s\S]*is_same_clinica\(clinica_id\)/i);
    expect(page).toContain("'automation_delivery_claims'");
    expect(page).toMatch(/limit: deliveryClaimsPageSize, page: deliveryClaimsPage/);
    expect(page).not.toMatch(/deliveryClaimsPageSize \+ 1/);
    expect(page).toContain('Mais reservas');
    expect(reminder).toMatch(/appointment:\$\{ag\.id\}:24h:email/);
    expect(reminder).toMatch(/appointment:\$\{ag\.id\}:24h:whatsapp/);
    expect(reminder).toMatch(/appointment:\$\{ag\.id\}:2h:email/);
    expect(reminder).toMatch(/appointment:\$\{ag\.id\}:2h:whatsapp/);
  });

  it('holds direct delivery claims after an ambiguous 5xx response', () => {
    const reminder = readFileSync(reminderPath, 'utf8');
    const birthday = readFileSync(birthdayPath, 'utf8');
    expect(reminder).toMatch(/emailRes\.status\s*>=\s*500[\s\S]*finishAutomationDelivery\([^\n]*'uncertain'/);
    expect(birthday).toMatch(/emailRes\.status\s*>=\s*500[\s\S]*finishAutomationDelivery\([^\n]*'uncertain'/);
  });
});
