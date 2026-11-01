import { describe, expect, it } from 'vitest';
import {
  camposDaUltimaEvolucao,
  filtrarEvolucoes,
  idadePorExtenso,
  limparDiagnosticosSecundarios,
  listarMedicamentosParaChecagem,
  mascararCpf,
} from '@/lib/prontuarioEvolucao';

describe('listarMedicamentosParaChecagem', () => {
  it('junta prescritos e em uso sem repetir', () => {
    expect(listarMedicamentosParaChecagem(['Varfarina', ' ', 'Dipirona'], 'Losartana, varfarina\nAAS'))
      .toEqual(['Varfarina', 'Dipirona', 'Losartana', 'AAS']);
  });
  it('aceita campo vazio', () => {
    expect(listarMedicamentosParaChecagem([], null)).toEqual([]);
  });
});

describe('limparDiagnosticosSecundarios', () => {
  it('remove linhas vazias só na hora de salvar', () => {
    expect(limparDiagnosticosSecundarios(['I10 - Hipertensão', '', ' E11 ', ''])).toEqual(['I10 - Hipertensão', 'E11']);
    expect(limparDiagnosticosSecundarios('A\n\nB')).toEqual(['A', 'B']);
    expect(limparDiagnosticosSecundarios(undefined)).toEqual([]);
  });
});

describe('mascararCpf', () => {
  it('oculta o início e os dígitos verificadores', () => {
    expect(mascararCpf('123.456.789-01')).toBe('***.456.789-**');
    expect(mascararCpf('')).toBe('');
    expect(mascararCpf('123')).toBe('***');
  });
});

describe('idadePorExtenso', () => {
  it('mostra dias, meses e anos', () => {
    expect(idadePorExtenso('2026-10-25', '2026-11-01')).toBe('7 dias');
    expect(idadePorExtenso('2026-08-01', '2026-11-01')).toBe('3 meses');
    expect(idadePorExtenso('2025-09-01', '2026-11-01')).toBe('1 ano e 2 meses');
    expect(idadePorExtenso('2025-11-01', '2026-11-01')).toBe('1 ano');
    expect(idadePorExtenso('1992-11-02', '2026-11-01')).toBe('33 anos');
  });
  it('não inventa idade para data inválida ou futura', () => {
    expect(idadePorExtenso(null)).toBeNull();
    expect(idadePorExtenso('2027-01-01', '2026-11-01')).toBeNull();
  });
});

describe('camposDaUltimaEvolucao', () => {
  it('copia só o que está vazio e nunca a queixa', () => {
    const ultima = { queixa_principal: 'Dor', historia_familiar: 'DM pai', medicamentos_em_uso: 'Losartana', alergias_relatadas: 'Dipirona' };
    expect(camposDaUltimaEvolucao(ultima, { alergias_relatadas: 'Penicilina' })).toEqual({
      historia_familiar: 'DM pai',
      medicamentos_em_uso: 'Losartana',
    });
    expect(camposDaUltimaEvolucao(null, {})).toEqual({});
  });
});

describe('filtrarEvolucoes', () => {
  const lista = [
    { id: '1', assinado: true, medico_id: 'a' },
    { id: '2', assinado: false, medico_id: 'b' },
    { id: '3', assinado: null, medico_id: 'a' },
  ];
  it('filtra por situação e médico', () => {
    expect(filtrarEvolucoes(lista, { situacao: 'rascunhos', medicoId: 'todos' }).map(e => e.id)).toEqual(['2', '3']);
    expect(filtrarEvolucoes(lista, { situacao: 'assinadas', medicoId: 'todos' }).map(e => e.id)).toEqual(['1']);
    expect(filtrarEvolucoes(lista, { situacao: 'todas', medicoId: 'a' }).map(e => e.id)).toEqual(['1', '3']);
  });
});
