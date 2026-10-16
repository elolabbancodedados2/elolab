import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const scopedAuditPolicy = readFileSync('supabase/migrations/20260820130000_historico_pessoal_seguro.sql', 'utf8');
const clinicContextTrigger = readFileSync('supabase/migrations/20260507011432_15fdd274-c714-4b45-b52e-73edbff62513.sql', 'utf8');

describe('contrato de auditoria de mudanças de automação', () => {
  it('exige usuário autenticado e clínica ativa para persistir autoria', () => {
    expect(scopedAuditPolicy).toMatch(/CREATE POLICY "audit_log_insert_scoped"[\s\S]*?WITH CHECK \([\s\S]*?user_id\s*=\s*auth\.uid\(\)[\s\S]*?clinica_id\s*=\s*public\.get_my_clinica_id\(\)/i);
  });

  it('preenche a clínica no registro de auditoria a partir do perfil autenticado', () => {
    expect(clinicContextTrigger).toMatch(/FOREACH t IN ARRAY[\s\S]*?'audit_log'/);
    expect(clinicContextTrigger).toMatch(/CREATE TRIGGER trg_fill_clinica_id BEFORE INSERT OR UPDATE ON public\.%I/);
  });
});
