import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationPath = 'supabase/migrations/20261011430000_automacao_envios_claims.sql';
const reminderPath = 'supabase/functions/send-appointment-reminder/index.ts';
const birthdayPath = 'supabase/functions/birthday-greetings/index.ts';
const queueWorkerPath = 'supabase/functions/process-notification-queue/index.ts';
const queueRecoveryMigrationPath = 'supabase/migrations/20261011440000_fila_notificacoes_resultado_incerto.sql';
const automationPagePath = 'src/pages/Automacoes.tsx';
const journeyHandlerPath = 'supabase/functions/_shared/patientJourneyHandler.ts';
const journeyMigrationPath = 'supabase/migrations/20261014231000_patient_journey_automation.sql';

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

  it('delegates appointment reminders to the single atomic journey producer', () => {
    // send-appointment-reminder no longer claims deliveries inline; it is a
    // thin wrapper over handlePatientJourney, which enqueues through
    // enfileirar_jornada_paciente (one producer, one dedupe key per channel)
    // instead of each entry point reserving its own claim.
    const reminder = readFileSync(reminderPath, 'utf8');
    expect(reminder).toContain("handlePatientJourney(req, 'reminders'");
    const handler = readFileSync(journeyHandlerPath, 'utf8');
    expect(handler).toContain("supabase.rpc('enfileirar_jornada_paciente'");
    const migration = readFileSync(journeyMigrationPath, 'utf8');
    expect(migration).toMatch(/UNIQUE INDEX[\s\S]*notification_queue_journey_once/i);
    expect(migration).toMatch(/ON CONFLICT\(clinica_id,tipo,dedupe_key\) DO NOTHING/i);
    // Avoids replaying messages the retired claim-based mechanism already
    // delivered or left uncertain during the cutover.
    expect(migration).toContain('automation_delivery_claims');
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

  it('keeps stale claims visible for the automations still using them', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    const page = readFileSync(automationPagePath, 'utf8');
    expect(migration).toMatch(/UPDATE public\.automation_delivery_claims[\s\S]*estado = 'uncertain'[\s\S]*criado_em < now\(\) - interval '10 minutes'/i);
    expect(migration).toMatch(/automation_delivery_claims_admin_read[\s\S]*is_same_clinica\(clinica_id\)/i);
    expect(page).toContain("'automation_delivery_claims'");
    expect(page).toMatch(/limit: deliveryClaimsPageSize, page: deliveryClaimsPage/);
    expect(page).not.toMatch(/deliveryClaimsPageSize \+ 1/);
    expect(page).toContain('Mais reservas');
  });

  it('isolates each appointment reminder channel with its own dedupe key', () => {
    const migration = readFileSync(journeyMigrationPath, 'utf8');
    expect(migration).toMatch(/lembrete_consulta_24h'\s*THEN\s*'24h'/);
    expect(migration).toMatch(/tipo_lembrete',CASE p_chave WHEN 'lembrete_consulta_24h'/);
  });

  it('holds direct delivery claims after an ambiguous 5xx response', () => {
    const birthday = readFileSync(birthdayPath, 'utf8');
    expect(birthday).toMatch(/emailRes\.status\s*>=\s*500[\s\S]*finishAutomationDelivery\([^\n]*'uncertain'/);
  });
});
