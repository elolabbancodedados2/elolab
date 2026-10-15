import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('supabase/functions/patient-clinical-summary/index.ts', 'utf8');

describe('patient-clinical-summary authorization', () => {
  it('records the clinical-history read before loading patient data', () => {
    const auditIndex = source.indexOf('authClient.rpc("registrar_visualizacao_historico_paciente"');
    const recordsIndex = source.indexOf('authClient.from("prontuarios")');

    expect(auditIndex).toBeGreaterThan(-1);
    expect(recordsIndex).toBeGreaterThan(auditIndex);
    expect(source).toMatch(/if\s*\(auditError\)[\s\S]*?status:\s*403/);
  });

  it('uses the caller JWT for clinical queries and limits service role to identity lookup', () => {
    const serviceRoleTables = [...source.matchAll(/serviceClient\.from\("([^"]+)"\)/g)]
      .map((match) => match[1])
      .sort();

    expect(serviceRoleTables).toEqual(['profiles', 'user_roles']);
    for (const table of ['pacientes', 'prontuarios', 'prescricoes', 'exames', 'atestados']) {
      expect(source).toContain(`authClient.from("${table}")`);
    }
    expect(source).toContain('(authClient as any).from("paciente_comorbidades")');
  });

  it('does not send clinical data to the AI gateway when there is no auditable record', () => {
    const noAuditCoverageIndex = source.indexOf('if (!pront.data?.length)');
    const providerIndex = source.indexOf('NVIDIA_API_KEY');

    expect(noAuditCoverageIndex).toBeGreaterThan(-1);
    expect(providerIndex).toBeGreaterThan(noAuditCoverageIndex);
    expect(source.slice(noAuditCoverageIndex, providerIndex)).toMatch(/status:\s*403/);
  });
});
