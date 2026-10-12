import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationPath = 'supabase/migrations/20261011470000_exame_vinculo_prontuario.sql';

describe('vínculo de solicitação de exame ao prontuário', () => {
  it('grava o prontuário de origem e usa o médico autenticado, sem fallback', () => {
    const page = readFileSync('src/pages/Prontuarios.tsx', 'utf8');
    expect(page).toMatch(/medico_solicitante_id:\s*medicoId/);
    expect(page).toMatch(/prontuario_id:\s*currentProntuario\.id/);
    expect(page).not.toMatch(/medicos\.find\(m => m\.ativo !== false\)/);
  });

  it('valida clínica e paciente antes de aceitar a referência', () => {
    expect(existsSync(migrationPath)).toBe(true);
    const migration = readFileSync(migrationPath, 'utf8');
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS prontuario_id/);
    expect(migration).toMatch(/NEW\.prontuario_id IS NULL[\s\S]*?RETURN NEW[\s\S]*?NEW\.paciente_id IS DISTINCT FROM v_prontuario_paciente[\s\S]*?NEW\.clinica_id IS DISTINCT FROM v_prontuario_clinica/i);
  });

  it('impede médico autenticado de atribuir a solicitação a outro profissional', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    expect(migration).toMatch(/public\.is_medico\(auth\.uid\(\)\)/i);
    expect(migration).toMatch(/m\.user_id\s*=\s*auth\.uid\(\)/i);
    expect(migration).toMatch(/NEW\.medico_solicitante_id\s+IS DISTINCT FROM\s+v_medico_id/i);
    expect(migration).toMatch(/UPDATE OF[\s\S]*?medico_solicitante_id/i);
  });
});
