/**
 * Clinical Safety Alerts System
 * Validações de segurança para prescrições:
 * - Drug-allergy check
 * - Age-appropriate dosing
 * - Pregnancy contraindications
 * - Drug interactions (básico)
 */

import { supabase } from '@/integrations/supabase/client';
import { parseDateOnly } from './dateOnly';

export interface ClinicalAlert {
  id: string;
   severity: 'info' | 'warning' | 'critical' | string;
  title: string;
  message: string;
  action?: string;
  canIgnore: boolean;
}

/**
 * Normaliza texto para casamento: minúsculas, sem acento, sem pontuação.
 *
 * Existe porque a tabela abaixo era em inglês e o que chega do prontuário é em
 * português. `"penicilina".includes("penicillin")` é falso, então a checagem de
 * reação cruzada — justamente a que exige conhecimento farmacológico — nunca
 * disparava numa clínica brasileira.
 */
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // marcas de acento, já separadas pelo NFD
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** `alvo` contém `termo` como palavra inteira (evita "as" casar dentro de "gastrite"). */
function contemTermo(alvo: string, termo: string): boolean {
  const t = normalizar(termo);
  if (!t) return false;
  return new RegExp(`(^| )${t.replace(/ /g, ' ')}( |$)`).test(alvo);
}

interface Medicamento {
  nome: string;
  /** Como o medicamento pode aparecer escrito na receita (PT e EN). */
  sinonimos: string[];
  contraindicacoes: string[];
  /** Idade mínima EM MESES. Antes era um campo `ageMin` ambíguo: o ibuprofeno
   *  estava marcado "3 // meses" e era comparado contra anos, bloqueando um
   *  antitérmico comum em toda criança de menos de 3 anos. */
  idadeMinimaMeses: number | null;
  dosePediatrica?: string | null;
}

/**
 * Banco de medicamentos com contraindicações.
 * Em produção, integrar com API (OpenFDA, DrugBank, Anvisa).
 */
const DRUG_DATABASE: Record<string, Medicamento> = {
  // AINEs — evitar no 3º trimestre, úlcera ativa
  ibuprofeno: {
    nome: 'Ibuprofeno',
    sinonimos: ['ibuprofeno', 'ibuprofen', 'alivium', 'advil'],
    contraindicacoes: ['ulcera', 'asma_grave', 'gravidez_3o_trimestre'],
    idadeMinimaMeses: 3,
    dosePediatrica: '5-10 mg/kg',
  },
  naproxeno: {
    nome: 'Naproxeno',
    sinonimos: ['naproxeno', 'naproxen', 'flanax'],
    contraindicacoes: ['ulcera', 'doenca_renal', 'gravidez_3o_trimestre'],
    idadeMinimaMeses: 12 * 12,
    dosePediatrica: null,
  },
  // IECA — contraindicados na gravidez inteira
  lisinopril: {
    nome: 'Lisinopril',
    sinonimos: ['lisinopril'],
    contraindicacoes: ['gravidez', 'hipercalemia', 'doenca_renal_grave'],
    idadeMinimaMeses: 6 * 12,
    dosePediatrica: '0,07 mg/kg/dia',
  },
  enalapril: {
    nome: 'Enalapril',
    sinonimos: ['enalapril', 'renitec'],
    contraindicacoes: ['gravidez', 'hipercalemia'],
    idadeMinimaMeses: 2 * 12,
    dosePediatrica: '0,1 mg/kg/dia',
  },
  // Estatinas — contraindicadas na gravidez e amamentação
  sinvastatina: {
    nome: 'Sinvastatina',
    sinonimos: ['sinvastatina', 'simvastatina', 'simvastatin', 'zocor'],
    contraindicacoes: ['gravidez', 'amamentacao', 'doenca_hepatica'],
    idadeMinimaMeses: 18 * 12,
    dosePediatrica: null,
  },
  // Tetraciclinas — contraindicadas na gravidez e em menores de 8 anos
  doxiciclina: {
    nome: 'Doxiciclina',
    sinonimos: ['doxiciclina', 'doxycycline', 'vibramicina'],
    contraindicacoes: ['gravidez', 'amamentacao'],
    idadeMinimaMeses: 8 * 12,
    dosePediatrica: '2-4 mg/kg/dia',
  },
  varfarina: {
    nome: 'Varfarina',
    sinonimos: ['varfarina', 'warfarina', 'warfarin', 'marevan'],
    contraindicacoes: ['sangramento_ativo', 'plaquetopenia', 'gravidez_1o_trimestre'],
    idadeMinimaMeses: 2 * 12,
    dosePediatrica: 'Ajustar pelo INR',
  },
};

/**
 * Classes alergênicas e reação cruzada.
 *
 * `termosAlergia` é como a alergia aparece escrita no prontuário; `medicamentos`
 * é como o remédio aparece escrito na receita. Os dois lados precisam existir em
 * português — era exatamente o que faltava.
 */
const CLASSES_ALERGENICAS: Record<string, {
  rotulo: string;
  termosAlergia: string[];
  medicamentos: string[];
}> = {
  penicilinas: {
    rotulo: 'penicilinas',
    termosAlergia: ['penicilina', 'penicilinas', 'penicillin', 'benzetacil', 'betalactamico', 'betalactamicos'],
    medicamentos: ['amoxicilina', 'amoxicillin', 'ampicilina', 'ampicillin', 'penicilina', 'benzilpenicilina', 'benzetacil', 'piperacilina', 'oxacilina'],
  },
  cefalosporinas: {
    rotulo: 'cefalosporinas',
    termosAlergia: ['cefalosporina', 'cefalosporinas', 'cephalosporin', 'betalactamico', 'betalactamicos'],
    medicamentos: ['cefalexina', 'cephalexin', 'ceftriaxona', 'ceftriaxone', 'cefazolina', 'cefuroxima', 'cefaclor'],
  },
  sulfas: {
    rotulo: 'sulfas',
    termosAlergia: ['sulfa', 'sulfas', 'sulfonamida', 'sulfonamidas', 'sulfonamide', 'bactrim'],
    medicamentos: ['sulfametoxazol', 'sulfamethoxazole', 'trimetoprima', 'bactrim', 'sulfadiazina'],
  },
  aines: {
    rotulo: 'anti-inflamatórios (AINEs)',
    termosAlergia: ['aine', 'aines', 'nsaid', 'anti inflamatorio', 'antiinflamatorio', 'aas', 'aspirina', 'dipirona'],
    medicamentos: ['ibuprofeno', 'ibuprofen', 'naproxeno', 'naproxen', 'aas', 'aspirina', 'acido acetilsalicilico', 'diclofenaco', 'cetoprofeno', 'nimesulida'],
  },
};

/**
 * Reação cruzada entre classes distintas. Alergia a penicilina implica cuidado
 * com cefalosporina (risco cruzado descrito na literatura), e vice-versa.
 */
const REACAO_CRUZADA_ENTRE_CLASSES: Record<string, string[]> = {
  penicilinas: ['cefalosporinas'],
  cefalosporinas: ['penicilinas'],
};

/**
 * Como cada contraindicação aparece escrita na lista de comorbidades do
 * paciente. Sem este mapa, `comorbidade.includes('ulcer_disease')` nunca casava
 * com "Úlcera gástrica" e o alerta de comorbidade também era código morto.
 */
const TERMOS_COMORBIDADE: Record<string, string[]> = {
  ulcera: ['ulcera', 'ulcera gastrica', 'ulcera peptica', 'ulcera duodenal', 'gastrite erosiva', 'doenca ulcerosa'],
  asma_grave: ['asma grave', 'asma de dificil controle', 'asma persistente grave'],
  doenca_renal: ['doenca renal', 'insuficiencia renal', 'nefropatia', 'irc', 'doenca renal cronica'],
  doenca_renal_grave: ['insuficiencia renal grave', 'doenca renal cronica avancada', 'dialise', 'hemodialise'],
  doenca_hepatica: ['doenca hepatica', 'hepatopatia', 'cirrose', 'insuficiencia hepatica', 'hepatite'],
  hipercalemia: ['hipercalemia', 'hiperpotassemia', 'potassio alto'],
  sangramento_ativo: ['sangramento ativo', 'hemorragia', 'sangramento digestivo'],
  plaquetopenia: ['plaquetopenia', 'trombocitopenia', 'plaquetas baixas'],
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

/** Acha o medicamento na tabela pelo texto livre digitado na receita. */
function acharMedicamento(medicationName: string): Medicamento | undefined {
  const alvo = normalizar(medicationName);
  if (!alvo) return undefined;
  return Object.values(DRUG_DATABASE).find(d =>
    d.sinonimos.some(s => contemTermo(alvo, s))
  );
}

/**
 * Idade em meses. Prefere a data de nascimento à idade recebida pronta: a tela
 * de receitas passava uma idade calculada sem ajuste de aniversário, e como o
 * campo pronto tinha precedência, essa conta ruim substituía a conta correta.
 */
function idadeEmMeses(patientInfo: PatientInfo): number | null {
  const nasc = patientInfo.dataNascimento ? parseDateOnly(patientInfo.dataNascimento) : null;
  if (nasc && !Number.isNaN(nasc.getTime())) {
    const hoje = new Date();
    let meses = (hoje.getFullYear() - nasc.getFullYear()) * 12 + (hoje.getMonth() - nasc.getMonth());
    if (hoje.getDate() < nasc.getDate()) meses--;
    return Math.max(0, meses);
  }
  if (patientInfo.idade != null && Number.isFinite(patientInfo.idade)) {
    return Math.max(0, Math.round(patientInfo.idade * 12));
  }
  return null;
}

/** "8 meses", "1 ano e 2 meses", "5 anos" — para a mensagem ficar legível. */
function descreverIdade(meses: number): string {
  if (meses < 24) return `${meses} ${meses === 1 ? 'mês' : 'meses'}`;
  const anos = Math.floor(meses / 12);
  const resto = meses % 12;
  if (resto === 0) return `${anos} anos`;
  return `${anos} ano${anos > 1 ? 's' : ''} e ${resto} ${resto === 1 ? 'mês' : 'meses'}`;
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

  const med = normalizar(medicationName);
  if (!med) return alerts;

  const alergiasNorm = patientAlergias
    .map(a => normalizar(a))
    .filter(Boolean);

  // ─── Alergia direta ───
  // O nome do medicamento na receita costuma vir com dose junto
  // ("Amoxicilina 500mg"), então a alergia registrada precisa ser procurada
  // dentro dele — e vice-versa, quando a alergia é que traz a apresentação.
  const alergiaDireta = alergiasNorm.some(
    alergia => contemTermo(med, alergia) || contemTermo(alergia, med)
  );

  if (alergiaDireta) {
    alerts.push({
      id: 'allergy-direct',
      severity: 'critical',
      title: '⚠️ ALERGIA CONFIRMADA',
      message: `Paciente tem alergia registrada para ${medicationName}. NÃO prescrever!`,
      canIgnore: false,
    });
    return alerts;
  }

  // ─── Reação cruzada por classe ───
  // Classes a que o paciente é alérgico, pelo que está escrito no prontuário.
  const classesDoPaciente = new Set<string>();
  for (const [chave, classe] of Object.entries(CLASSES_ALERGENICAS)) {
    const temAlergia = alergiasNorm.some(alergia =>
      classe.termosAlergia.some(termo => contemTermo(alergia, termo))
    );
    if (temAlergia) classesDoPaciente.add(chave);
  }

  for (const chaveAlergia of classesDoPaciente) {
    const classeAlergia = CLASSES_ALERGENICAS[chaveAlergia];

    // Mesma classe: risco alto.
    if (classeAlergia.medicamentos.some(m => contemTermo(med, m))) {
      alerts.push({
        id: `allergy-class-${chaveAlergia}`,
        severity: 'critical',
        title: `⚠️ POTENCIAL REAÇÃO CRUZADA (${classeAlergia.rotulo})`,
        message: `Paciente tem alergia a ${classeAlergia.rotulo}. ${medicationName} é da mesma classe. Cuidado!`,
        action: 'Considerar alternativa terapêutica',
        canIgnore: true,
      });
      continue;
    }

    // Classe vizinha: risco cruzado menor, mas relevante (penicilina ↔ cefalosporina).
    for (const chaveVizinha of REACAO_CRUZADA_ENTRE_CLASSES[chaveAlergia] || []) {
      const vizinha = CLASSES_ALERGENICAS[chaveVizinha];
      if (vizinha?.medicamentos.some(m => contemTermo(med, m))) {
        alerts.push({
          id: `allergy-cross-${chaveAlergia}-${chaveVizinha}`,
          severity: 'warning',
          title: `⚠️ RISCO CRUZADO (${classeAlergia.rotulo} → ${vizinha.rotulo})`,
          message: `Paciente tem alergia a ${classeAlergia.rotulo}. ${medicationName} é ${vizinha.rotulo} e há risco de reação cruzada.`,
          action: 'Avaliar alternativa de outra classe ou prescrever com observação',
          canIgnore: true,
        });
      }
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

  const drug = acharMedicamento(medicationName);
  if (!drug) return alerts;

  const meses = idadeEmMeses(patientInfo);

  // Check idade.
  // A comparação era `if (ageYears && ...)`: idade 0 é falsy em JavaScript, e o
  // recém-nascido — justamente quem mais depende deste alerta — passava sem
  // checagem nenhuma. Agora testamos presença, não veracidade.
  if (meses !== null && drug.idadeMinimaMeses !== null && meses < drug.idadeMinimaMeses) {
    alerts.push({
      id: 'age-too-young',
      severity: 'critical',
      title: '👶 NÃO RECOMENDADO PARA IDADE',
      message: `${medicationName} é recomendado apenas acima de ${descreverIdade(drug.idadeMinimaMeses)}. Paciente tem ${descreverIdade(meses)}.`,
      action: `Dose pediátrica: ${drug.dosePediatrica || 'Consultar literatura'}`,
      canIgnore: false,
    });
  }

  // Check gravidez
  if (patientInfo.gestante) {
    if (drug.contraindicacoes.includes('gravidez')) {
      alerts.push({
        id: 'pregnancy-absolute',
        severity: 'critical',
        title: '🤰 CONTRAINDICADO EM GRAVIDEZ',
        message: `${medicationName} é CONTRAINDICADO em gravidez. Escolher alternativa segura.`,
        canIgnore: false,
      });
    } else if (drug.contraindicacoes.includes('gravidez_3o_trimestre')) {
      alerts.push({
        id: 'pregnancy-trimester3',
        severity: 'warning',
        title: '🤰 EVITAR NO 3º TRIMESTRE',
        message: `${medicationName} deve ser evitado no 3º trimestre de gravidez. Confirmar trimestre.`,
        action: 'Considerar alternativa ou interrupção antes do parto',
        canIgnore: true,
      });
    } else if (drug.contraindicacoes.includes('gravidez_1o_trimestre')) {
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
  if (patientInfo.amamentando && drug.contraindicacoes.includes('amamentacao')) {
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

  const drug = acharMedicamento(medicationName);
  if (!drug) return alerts;

  // A comorbidade chega como texto livre do prontuário ("Úlcera gástrica",
  // "Insuficiência renal crônica"). Antes era comparada direto contra os tokens
  // internos em inglês (`ulcer_disease`), e nunca casava.
  for (const comorbidade of comorbidades) {
    const com = normalizar(comorbidade);
    if (!com) continue;

    const contraindicada = drug.contraindicacoes.some(token => {
      const termos = TERMOS_COMORBIDADE[token];
      if (termos) return termos.some(t => contemTermo(com, t));
      // Token sem tradução cadastrada: compara pelo próprio nome.
      return contemTermo(com, token.replace(/_/g, ' '));
    });

    if (contraindicada) {
      alerts.push({
        id: `comorbidity-${normalizar(comorbidade).replace(/ /g, '-')}`,
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
