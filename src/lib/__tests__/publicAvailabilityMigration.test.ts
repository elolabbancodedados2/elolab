import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const path = 'supabase/migrations/20261014180000_check_publico_disponibilidade.sql';

describe('check público de disponibilidade do banco', () => {
  it('é uma função sem dados clínicos, com caminho fixo e permissão explícita para health check anônimo', () => {
    const migration = readFileSync(path, 'utf8');
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.public_availability_check\(\)[\s\S]*RETURNS jsonb[\s\S]*SET search_path = ''/i);
    expect(migration).toMatch(/jsonb_build_object\('ok', true, 'checked_at', pg_catalog\.now\(\)\)/i);
    expect(migration).not.toMatch(/SECURITY DEFINER|FROM public\.(?:pacientes|agendamentos|profiles|clinicas)/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.public_availability_check\(\) FROM PUBLIC/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.public_availability_check\(\) TO anon, authenticated/i);
  });
});
