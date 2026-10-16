import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const path = 'supabase/migrations/20261014200000_qualidade_seguranca_assistencial.sql';

describe('persistência confidencial de segurança assistencial', () => {
  it('mantém relato sem vínculo direto com prontuário/paciente e protege identidade por padrão', () => {
    const sql = readFileSync(path, 'utf8');
    expect(sql).toMatch(/CREATE TABLE public\.clinical_safety_reports/i);
    expect(sql).toMatch(/reporter_confidential boolean NOT NULL DEFAULT true/i);
    expect(sql).toMatch(/reporter_user_id uuid/i);
    expect(sql).not.toMatch(/patient_id|paciente_id|prontuario_id/i);
    expect(sql).toMatch(/occurred_at timestamptz NOT NULL/i);
    expect(sql).toMatch(/corrective_action|clinical_safety_updates/i);
  });

  it('isola relatórios, revisões e trilha de leitura do navegador', () => {
    const sql = readFileSync(path, 'utf8');
    for (const table of ['clinical_safety_reports', 'clinical_safety_updates', 'clinical_safety_access_audit', 'clinical_safety_correction_requests']) {
      expect(sql).toMatch(new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, 'i'));
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON TABLE public\\.${table} FROM PUBLIC, anon, authenticated`, 'i'));
      expect(sql).toMatch(new RegExp(`GRANT ALL ON TABLE public\\.${table} TO service_role`, 'i'));
    }
    expect(sql).toMatch(/reporter_confidential boolean NOT NULL DEFAULT true/i);
    expect(sql).toMatch(/action text NOT NULL CHECK \(action IN \('list', 'view', 'create', 'update', 'correction_request', 'correction_review'\)\)/i);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.create_clinical_safety_report[\s\S]*?SET search_path = ''/i);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.apply_clinical_safety_review[\s\S]*?FOR UPDATE/i);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.apply_clinical_safety_review[\s\S]*?FROM PUBLIC, anon, authenticated/i);
    expect(sql).toMatch(/CREATE TABLE public\.clinical_safety_correction_requests[\s\S]*previous_summary text NOT NULL[\s\S]*proposed_summary text NOT NULL/i);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.create_clinical_safety_correction_request[\s\S]*?SET search_path = ''/i);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.resolve_clinical_safety_correction[\s\S]*?FOR UPDATE/i);
  });

  it('limita categorias, severidade e estado operacional', () => {
    const sql = readFileSync(path, 'utf8');
    expect(sql).toMatch(/category text NOT NULL CHECK/i);
    expect(sql).toMatch(/near_miss/i);
    expect(sql).toMatch(/severity text NOT NULL CHECK/i);
    expect(sql).toMatch(/critical/i);
    expect(sql).toMatch(/status text NOT NULL DEFAULT 'submitted' CHECK/i);
    expect(sql).toMatch(/action_required/i);
    expect(sql).toMatch(/status <> 'action_required' OR \(assigned_to IS NOT NULL AND due_at IS NOT NULL\)/i);
  });
});
