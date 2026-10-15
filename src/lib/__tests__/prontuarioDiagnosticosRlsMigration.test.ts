import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = path.resolve(
  process.cwd(),
  'supabase/migrations/20261013190000_prontuario_diagnosticos_exige_autorizacao.sql',
);
const migration = readFileSync(migrationPath, 'utf8');

describe('diagnostic chart read policy migration', () => {
  it('matches clinic chart authorization and audits access to signed charts', () => {
    expect(migration).toContain('ON public.prontuario_diagnosticos FOR SELECT');
    expect(migration).toContain('TO authenticated');
    expect(migration).toContain('public.is_same_clinica(p.clinica_id)');
    expect(migration).toContain('public.is_admin(auth.uid())');
    expect(migration).toContain('public.is_medico(auth.uid())');
    expect(migration).toContain('public.is_medico_responsavel_do_prontuario(p.medico_id)');
    expect(migration).toContain('public.prontuario_leitura_auditada(p.id)');
    expect(migration).toMatch(/p\.assinado\s+IS\s+NOT\s+TRUE\s+OR\s+public\.prontuario_leitura_auditada\(p\.id\)/);
  });

  it('changes only the read policy and performs no data mutation', () => {
    expect(migration).toMatch(/DROP POLICY IF EXISTS[\s\S]*?ON public\.prontuario_diagnosticos/);
    expect(migration).not.toMatch(/\b(DELETE\s+FROM|TRUNCATE|UPDATE\s+public\.|DROP\s+TABLE)\b/i);
    expect(migration).not.toMatch(/DROP\s+[^;]*CASCADE/i);
  });
});
