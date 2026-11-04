/**
 * Drug Interaction Checker
 * Regras locais compartilhadas pelo motor clinicalAlerts.
 */

/**
 * Base única de interações locais (cobertura limitada)
 * Formato: [drug1, drug2] → interação
 */
const LOCAL_INTERACTIONS: Record<string, { severity: 'major' | 'moderate' | 'minor', description: string }> = {
  'warfarin-ibuprofen': { severity: 'major', description: 'Risco aumentado de sangramento gastrointestinal' },
  'enalapril-spironolactone': { severity: 'moderate', description: 'Risco de hipercalemia' },
  'losartan-spironolactone': { severity: 'moderate', description: 'Risco de hipercalemia' },
  'simvastatin-amiodarone': { severity: 'major', description: 'Risco aumentado de miopatia/rabdomiólise' },
  'fluoxetine-tramadol': { severity: 'major', description: 'Risco de síndrome serotoninérgica' },
  'ciprofloxacin-theophylline': { severity: 'moderate', description: 'Aumento dos níveis de teofilina' },
  'warfarin-aspirin': {
    severity: 'major',
    description: 'Risco aumentado de sangramento',
  },
  'metformin-iodinatedcontrast': {
    severity: 'major',
    description: 'Risco de acidose láctica com contraste iodado',
  },
  'lisinopril-potassium': {
    severity: 'major',
    description: 'Risco de hipercalemia grave',
  },
  'simvastatin-clarithromycin': {
    severity: 'major',
    description: 'Aumento 10x do risco de miopatia',
  },
  'methotrexate-nsaid': {
    severity: 'major',
    description: 'Redução de clearance, toxicidade renal aumentada',
  },
  'ssri-maoi': {
    severity: 'major',
    description: 'Risco de síndrome serotonérgica potencialmente fatal',
  },
  'digoxin-amiodarone': {
    severity: 'major',
    description: 'Aumento de nível sérico de digoxina',
  },
  'clopidogrel-omeprazole': {
    severity: 'moderate',
    description: 'Redução de eficácia antitrombótica',
  },
  'metoprolol-diltiazem': {
    severity: 'moderate',
    description: 'Risco de bloqueio AV, bradicardia',
  },
  'ibuprofen-lisinopril': {
    severity: 'moderate',
    description: 'Redução de efeito anti-hipertensivo, risco renal',
  },
  'acetaminophen-warfarin': {
    severity: 'moderate',
    description: 'Aumento de INR com doses altas de acetaminofeno',
  },
};

export interface DrugInteraction {
  drug1: string;
  drug2: string;
  severity: 'major' | 'moderate' | 'minor';
  description: string;
  source: 'openfda' | 'local';
}

/**
 * Normalizar nome de medicamento
 */
function normalizeDrugName(name: string): string {
  let value = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const aliases: Record<string, string> = {
    varfarina: 'warfarin', aas: 'aspirin', aspirina: 'aspirin', 'acido acetilsalicilico': 'aspirin',
    metformina: 'metformin', 'contraste iodado': 'iodinatedcontrast', lisinopril: 'lisinopril', potassio: 'potassium',
    sinvastatina: 'simvastatin', claritromicina: 'clarithromycin', metotrexato: 'methotrexate', aines: 'nsaid',
    digoxina: 'digoxin', amiodarona: 'amiodarone', omeprazol: 'omeprazole', metoprolol: 'metoprolol',
    ibuprofeno: 'ibuprofen', paracetamol: 'acetaminophen', enalapril: 'enalapril',
    espironolactona: 'spironolactone', losartana: 'losartan', fluoxetina: 'fluoxetine',
    ciprofloxacino: 'ciprofloxacin', teofilina: 'theophylline',
  };
  for (const [alias, canonical] of Object.entries(aliases)) {
    value = value.replace(new RegExp(`(^|\\b)${alias}(?=\\b|[0-9])`, 'g'), canonical);
  }
  return value.replace(/\s+/g, '').replace(/[^\w]/g, '');
}

/**
 * Buscar na base local
 */
function checkLocalInteractions(drug1: string, drug2: string): DrugInteraction | null {
  const norm1 = normalizeDrugName(drug1);
  const norm2 = normalizeDrugName(drug2);

  for (const [key, data] of Object.entries(LOCAL_INTERACTIONS)) {
    const [k1, k2] = key.split('-');
    if (
      (norm1.includes(k1) && norm2.includes(k2)) ||
      (norm1.includes(k2) && norm2.includes(k1))
    ) {
      return {
        drug1,
        drug2,
        ...data,
        source: 'local',
      };
    }
  }

  return null;
}

/**
 * Check interações entre múltiplos medicamentos
 */
export function checkDrugInteractions(medications: string[]): DrugInteraction[] {
  const interactions: DrugInteraction[] = [];
  const seen = new Set<string>();

  // Todas as combinações
  for (let i = 0; i < medications.length; i++) {
    for (let j = i + 1; j < medications.length; j++) {
      const drug1 = medications[i];
      const drug2 = medications[j];
      const key = [normalizeDrugName(drug1), normalizeDrugName(drug2)].sort().join('-');

      if (seen.has(key)) continue;
      seen.add(key);

      const interaction = checkLocalInteractions(drug1, drug2);

      if (interaction) {
        interactions.push(interaction);
      }
    }
  }

  return interactions;
}

/**
 * Helper: Converter interações em alertas clínicos
 */
export function interactionsToAlerts(interactions: DrugInteraction[]) {
  return interactions.map((inter, idx) => ({
    id: `interaction-${idx}`,
    severity: inter.severity === 'major' ? 'critical' : inter.severity === 'moderate' ? 'warning' : 'info',
    title: `⚠️ INTERAÇÃO: ${inter.drug1} + ${inter.drug2}`,
    message: inter.description,
    action: `Consultar ${inter.source === 'openfda' ? 'OpenFDA' : 'referência'} para detalhes completos`,
    canIgnore: inter.severity !== 'major',
  }));
}
