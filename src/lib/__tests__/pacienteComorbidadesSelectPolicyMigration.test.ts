import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = path.resolve(
  process.cwd(),
  'supabase/migrations/20261013191000_paciente_comorbidades_select_roles.sql',
);
const migration = readFileSync(migrationPath, 'utf8');

describe('patient comorbidities read policy migration', () => {
  it('requires clinic isolation and an operational or clinical role', () => {
    expect(migration).toContain('ON public.paciente_comorbidades FOR SELECT');
    expect(migration).toContain('TO authenticated');
    expect(migration).toContain('public.is_same_clinica(clinica_id)');
    expect(migration).toContain('public.can_access_clinical(auth.uid())');
    expect(migration).toContain('public.can_manage_data(auth.uid())');
    expect(migration).not.toContain('public.has_any_role(auth.uid())');
  });

  it('does not change stored data', () => {
    expect(migration).not.toMatch(/\b(DELETE\s+FROM|TRUNCATE|UPDATE\s+public\.|DROP\s+TABLE)\b/i);
  });
});
