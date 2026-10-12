import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const path = 'supabase/migrations/20261011300000_prescricao_memed_idempotencia.sql';
const migration = existsSync(path) ? readFileSync(path, 'utf8') : '';

describe('idempotencia de prescricoes Memed', () => {
  it('impede marcadores locais duplicados e para se ja houver duplicatas historicas', () => {
    expect(/LOCK TABLE public\.prescricoes IN SHARE ROW EXCLUSIVE MODE/i.test(migration)).toBe(true);
    expect(/HAVING count\(\*\) > 1[\s\S]*?RAISE EXCEPTION/i.test(migration)).toBe(true);
    expect(/CREATE UNIQUE INDEX IF NOT EXISTS prescricoes_memed_marker_unico[\s\S]*?WHERE observacoes LIKE 'Memed:%'/i.test(migration)).toBe(true);
  });

  it('grava a receita em uma operacao transacional idempotente e valida o escopo', () => {
    expect(/FUNCTION public\.registrar_prescricao_memed_local/i.test(migration)).toBe(true);
    expect(/v_paciente_clinica IS DISTINCT FROM p_clinica_id[\s\S]*?v_medico_clinica IS DISTINCT FROM p_clinica_id/i.test(migration)).toBe(true);
    expect(/ON CONFLICT \(clinica_id, observacoes\) WHERE observacoes LIKE 'Memed:%' DO NOTHING/i.test(migration)).toBe(true);
    expect(/TO service_role/i.test(migration)).toBe(true);
    expect(/FROM PUBLIC, anon, authenticated/i.test(migration)).toBe(true);
  });
});
