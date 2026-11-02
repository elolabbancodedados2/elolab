import { describe, expect, it } from 'vitest';
import { dataDoRecurso, filtrarBundleFhir } from '@/lib/fhirExportFiltro';

const bundle = {
  resourceType: 'Bundle' as const,
  type: 'collection',
  total: 5,
  entry: [
    { resource: { resourceType: 'Patient', id: 'p' } },
    { resource: { resourceType: 'AllergyIntolerance', id: 'a', recordedDate: '2020-01-01' } },
    { resource: { resourceType: 'Encounter', id: 'e1', period: { start: '2026-01-10T10:00:00Z' } } },
    { resource: { resourceType: 'Encounter', id: 'e2', period: { start: '2026-06-10T10:00:00Z' } } },
    { resource: { resourceType: 'Observation', id: 'o', effectiveDateTime: '2026-06-10' } },
  ],
};

describe('filtrarBundleFhir', () => {
  it('mantém o paciente e filtra por grupo e período', () => {
    const filtrado = filtrarBundleFhir(bundle, { grupos: ['atendimentos'], de: '2026-03-01' });
    expect(filtrado.entry!.map(e => e.resource!.id)).toEqual(['p', 'e2']);
    expect(filtrado.total).toBe(2);
  });

  it('sem filtro de período leva todos os grupos marcados', () => {
    const filtrado = filtrarBundleFhir(bundle, { grupos: ['alergias', 'atendimentos', 'exames', 'clinico'] });
    expect(filtrado.entry).toHaveLength(5);
  });

  it('lê a data dos campos usuais do FHIR', () => {
    expect(dataDoRecurso({ resourceType: 'MedicationRequest', authoredOn: '2026-02-03T08:00:00Z' })).toBe('2026-02-03');
    expect(dataDoRecurso({ resourceType: 'Condition' })).toBeNull();
  });
});
