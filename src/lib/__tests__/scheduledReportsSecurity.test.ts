import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationPath = 'supabase/migrations/20261011230000_relatorios_salvos_acesso_e_propriedade.sql';
const runnerPath = 'supabase/functions/scheduled-reports-runner/index.ts';

describe('autorização de relatórios salvos', () => {
  it('limita operações por clínica, papel e proprietário', () => {
    expect(existsSync(migrationPath)).toBe(true);
    const migration = readFileSync(migrationPath, 'utf8');
    expect(migration).toMatch(/user_id = auth\.uid\(\)/i);
    expect(migration).toMatch(/public\.is_admin\(auth\.uid\(\)\)/i);
    expect(migration).toMatch(/public\.is_financeiro\(auth\.uid\(\)\)/i);
  });

  it('restringe a fonte Pacientes e execuções manuais a quem pode acessá-las', () => {
    const runner = readFileSync(runnerPath, 'utf8');
    expect(runner).toMatch(/pacientes:[\s\S]*?allowedRoles:\s*\["admin"\]/);
    expect(runner).toMatch(/!isCron\s*&&\s*!forceId/);
    expect(runner).toMatch(/!isCron[\s\S]{0,180}callerId !== r\.user_id/);
    expect(runner).toMatch(/!ownerRoles\.has\("admin"\)[\s\S]{0,80}ownerRoles\.has\("medico"\)/);
    expect(runner).toMatch(/\.eq\("user_id", r\.user_id\)[\s\S]{0,100}\.eq\("clinica_id", r\.clinica_id\)/);
    expect(runner).toMatch(/query\.in\(ds\.medicoField, ownerMedicoIds\)/);
    expect(runner).toMatch(/dateRangeInTimeZoneIso\(cfg\.dataInicio, cfg\.dataFim/);
  });

  it('claims each report atomically before email delivery', () => {
    const runner = readFileSync(runnerPath, 'utf8');
    expect(runner).toMatch(/CLAIM_LEASE_MS/);
    expect(runner).toMatch(/\.update\(\{\s*ultima_execucao:\s*claimAt,\s*proxima_execucao:\s*leaseUntil\s*\}\)/);
    expect(runner).toMatch(/\.eq\("ultima_execucao",\s*r\.ultima_execucao\)/);
    expect(runner).toMatch(/\.eq\("ativo",\s*r\.ativo\)/);
    expect(runner).toMatch(/skipped:\s*"em_execucao"/);
    expect(runner.indexOf('ultima_execucao: claimAt')).toBeLessThan(runner.indexOf('const emailResponse = await sendBrevoEmail'));
  });
});
