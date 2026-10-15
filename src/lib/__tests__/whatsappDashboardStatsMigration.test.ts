import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const path = 'supabase/migrations/20261014240000_whatsapp_dashboard_stats.sql';
const sql = existsSync(path) ? readFileSync(path, 'utf8') : '';

describe('WhatsApp dashboard aggregate security and definitions', () => {
  it('derives clinic from authenticated admin and removes anonymous execute', () => {
    expect(sql).toContain('public.whatsapp_dashboard_stats()');
    expect(sql).toContain('auth.uid() IS NULL');
    expect(sql).toContain('public.is_admin(auth.uid())');
    expect(sql).toContain('public.get_my_clinica_id()');
    expect(sql).toContain('FROM PUBLIC, anon');
    expect(sql).toContain('TO authenticated');
    expect(sql).not.toContain('SECURITY DEFINER');
  });
  it('counts completed unique bookings and uses the clinic day for current agenda status', () => {
    expect(sql).toContain("COUNT(DISTINCT NULLIF(dados_saida->>'agendamento_id', ''))");
    expect(sql).toContain("tipo_acao = 'criar_agendamento' AND sucesso IS TRUE");
    expect(sql).toContain("America/Sao_Paulo");
    expect(sql).toContain("status = 'confirmado'");
    expect(sql).toContain("status = 'faltou'");
    expect(sql).toContain("tipo = 'whatsapp' AND status = 'erro'");
  });
});
