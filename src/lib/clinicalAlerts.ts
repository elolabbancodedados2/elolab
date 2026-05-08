/**
 * Clinical Safety Alerts System
 * Validações de segurança para prescrições:
 * - Drug-allergy check
 * - Age-appropriate dosing
 * - Pregnancy contraindications
 * - Drug interactions (básico)
 */

import { supabase } from '@/integrations/supabase/client';

export interface ClinicalAlert {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  action?: string;
  canIgnore: boolean;
}

/**
 * Banco de dados de medicamentos com contraindicações
 * Em produção, integrar com API (OpenFDA, DrugBank)
 */
const DRUG_DATABASE = {
  // AINES - Contraindicados em gravidez (trimestre 3), úlcera ativa
  ibuprofen: {
    name: 'Ibuprofeno',
    contraindications: ['pregnancy_trimester3', 'ulcer_disease', 'asthma_severe'],
    ageMin: 3, // meses
    ageMax: null,
    pediatricDose: '5-10 mg/kg',
  },
  naproxen: {
    name: 'Naproxeno',
    contraindications: ['pregnancy_trimester3', 'ulcer_disease', 'renal_disease'],
    ageMin: 12,
    ageMax: null,
    pediatricDose: null,
  },
  // ACE Inibidores - Contraindicados em gravidez
  lisinopril: {
    name: 'Lisinopril',
    contraindications: ['pregnancy', 'hyperkalemia', 'renal_disease_severe'],
    ageMin: 6,
    ageMax: null,
    pediatricDose: '0.07 mg/kg/dia',
  },
  enalapril: {
    name: 'Enalapril',
    contraindications: ['pregnancy', 'hyperkalemia'],
    ageMin: 2,
    ageMax: null,
    pediatricDose: '0.1 mg/kg/dia',
  },
  // Estatinas - Contraindicadas em gravidez
  simvastatin: {
    name: 'Sinvastatina',
    contraindications: ['pregnancy', 'lactation', 'liver_disease'],
    ageMin: 18,
    ageMax: null,
    pediatricDose: null,
  },
  // Tetraciclinas - Contraindicadas em gravidez, crianças <8 anos
  doxycycline: {
    name: 'Doxiciclina',
    contraindications: ['pregnancy', 'lactation', 'children_under8'],
    ageMin: 8,
    ageMax: null,
    pediatricDose: '2-4 mg/kg/dia',
  },
  // Warfarina - Contraindicada em gravidez (1º trimestre)
  warfarin: {
    name: 'Varfarina',
    contraindications: ['pregnancy_trimester1', 'active_bleeding', 'low_platelets'],
    ageMin: 2,
    ageMax: null,
    pediatricDose: 'Calculate based on INR',
  },
};

// Medicamentos alérgenos comuns (expansível)
const COMMON_ALLERGENS: Record<string, string[]> = {
  penicillin: ['amoxicillin', 'ampicillin', 'piperacillin'],
  cephalosporin: ['cephalexin', 'ceftriaxone', 'cefazolin'],
  sulfonamide: ['sulfamethoxazole', 'sulfadiazine'],
  nsaid: ['ibuprofen', 'naproxen', 'aspirin', 'diclofenac'],
};

interface PatientInfo {
  idade?: number; // em anos
  dataNascimento?: string;
  gestante?: boolean;
  amamentando?: boolean;
  alergias?: string[];
  comorbidades?: string[];
  sexo?: 'M' | 'F';
}

/**
 * Verifica alertas de alergia
 */
export function checkAllergyAlerts(
  medicationName: string,
  patientAlergias?: string[]
): ClinicalAlert[] {
  const alerts: ClinicalAlert[] = [];

  if (!patientAlergias || patientAlergias.length === 0) {
    return alerts;
  }

  // Normalizar nome do medicamento
  const medLower = medicationName.toLowerCase();

  // Check alergia direta
  const hasDirectAllergy = patientAlergias.some(
    alergia => medLower.includes(alergia.toLowerCase()) ||
               alergia.toLowerCase().includes(medLower)
  );

  if (hasDirectAllergy) {
    alerts.push({
      id: 'allergy-direct',
      severity: 'critical',
      title: '⚠️ ALERGIA CONFIRMADA',
      message: `Paciente tem alergia registrada para ${medicationName}. NÃO prescrever!`,
      canIgnore: false,
    });
    return alerts;
  }

  // Check alergia de classe (ex: alergia a penicilina → evitar amoxicilina)
  for (const [allergyClass, drugs] of Object.entries(COMMON_ALLERGENS)) {
    const hasClassAllergy = patientAlergias.some(
      alergia => alergia.toLowerCase().includes(allergyClass.toLowerCase())
    );

    if (hasClassAllergy && drugs.some(drug => medLower.includes(drug.toLowerCase()))) {
      alerts.push({
        id: `allergy-class-${allergyClass}`,
        severity: 'critical',
        title: `⚠️ POTENCIAL REAÇÃO CRUZADA (${allergyClass})`,
        message: `Paciente tem alergia a ${allergyClass}. ${medicationName} é da mesma classe. Cuidado!`,
        action: 'Considerar alternativa terapêutica',
        canIgnore: true,
      });
    }
  }

  return alerts;
}

/**
 * Verifica alertas de idade/gravidez/amamentação
 */
export function checkAgeAndReproductiveAlerts(
  medicationName: string,
  patientInfo: PatientInfo
): ClinicalAlert[] {
  const alerts: ClinicalAlert[] = [];
  const medLower = medicationName.toLowerCase();

  // Calcular idade se data de nascimento fornecida
  let ageYears = patientInfo.idade;
  if (!ageYears && patientInfo.dataNascimento) {
    const born = new Date(patientInfo.dataNascimento);
    const today = new Date();
    ageYears = today.getFullYear() - born.getFullYear();
    if (today < new Date(today.getFullYear(), born.getMonth(), born.getDate())) {
      ageYears--;
    }
  }

  // Buscar medicamento no banco de dados
  const drug = Object.values(DRUG_DATABASE).find(d =>
    d.name.toLowerCase().includes(medLower) ||
    medLower.includes(d.name.toLowerCase())
  );

  if (!drug) return alerts;

  // Check idade
  if (ageYears && drug.ageMin && ageYears < drug.ageMin) {
    alerts.push({
      id: 'age-too-young',
      severity: 'critical',
      title: '👶 NÃO RECOMENDADO PARA IDADE',
      message: `${medicationName} é recomendado apenas acima de ${drug.ageMin} anos. Paciente tem ${ageYears} anos.`,
      action: `Dose pediátrica: ${drug.pediatricDose || 'Consultar literatura'}`,
      canIgnore: false,
    });
  }

  // Check gravidez
  if (patientInfo.gestante) {
    if (drug.contraindications.includes('pregnancy')) {
      alerts.push({
        id: 'pregnancy-absolute',
        severity: 'critical',
        title: '🤰 CONTRAINDICADO EM GRAVIDEZ',
        message: `${medicationName} é CONTRAINDICADO em gravidez. Escolher alternativa segura.`,
        canIgnore: false,
      });
    } else if (drug.contraindications.includes('pregnancy_trimester3')) {
      alerts.push({
        id: 'pregnancy-trimester3',
        severity: 'warning',
        title: '🤰 EVITAR NO 3º TRIMESTRE',
        message: `${medicationName} deve ser evitado no 3º trimestre de gravidez. Confirmar trimestre.`,
        action: 'Considerar alternativa ou interrupção antes do parto',
        canIgnore: true,
      });
    } else if (drug.contraindications.includes('pregnancy_trimester1')) {
      alerts.push({
        id: 'pregnancy-trimester1',
        severity: 'warning',
        title: '🤰 EVITAR NO 1º TRIMESTRE',
        message: `${medicationName} deve ser evitado no 1º trimestre (teratogênese). Confirmar trimestre.`,
        canIgnore: true,
      });
    }
  }

  // Check amamentação
  if (patientInfo.amamentando && drug.contraindications.includes('lactation')) {
    alerts.push({
      id: 'lactation-contraindicated',
      severity: 'warning',
      title: '🤱 EVITAR DURANTE AMAMENTAÇÃO',
      message: `${medicationName} passa para leite materno e pode afetar bebê.`,
      action: 'Considerar interrupção temporária da amamentação ou usar alternativa',
      canIgnore: true,
    });
  }

  return alerts;
}

/**
 * Verifica alertas de comorbidades
 */
export function checkComorbidityAlerts(
  medicationName: string,
  comorbidades?: string[]
): ClinicalAlert[] {
  const alerts: ClinicalAlert[] = [];

  if (!comorbidades || comorbidades.length === 0) {
    return alerts;
  }

  const medLower = medicationName.toLowerCase();
  const drug = Object.values(DRUG_DATABASE).find(d =>
    d.name.toLowerCase().includes(medLower) ||
    medLower.includes(d.name.toLowerCase())
  );

  if (!drug) return alerts;

  // Check cada comorbidade
  for (const comorbidade of comorbidades) {
    const comLower = comorbidade.toLowerCase();

    if (drug.contraindications.some(c => comLower.includes(c) || c.includes(comLower))) {
      alerts.push({
        id: `comorbidity-${comorbidade}`,
        severity: 'warning',
        title: `⚠️ CONTRAINDICADO EM ${comorbidade.toUpperCase()}`,
        message: `${medicationName} é contraindicado em pacientes com ${comorbidade}. Considerar alternativa.`,
        canIgnore: true,
      });
    }
  }

  return alerts;
}

/**
 * Consolidar todos os alertas (versão síncrona)
 */
export function consolidateAlerts(
  medicationName: string,
  patientInfo: PatientInfo
): ClinicalAlert[] {
  const allAlerts = [
    ...checkAllergyAlerts(medicationName, patientInfo.alergias),
    ...checkAgeAndReproductiveAlerts(medicationName, patientInfo),
    ...checkComorbidityAlerts(medicationName, patientInfo.comorbidades),
  ];

  // Remover duplicatas
  const seen = new Set<string>();
  return allAlerts.filter(alert => {
    if (seen.has(alert.id)) return false;
    seen.add(alert.id);
    return true;
  });
}

/**
 * Consolidar alertas COM verificação de interações (async)
 */
export async function consolidateAlertsWithInteractions(
  medications: string[],
  patientInfo: PatientInfo
): Promise<ClinicalAlert[]> {
  const { checkDrugInteractions, interactionsToAlerts } = await import('./drugInteractionChecker');

  const allAlerts: ClinicalAlert[] = [];

  // Alertas por medicamento
  for (const med of medications) {
    allAlerts.push(...consolidateAlerts(med, patientInfo));
  }

  // Alertas de interação
  if (medications.length > 1) {
    const interactions = await checkDrugInteractions(medications);
    const interactionAlerts = interactionsToAlerts(interactions);
    allAlerts.push(...interactionAlerts);
  }

  // Remover duplicatas
  const seen = new Set<string>();
  return allAlerts.filter(alert => {
    if (seen.has(alert.id)) return false;
    seen.add(alert.id);
    return true;
  });
}

/**
 * Extrair nomes de medicamentos de um texto (muito básico)
 * Em produção, usar NLP/regex avançado ou API
 */
export function extractMedicationNames(text: string): string[] {
  if (!text) return [];

  // Procurar por padrões como "Medicamento X", linhas com mg, etc
  const medications: string[] = [];

  // Split por quebra de linha
  const lines = text.split('\n');
  for (const line of lines) {
    // Procurar por padrão: Palavra começando com maiúscula seguida de número/mg
    const match = line.match(/^([A-Za-z\s]+(?:\d+)?(?:mg)?)/i);
    if (match && match[1].trim().length > 2) {
      medications.push(match[1].trim());
    }
  }

  return [...new Set(medications)]; // Remove duplicatas
}

/**
 * Helper: verificar se medicação é segura
 * Retorna boolean (true = seguro, false = alertas críticos)
 */
export function isMedicationSafe(alerts: ClinicalAlert[]): boolean {
  return !alerts.some(a => a.severity === 'critical' && !a.canIgnore);
}
