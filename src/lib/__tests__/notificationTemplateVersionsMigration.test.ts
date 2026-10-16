import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationPath = 'supabase/migrations/20261014150000_historico_versoes_templates_comunicacao.sql';
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : '';

describe('histórico de versões de modelos de comunicação', () => {
  it('guarda snapshots versionados sem dependência destrutiva do modelo', () => {
    expect(migration).toMatch(/CREATE TABLE public\.notification_template_versions/i);
    expect(migration).toMatch(/template_id uuid NOT NULL/i);
    expect(migration).toMatch(/revision integer NOT NULL/i);
    expect(migration).toMatch(/snapshot jsonb NOT NULL/i);
    expect(migration).toMatch(/UNIQUE \(template_id, revision\)/i);
    expect(migration).not.toMatch(/template_id uuid[^,\n]*REFERENCES public\.notification_templates/i);
    expect(migration).toMatch(/clinica_id uuid REFERENCES public\.clinicas\(id\) ON DELETE CASCADE/i);
  });

  it('restringe leitura aos administradores da clínica e bloqueia escrita direta', () => {
    expect(migration).toMatch(/ALTER TABLE public\.notification_template_versions ENABLE ROW LEVEL SECURITY/i);
    expect(migration).toMatch(/FOR SELECT TO authenticated[\s\S]*?public\.is_admin\(auth\.uid\(\)\)[\s\S]*?public\.is_same_clinica\(clinica_id\)/i);
    expect(migration).toMatch(/REVOKE INSERT, UPDATE, DELETE, TRUNCATE[\s\S]*?FROM anon, authenticated/i);
    expect(migration).not.toMatch(/CREATE POLICY[\s\S]*?FOR (?:INSERT|UPDATE|DELETE)[\s\S]*?notification_template_versions/i);
  });

  it('marca versões preexistentes como baseline sem atribuir autoria retroativa', () => {
    expect(migration).toMatch(/INSERT INTO public\.notification_template_versions[\s\S]*?'baseline'[\s\S]*?'legacy'[\s\S]*?FROM public\.notification_templates/i);
    expect(migration).toMatch(/estado atual vira baseline, sem atribuição retroativa de autoria/i);
    expect(migration).not.toMatch(/'legacy',[\s\S]{0,80}created_at/i);
  });

  it('registra criação, alteração e remoção no banco com autor derivado da sessão', () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.capture_notification_template_version\(\)[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = ''/i);
    expect(migration).toMatch(/v_author_id uuid := auth\.uid\(\)/i);
    expect(migration).toMatch(/FROM public\.profiles AS profile[\s\S]*?profile\.id = v_author_id/i);
    expect(migration).toMatch(/'created'[\s\S]*?'updated'[\s\S]*?'deleted'/i);
    expect(migration).toMatch(/AFTER INSERT OR UPDATE OR DELETE ON public\.notification_templates/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.capture_notification_template_version\(\) FROM PUBLIC, anon, authenticated/i);
  });
});
