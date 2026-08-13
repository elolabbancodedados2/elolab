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

  it('detecta reação cruzada por classe em inglês', () => {
    const alerts = checkAllergyAlerts('Amoxicillin 500mg', ['penicillin']);
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0].severity).toBe('critical');
    expect(alerts[0].id).toContain('allergy-class');
    expect(alerts[0].canIgnore).toBe(true);
  });

  /**
   * O caso clássico de anafilaxia na clínica: paciente com "Penicilina" anotada
   * no prontuário recebendo "Amoxicilina". A tabela era em inglês e a comparação
   * era `includes()` puro, então este alerta nunca disparava em português.
   */
  it('dispara reação cruzada com prontuário e receita em português', () => {
    const alerts = checkAllergyAlerts('Amoxicilina 500mg', ['Penicilina']);
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0].id).toContain('allergy-class');
    expect(alerts[0].severity).toBe('critical');
  });

  it('dispara mesmo com acento e caixa diferentes na alergia', () => {
    const alerts = checkAllergyAlerts('amoxicilina 500 mg', ['ALERGIA A PENICILINA']);
    expect(alerts.some(a => a.id.includes('allergy-class'))).toBe(true);
  });

  it('avisa do risco cruzado penicilina → cefalosporina', () => {
    const alerts = checkAllergyAlerts('Cefalexina 500mg', ['penicilina']);
    expect(alerts.some(a => a.id.startsWith('allergy-cross-'))).toBe(true);
    expect(alerts[0].canIgnore).toBe(true);
  });

  it('pega alergia a sulfa prescrevendo sulfametoxazol', () => {
    const alerts = checkAllergyAlerts('Sulfametoxazol + Trimetoprima', ['Sulfa']);
    expect(alerts.length).toBeGreaterThan(0);
  });

  it('pega alergia a AINE prescrevendo diclofenaco', () => {
    const alerts = checkAllergyAlerts('Diclofenaco sódico 50mg', ['anti-inflamatório']);
    expect(alerts.length).toBeGreaterThan(0);
  });

  it('não dispara reação cruzada se medicamento não pertence à classe', () => {
    const alerts = checkAllergyAlerts('Paracetamol', ['penicilina']);
    expect(alerts).toEqual([]);
  });

  it('não confunde substring: "asma" na comorbidade não vira alergia a AAS', () => {
    const alerts = checkAllergyAlerts('Paracetamol 750mg', ['asma']);
    expect(alerts).toEqual([]);
  });

  /**
   * O médico digita rápido e nem sempre separa princípio ativo da dose. Exigir
   * palavra inteira fazia "Amoxicilina500mg" não casar com nada — falso
   * negativo num verificador de segurança, que é o erro caro.
   */
  it('pega o medicamento colado na dose', () => {
    const alerts = checkAllergyAlerts('Amoxicilina500mg', ['Penicilina']);
    expect(alerts.length).toBeGreaterThan(0);
  });

  it('pega alergia anotada de forma abreviada no prontuário', () => {
    const alerts = checkAllergyAlerts('Amoxicilina 500mg', ['amoxi']);
    expect(alerts.length).toBeGreaterThan(0);
  });

  /**
   * O outro extremo: termo curto casando por prefixo viraria ruído — "sal"
   * acusaria alergia em salbutamol. Alerta que mente é ignorado, e aí o alerta
   * que importa também é.
   */
  it('termo curto exige palavra inteira, para não virar ruído', () => {
    const alerts = checkAllergyAlerts('Salbutamol spray', ['sal']);
    expect(alerts).toEqual([]);
  });

  it('alergia direta não dispara também a cruzada (early return)', () => {
    const alerts = checkAllergyAlerts('Ibuprofeno', ['ibuprofeno', 'aines']);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].id).toBe('allergy-direct');
  });
});

describe('checkAgeAndReproductiveAlerts', () => {
  /**
   * A idade mínima do ibuprofeno é 3 MESES, não 3 anos — o campo estava marcado
   * "3 // meses" e era comparado contra anos. O pediatra batia num bloqueio
   * crítico e inegável ao prescrever um antitérmico corriqueiro, todo dia.
   */
  it('permite ibuprofeno em criança de 2 anos (mínimo é 3 meses)', () => {
    const alerts = checkAgeAndReproductiveAlerts('Ibuprofeno', { idade: 2 });
    expect(alerts.some(a => a.id === 'age-too-young')).toBe(false);
  });

  it('permite ibuprofeno em bebê de 6 meses', () => {
    const nasc = new Date();
    nasc.setMonth(nasc.getMonth() - 6);
    const alerts = checkAgeAndReproductiveAlerts('Ibuprofeno', {
      dataNascimento: nasc.toISOString().slice(0, 10),
    });
    expect(alerts.some(a => a.id === 'age-too-young')).toBe(false);
  });

  /**
   * `if (ageYears && ...)` tratava idade 0 como falsy: recém-nascido a 11 meses
   * era a única faixa que passava sem checagem nenhuma — justamente a que mais
   * depende dela.
   */
  it('bloqueia ibuprofeno em recém-nascido de 1 mês (idade 0 não é mais falsy)', () => {
    const nasc = new Date();
    nasc.setMonth(nasc.getMonth() - 1);
    const alerts = checkAgeAndReproductiveAlerts('Ibuprofeno', {
      dataNascimento: nasc.toISOString().slice(0, 10),
    });
    expect(alerts.some(a => a.id === 'age-too-young')).toBe(true);
  });

  it('bloqueia doxiciclina em bebê de idade 0 informada como número', () => {
    const alerts = checkAgeAndReproductiveAlerts('Doxiciclina', { idade: 0 });
    expect(alerts.some(a => a.id === 'age-too-young')).toBe(true);
  });

  it('descreve a idade do bebê em meses, não em "0 anos"', () => {
    const nasc = new Date();
    // Evita overflow ao subtrair meses em meses com 29/30/31 dias.
    nasc.setDate(1);
    nasc.setMonth(nasc.getMonth() - 2);
    const alerts = checkAgeAndReproductiveAlerts('Doxiciclina', {
      dataNascimento: nasc.toISOString().slice(0, 10),
    });
    const alerta = alerts.find(a => a.id === 'age-too-young');
    expect(alerta?.message).toContain('meses');
  });

  /**
   * A tela de receitas calculava idade como `anoAtual - anoNascimento` e esse
   * valor tinha precedência sobre o cálculo interno. Sempre arredondava para
   * cima, ou seja, sempre a favor de liberar.
   */
  it('a data de nascimento tem precedência sobre uma idade errada recebida pronta', () => {
    const nasc = new Date();
    nasc.setFullYear(nasc.getFullYear() - 1);
    nasc.setMonth(nasc.getMonth() - 8); // 1 ano e 8 meses
    const alerts = checkAgeAndReproductiveAlerts('Enalapril', {
      idade: 2, // o que a tela calculava errado
      dataNascimento: nasc.toISOString().slice(0, 10),
    });
    // Enalapril: mínimo 2 anos. Com 1a8m o alerta precisa disparar.
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

  /**
   * As comorbidades vêm de `paciente_comorbidades.descricao`, texto livre em
   * português. A comparação era feita contra tokens internos em inglês
   * (`ulcer_disease`), então este alerta também era código morto na prática.
   */
  it('alerta ibuprofeno em paciente com úlcera gástrica (texto do prontuário)', () => {
    const alerts = checkComorbidityAlerts('Ibuprofeno 600mg', ['Úlcera gástrica']);
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0].severity).toBe('warning');
  });

  it('alerta naproxeno em paciente com insuficiência renal', () => {
    const alerts = checkComorbidityAlerts('Naproxeno', ['Insuficiência renal crônica']);
    expect(alerts.length).toBeGreaterThan(0);
  });

  it('alerta sinvastatina em paciente com cirrose', () => {
    const alerts = checkComorbidityAlerts('Sinvastatina 20mg', ['Cirrose hepática']);
    expect(alerts.length).toBeGreaterThan(0);
  });

  it('alerta varfarina em paciente com plaquetopenia', () => {
    const alerts = checkComorbidityAlerts('Varfarina', ['Trombocitopenia']);
    expect(alerts.length).toBeGreaterThan(0);
  });

  it('não emite alerta se comorbidade não conflita', () => {
    const alerts = checkComorbidityAlerts('Ibuprofeno', ['hipertensao']);
    expect(alerts).toEqual([]);
  });

  it('não emite alerta para medicamento fora da tabela', () => {
    const alerts = checkComorbidityAlerts('MedicamentoFicticio123', ['Úlcera gástrica']);
    expect(alerts).toEqual([]);
  });
});

describe('consolidateAlerts', () => {
  it('combina alertas de alergia + idade + comorbidade sem duplicar', () => {
    const alerts = consolidateAlerts('Ibuprofeno', {
      idade: 1,
      alergias: ['ibuprofeno'],
      comorbidades: ['Úlcera gástrica'],
    });
    const ids = alerts.map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(alerts.some(a => a.id === 'allergy-direct')).toBe(true);
  });

  it('junta os três tipos de alerta num caso realista de balcão', () => {
    const nasc = new Date();
    nasc.setMonth(nasc.getMonth() - 1); // 1 mês de vida
    const alerts = consolidateAlerts('Ibuprofeno 100mg/ml', {
      dataNascimento: nasc.toISOString().slice(0, 10),
      alergias: ['Penicilina'],
      comorbidades: ['Asma grave'],
    });
    expect(alerts.some(a => a.id === 'age-too-young')).toBe(true);
    expect(alerts.some(a => a.id.startsWith('comorbidity-'))).toBe(true);
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
