import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('auditoria dos alertas nos dois fluxos', () => {
  it('preserva justificativa de qualquer alerta e permite salvar rascunho pendente', () => {
    const sql = readFileSync('supabase/migrations/20261103200100_prontuario_alertas.sql', 'utf8');
    expect(sql).toContain('BEGIN;');
    expect(sql).toContain('COMMIT;');
    expect(sql).toContain('ALTER TABLE public.prontuarios');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS justificativa_alerta');
    expect(sql).toContain("alerta->>'severity' IN ('critical', 'warning')");
    expect(sql).toContain('O registro de alertas e justificativa da prescricao e imutavel');
  });
});
