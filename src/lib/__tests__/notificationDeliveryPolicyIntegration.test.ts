import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const reminderFunction = readFileSync('supabase/functions/send-appointment-reminder/index.ts', 'utf8');
const queueWorker = readFileSync('supabase/functions/process-notification-queue/index.ts', 'utf8');
const patientForm = readFileSync('src/pages/Pacientes.tsx', 'utf8');
const migration = readFileSync('supabase/migrations/20261014130000_preferencias_canal_e_janela_lembretes.sql', 'utf8');

describe('integração da preferência e janela dos lembretes', () => {
  it('persiste valores compatíveis para pacientes existentes e valida canais e janela', () => {
    expect(migration).toContain("preferencia_canal_lembrete text NOT NULL DEFAULT 'ambos'");
    expect(migration).toContain("horario_contato_inicio time NOT NULL DEFAULT '08:00'");
    expect(migration).toContain("horario_contato_fim time NOT NULL DEFAULT '20:00'");
    expect(migration).toMatch(/CHECK \(preferencia_canal_lembrete IN \('ambos', 'email', 'whatsapp', 'nenhum'\)\)/);
    expect(migration).toContain('CHECK (horario_contato_inicio <> horario_contato_fim)');
  });

  it('expõe edição acessível dos canais, da faixa de horário e do fuso no cadastro', () => {
    expect(patientForm).toContain('paciente-canal-lembrete');
    expect(patientForm).toContain('paciente-inicio-contato');
    expect(patientForm).toContain('paciente-fim-contato');
    expect(patientForm).toContain('paciente-fuso-contato');
    expect(patientForm).toContain('preferencia_canal_lembrete: formData.preferencia_canal_lembrete');
    expect(patientForm).toContain('horario_contato_inicio: formData.horario_contato_inicio');
  });

  it('filtra lembretes de 24h e 2h e aplica limites antes dos envios diretos', () => {
    expect(reminderFunction).toContain('canaisDeLembrete(');
    expect(reminderFunction).toContain('dentroDaJanelaDeContato(new Date()');
    expect(reminderFunction).toContain('clinicCanSendNotification(ag.clinica_id)');
    expect(reminderFunction).toContain('checkNotificationSendLimits(supabase');
    expect(reminderFunction).toContain('enqueueRateLimitedReminder(supabase');
    expect(reminderFunction).toContain('consumoNotificacoes(supabase, clinicId)');
    expect(reminderFunction).toContain('countNotificationSent(ag.clinica_id)');
    expect(reminderFunction).toContain("tipo_lembrete: '24h_whatsapp'");
    expect(reminderFunction).toContain("tipo_lembrete: '2h_whatsapp'");
    const deniedRate = reminderFunction.indexOf('if (rateLimit) {');
    const queuedRate = reminderFunction.indexOf('await enqueueRateLimitedReminder(supabase, {', deniedRate);
    const releasedRate = reminderFunction.indexOf('await releaseAutomationDelivery(supabase, ag.clinica_id, emailDeliveryKey)', queuedRate);
    expect(queuedRate).toBeGreaterThan(deniedRate);
    expect(releasedRate).toBeGreaterThan(queuedRate);
  });

  it('valida novamente preferências e janela para lembretes que aguardaram na fila', () => {
    const policyCheck = queueWorker.indexOf('const lembreteDeConsulta =');
    const patientQuery = queueWorker.indexOf(".from('pacientes')", policyCheck);
    const windowCheck = queueWorker.indexOf('dentroDaJanelaDeContato(', patientQuery);
    const providerCall = queueWorker.indexOf('sendBrandedBrevoRequest({', windowCheck);

    expect(policyCheck).toBeGreaterThan(-1);
    expect(patientQuery).toBeGreaterThan(policyCheck);
    expect(windowCheck).toBeGreaterThan(patientQuery);
    expect(providerCall).toBeGreaterThan(windowCheck);
    expect(queueWorker).toContain('Preferência do paciente não permite este canal.');
    expect(queueWorker).toContain('Fora da janela de contato do paciente; nova tentativa agendada.');
    expect(queueWorker).toContain('A consulta não está mais elegível para lembrete.');
    expect(queueWorker).toContain("['agendado', 'confirmado'].includes(agendamento.status)");
  });
});
