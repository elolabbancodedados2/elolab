import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20261011460000_convenios_codigo_por_clinica.sql',
  'utf8',
);

describe('unicidade do código de convênio por clínica', () => {
  it('substitui a unicidade global por índices escopados sem clínica', () => {
    expect(migration).toMatch(/DROP CONSTRAINT IF EXISTS convenios_codigo_key/i);
    expect(migration).toMatch(/UNIQUE INDEX[^;]*ON public\.convenios\s*\(clinica_id, codigo\)[^;]*WHERE clinica_id IS NOT NULL/i);
    expect(migration).toMatch(/UNIQUE INDEX[^;]*ON public\.convenios\s*\(codigo\)[^;]*WHERE clinica_id IS NULL/i);
  });

  it('explica duplicidade no escopo da clínica', () => {
    const page = readFileSync('src/pages/Convenios.tsx', 'utf8');
    expect(page).toMatch(/convênio com este código interno nesta clínica/i);
  });
});
