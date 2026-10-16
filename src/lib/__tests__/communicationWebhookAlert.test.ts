import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const webhook = readFileSync('supabase/functions/whatsapp-webhook/index.ts', 'utf8');
const migration = readFileSync('supabase/migrations/20261014140000_alertas_webhook_comunicacao.sql', 'utf8');
const notificationRpc = readFileSync('supabase/migrations/20261009110000_notificacoes_usam_data_civil_sao_paulo.sql', 'utf8');
const integrationHealth = readFileSync('supabase/functions/integration-health/index.ts', 'utf8');

describe('alertas seguros de webhook de comunicação', () => {
  it('aceita apenas código fixo e agrupa alertas por clínica e hora', () => {
    expect(migration).toMatch(/CREATE UNIQUE INDEX[\s\S]*notification_queue[\s\S]*clinica_id[\s\S]*codigo_alerta[\s\S]*janela_alerta/i);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.registrar_alerta_webhook_comunicacao\([\s\S]*?p_codigo text[\s\S]*?SECURITY DEFINER/i);
    expect(migration).toMatch(/IF p_clinica_id IS NULL OR p_codigo <> 'webhook_whatsapp_processing_failed' THEN/);
    expect(migration).toMatch(/ON CONFLICT[\s\S]*DO UPDATE/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.registrar_alerta_webhook_comunicacao\(uuid, text\)[\s\S]*?FROM PUBLIC, anon, authenticated/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.registrar_alerta_webhook_comunicacao\(uuid, text\)[\s\S]*?TO service_role/i);
  });

  it('registra somente falha genérica depois de resolver a sessão e a clínica', () => {
    const session = webhook.indexOf(".from('whatsapp_sessions')");
    const alertCall = webhook.indexOf("rpc('registrar_alerta_webhook_comunicacao'", session);
    const errorLog = webhook.lastIndexOf("console.error('[Webhook] Error:'");
    expect(session).toBeGreaterThan(-1);
    expect(alertCall).toBeGreaterThan(session);
    expect(webhook.slice(alertCall, alertCall + 300)).toContain("p_codigo: 'webhook_whatsapp_processing_failed'");
    expect(webhook.slice(errorLog, errorLog + 180)).not.toContain('String(error)');
    expect(webhook).not.toContain('JSON.stringify({ error: String(error) })');
    expect(migration).not.toMatch(/body|telefone|mensagem do paciente|diagn[oó]stico/i);
  });

  it('torna o alerta visível só para administradores e agrega a saúde sem dados do paciente', () => {
    expect(notificationRpc).toContain("where n.clinica_id = c.clinica_id and n.status = 'erro'");
    expect(notificationRpc).toContain("public.has_role(c.user_id, 'admin')");
    expect(integrationHealth).toContain("dados_extras->>codigo_alerta");
    expect(integrationHealth).toContain('webhook_whatsapp_processing_failed');
  });
});
