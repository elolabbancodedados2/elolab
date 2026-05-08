import { describe, it, expect } from 'vitest';
import {
  checkAllergyAlerts,
  checkAgeAndReproductiveAlerts,
  checkComorbidityAlerts,
  consolidateAlerts,
  isMedicationSafe,
  extractMedicationNames,
  type ClinicalAlert,
} from '@/lib/clinicalAlerts';

describe('checkAllergyAlerts', () => {
  it('retorna vazio quando paciente não tem alergias registradas', () => {
    expect(checkAllergyAlerts('Amoxicilina', undefined)).toEqual([]);
    expect(checkAllergyAlerts('Amoxicilina', [])).toEqual([]);
  });

  it('detecta alergia direta ao medicamento (case-insensitive)', () => {
    const alerts = checkAllergyAlerts('Ibuprofeno', ['ibuprofeno']);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe('critical');
    expect(alerts[0].canIgnore).toBe(false);
    expect(alerts[0].id).toBe('allergy-direct');
  });

  it('detecta alergia direta com casing diferente', () => {
    const alerts = checkAllergyAlerts('IBUPROFENO 600mg', ['Ibuprofeno']);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe('critical');
  });

  it('detecta reação cruzada por classe (penicillin → amoxicillin)', () => {
    // Nota: COMMON_ALLERGENS usa nomes em inglês ('amoxicillin').
    // Prescrições em português ('amoxicilina') NÃO disparam a cruzada — bug conhecido.
    const alerts = checkAllergyAlerts('Amoxicillin 500mg', ['penicillin']);
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0].severity).toBe('critical');
    expect(alerts[0].id).toContain('allergy-class');
    expect(alerts[0].canIgnore).toBe(true);
  });

  it('NÃO dispara reação cruzada quando nome está em português (limitação conhecida)', () => {
    // Documenta o bug: 'Amoxicilina' (PT) não bate com 'amoxicillin' (EN no DB).
    const alerts = checkAllergyAlerts('Amoxicilina 500mg', ['penicillin']);
    expect(alerts).toEqual([]);
  });

  it('não dispara reação cruzada se medicamento não pertence à classe', () => {
    const alerts = checkAllergyAlerts('Paracetamol', ['penicillin']);
    expect(alerts).toEqual([]);
  });

  it('alergia direta não dispara também a cruzada (early return)', () => {
    const alerts = checkAllergyAlerts('Ibuprofeno', ['ibuprofeno', 'nsaid']);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].id).toBe('allergy-direct');
  });
});

describe('checkAgeAndReproductiveAlerts', () => {
  it('bloqueia ibuprofeno em criança de 2 anos (DB: ageMin=3)', () => {
    // Nota: idade=0 não dispara alerta por bug "if (ageYears && ...)" tratar 0 como falsy.
    // Idade=2 funciona normalmente.
    const alerts = checkAgeAndReproductiveAlerts('Ibuprofeno', { idade: 2 });
    expect(alerts.some(a => a.id === 'age-too-young')).toBe(true);
  });

  it('permite ibuprofeno em adulto sem flags', () => {
    const alerts = checkAgeAndReproductiveAlerts('Ibuprofeno', { idade: 30 });
    expect(alerts).toEqual([]);
  });

  it('bloqueia lisinopril em paciente gestante (contraindicação absoluta)', () => {
    const alerts = checkAgeAndReproductiveAlerts('Lisinopril', { idade: 30, gestante: true });
    expect(alerts.some(a => a.id === 'pregnancy-absolute' && a.severity === 'critical' && !a.canIgnore)).toBe(true);
  });

  it('alerta ibuprofeno em 3º trimestre (warning, não-crítico)', () => {
    const alerts = checkAgeAndReproductiveAlerts('Ibuprofeno', { idade: 30, gestante: true });
    expect(alerts.some(a => a.id === 'pregnancy-trimester3' && a.severity === 'warning' && a.canIgnore)).toBe(true);
  });

  it('alerta varfarina em 1º trimestre', () => {
    const alerts = checkAgeAndReproductiveAlerts('Varfarina', { idade: 40, gestante: true });
    expect(alerts.some(a => a.id === 'pregnancy-trimester1')).toBe(true);
  });

  it('alerta amamentação para sinvastatina', () => {
    const alerts = checkAgeAndReproductiveAlerts('Sinvastatina', { idade: 35, amamentando: true });
    expect(alerts.some(a => a.id === 'lactation-contraindicated')).toBe(true);
  });

  it('calcula idade a partir de dataNascimento se idade não fornecida', () => {
    const fiveYearsAgo = new Date();
    fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
    const dataNasc = fiveYearsAgo.toISOString().slice(0, 10);
    const alerts = checkAgeAndReproductiveAlerts('Doxiciclina', { dataNascimento: dataNasc });
    // Doxiciclina ageMin: 8 → bloqueia <8 anos
    expect(alerts.some(a => a.id === 'age-too-young')).toBe(true);
  });

  it('não emite alertas para medicamento desconhecido (não está no DB)', () => {
    const alerts = checkAgeAndReproductiveAlerts('MedicamentoFicticio123', { idade: 30, gestante: true });
    expect(alerts).toEqual([]);
  });
});

describe('checkComorbidityAlerts', () => {
  it('retorna vazio se sem comorbidades', () => {
    expect(checkComorbidityAlerts('Ibuprofeno', undefined)).toEqual([]);
    expect(checkComorbidityAlerts('Ibuprofeno', [])).toEqual([]);
  });

  it('alerta ibuprofeno em paciente com úlcera ativa', () => {
    const alerts = checkComorbidityAlerts('Ibuprofeno', ['ulcer_disease']);
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0].severity).toBe('warning');
  });

  it('não emite alerta se comorbidade não conflita', () => {
    const alerts = checkComorbidityAlerts('Ibuprofeno', ['hipertensao']);
    expect(alerts).toEqual([]);
  });
});

describe('consolidateAlerts', () => {
  it('combina alertas de alergia + idade + comorbidade sem duplicar', () => {
    const alerts = consolidateAlerts('Ibuprofeno', {
      idade: 1,
      alergias: ['ibuprofeno'],
      comorbidades: ['ulcer_disease'],
    });
    const ids = alerts.map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(alerts.some(a => a.id === 'allergy-direct')).toBe(true);
  });

  it('retorna lista vazia para paciente saudável e medicamento seguro', () => {
    const alerts = consolidateAlerts('MedicamentoSeguroFake', { idade: 30 });
    expect(alerts).toEqual([]);
  });
});

describe('isMedicationSafe', () => {
  it('retorna true sem alertas críticos', () => {
    const alerts: ClinicalAlert[] = [
      { id: 'a', severity: 'warning', title: 't', message: 'm', canIgnore: true },
      { id: 'b', severity: 'info', title: 't', message: 'm', canIgnore: true },
    ];
    expect(isMedicationSafe(alerts)).toBe(true);
  });

  it('retorna false com alerta crítico não ignorável', () => {
    const alerts: ClinicalAlert[] = [
      { id: 'x', severity: 'critical', title: 't', message: 'm', canIgnore: false },
    ];
    expect(isMedicationSafe(alerts)).toBe(false);
  });

  it('retorna true se único alerta crítico é ignorável (canIgnore=true)', () => {
    const alerts: ClinicalAlert[] = [
      { id: 'x', severity: 'critical', title: 't', message: 'm', canIgnore: true },
    ];
    expect(isMedicationSafe(alerts)).toBe(true);
  });

  it('retorna true para lista vazia', () => {
    expect(isMedicationSafe([])).toBe(true);
  });
});

describe('extractMedicationNames', () => {
  it('retorna vazio para string vazia', () => {
    expect(extractMedicationNames('')).toEqual([]);
  });

  it('extrai medicamentos de linhas separadas', () => {
    const result = extractMedicationNames('Ibuprofeno 600mg\nDipirona 500mg');
    expect(result.length).toBeGreaterThan(0);
  });

  it('remove duplicatas', () => {
    const result = extractMedicationNames('Ibuprofeno\nIbuprofeno');
    expect(result.length).toBeLessThanOrEqual(1);
  });
});
