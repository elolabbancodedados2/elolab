/**
 * Filtros aplicados ao Bundle FHIR antes de proteger e baixar o arquivo.
 *
 * A função de exportação devolve o histórico completo do paciente; aqui o
 * usuário escolhe quais grupos de recursos e qual período levar. Patient fica
 * sempre (identifica o titular) e recursos sem data entram em qualquer período.
 */

export type GrupoFhir = 'alergias' | 'atendimentos' | 'exames' | 'clinico';

export const GRUPOS_FHIR: Array<{ chave: GrupoFhir; rotulo: string; tipos: string[] }> = [
  { chave: 'alergias', rotulo: 'Alergias', tipos: ['AllergyIntolerance'] },
  { chave: 'atendimentos', rotulo: 'Atendimentos e evoluções', tipos: ['Encounter', 'Composition'] },
  { chave: 'exames', rotulo: 'Exames e laudos', tipos: ['ServiceRequest', 'DiagnosticReport'] },
  { chave: 'clinico', rotulo: 'Sinais vitais, diagnósticos e prescrições', tipos: ['Observation', 'Condition', 'MedicationRequest'] },
];

type Recurso = Record<string, any> & { resourceType?: string };
type Bundle = { resourceType: 'Bundle'; entry?: Array<{ resource?: Recurso } & Record<string, unknown>> } & Record<string, unknown>;

/** Data clínica do recurso (AAAA-MM-DD), quando houver. */
export function dataDoRecurso(recurso: Recurso | undefined): string | null {
  if (!recurso) return null;
  const candidatos = [
    recurso.effectiveDateTime, recurso.effectivePeriod?.start, recurso.issued, recurso.authoredOn,
    recurso.recordedDate, recurso.onsetDateTime, recurso.period?.start, recurso.date,
  ];
  const valor = candidatos.find(item => typeof item === 'string' && /^\d{4}-\d{2}-\d{2}/.test(item));
  return valor ? valor.slice(0, 10) : null;
}

export function filtrarBundleFhir<T extends Bundle>(
  bundle: T,
  filtro: { grupos: GrupoFhir[]; de?: string; ate?: string },
): T {
  const tiposPermitidos = new Set(GRUPOS_FHIR.filter(g => filtro.grupos.includes(g.chave)).flatMap(g => g.tipos));
  const entry = (bundle.entry ?? []).filter(item => {
    const recurso = item.resource;
    const tipo = recurso?.resourceType;
    if (tipo === 'Patient') return true;
    const conhecido = GRUPOS_FHIR.some(g => g.tipos.includes(tipo ?? ''));
    // Tipos fora dos grupos conhecidos seguem junto com "clínico".
    if (conhecido ? !tiposPermitidos.has(tipo!) : !filtro.grupos.includes('clinico')) return false;
    const data = dataDoRecurso(recurso);
    if (!data) return true;
    if (filtro.de && data < filtro.de) return false;
    if (filtro.ate && data > filtro.ate) return false;
    return true;
  });
  return { ...bundle, entry, ...('total' in bundle ? { total: entry.length } : {}) };
}
