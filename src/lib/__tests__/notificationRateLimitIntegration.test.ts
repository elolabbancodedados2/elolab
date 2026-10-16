import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const worker = readFileSync('supabase/functions/process-notification-queue/index.ts', 'utf8');
const rateLimitMigration = readFileSync('supabase/migrations/20260817190000_rate_limit_para_endpoints_publicos.sql', 'utf8');

describe('integração dos limites com a fila de envios', () => {
  it('consulta os limites antes de chamar os dois provedores', () => {
    const limitCheck = worker.indexOf('checkNotificationSendLimits(supabase');
    const emailSend = worker.indexOf('sendBrandedBrevoRequest({', limitCheck);
    const whatsappSend = worker.indexOf('fetch(`${url}/message/sendText/', limitCheck);

    expect(limitCheck).toBeGreaterThan(-1);
    expect(emailSend).toBeGreaterThan(limitCheck);
    expect(whatsappSend).toBeGreaterThan(limitCheck);
    expect(worker).toContain(".eq('clinica_id', notif.clinica_id)");
    expect(worker).toContain("hashSecret: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''");
  });

  it('reagenda bloqueios sem consumir tentativas e sem registrar o telefone', () => {
    expect(worker).toContain('const adiarPorLimite = async');
    expect(worker).toContain("status: 'pendente'");
    expect(worker).toContain('tentativas: Math.max(0, notif.tentativas - 1)');
    expect(worker).toContain('Date.now() + 60_000');
    expect(worker).toContain(".eq('status', 'enviando')");
    expect(worker).toContain('Intervalo mínimo para este número ainda não foi atingido; envio reagendado.');
  });

  it('usa o contador atômico existente, disponível somente para service role', () => {
    expect(rateLimitMigration).toMatch(/CREATE OR REPLACE FUNCTION public\.checar_rate_limit\([\s\S]*?ON CONFLICT \(chave, janela\)[\s\S]*?contagem = rate_limit_counters\.contagem \+ 1/i);
    expect(rateLimitMigration).toMatch(/REVOKE ALL ON FUNCTION public\.checar_rate_limit\(text, integer, integer\) FROM PUBLIC/i);
    expect(rateLimitMigration).toMatch(/GRANT EXECUTE ON FUNCTION public\.checar_rate_limit\(text, integer, integer\) TO service_role/i);
  });
});
