/**
 * Drug Interaction Checker
 * Integração com OpenFDA para verificar interações medicamentosas
 * Fallback para base de dados local se API indisponível
 */

/**
 * Base de dados local de interações (fallback se OpenFDA down)
 * Formato: [drug1, drug2] → interação
 */
const LOCAL_INTERACTIONS: Record<string, { severity: 'major' | 'moderate' | 'minor', description: string }> = {
  'warfarin-aspirin': {
    severity: 'major',
    description: 'Aumento significativo do risco de sangramento',
  },
  'metformin-iodinated-contrast': {
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
  return name.toLowerCase().replace(/\s+/g, '').replace(/[^\w]/g, '');
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
 * Buscar na OpenFDA (com cache)
 * Em produção, implementar rate limiting + cache
 */
async function checkOpenFDAInteractions(drug1: string, drug2: string): Promise<DrugInteraction | null> {
  try {
    // OpenFDA Drug Interactions API
    // Docs: https://open.fda.gov/apis/drug/drugsfda/
    const query = `(${drug1} AND ${drug2})`;
    const url = `https://api.fda.gov/drug/label.json?search=openfda_rxcui:${encodeURIComponent(drug1)}&limit=10`;

    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });

    if (!response.ok) {
      return null; // OpenFDA failed, use local
    }

    const data = await response.json();

    // Parse resposta (implementação simplificada)
    if (data.results && data.results.length > 0) {
      const warnings = data.results[0].warnings || [];
      const hasInteraction = warnings.some((w: string) =>
        w.toLowerCase().includes(drug2.toLowerCase())
      );

      if (hasInteraction) {
        return {
          drug1,
          drug2,
          severity: 'major',
          description: `Possível interação detectada via OpenFDA. Consulte bula completa.`,
          source: 'openfda',
        };
      }
    }

    return null;
  } catch (error) {
    console.warn('OpenFDA check failed, using local database:', error);
    return null;
  }
}

/**
 * Check interações entre múltiplos medicamentos
 */
export async function checkDrugInteractions(medications: string[]): Promise<DrugInteraction[]> {
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

      // Tentar local primeiro (rápido)
      let interaction = checkLocalInteractions(drug1, drug2);

      // Se não encontrou, tentar OpenFDA
      if (!interaction) {
        interaction = await checkOpenFDAInteractions(drug1, drug2);
      }

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
