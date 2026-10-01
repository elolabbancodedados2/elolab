import { describe, expect, it } from 'vitest';
import { medicamentosParaLinhas, textoDoModelo, textoParaMedicamentos } from '@/lib/templatesPrescricao';
import { chaveDaClinica } from '@/lib/configClinica';

describe('modelos de prescrição', () => {
  it('aceita linhas de texto e objetos legados', () => {
    expect(medicamentosParaLinhas(['Dipirona 500mg — 6/6h', '  '])).toEqual(['Dipirona 500mg — 6/6h']);
    expect(medicamentosParaLinhas([{ medicamento: 'Amoxicilina 500mg', posologia: '8/8h', duracao: '7 dias' }]))
      .toEqual(['Amoxicilina 500mg — 8/8h — 7 dias']);
    expect(medicamentosParaLinhas(null)).toEqual([]);
  });

  it('converte o texto do editor em lista sem linhas vazias', () => {
    expect(textoParaMedicamentos('A\n\n  B  \n')).toEqual(['A', 'B']);
  });

  it('monta o texto da receita numerado e com observações', () => {
    expect(textoDoModelo({ medicamentos: ['A', 'B'], observacoes_gerais: 'Beber água' }))
      .toBe('1) A\n2) B\n\nObservações: Beber água');
    expect(textoDoModelo({ medicamentos: ['1) Já numerado'] })).toBe('1) Já numerado');
  });
});

describe('configurações da clínica', () => {
  it('separa chaves da clínica de preferências pessoais', () => {
    expect(chaveDaClinica('config_clinica')).toBe(true);
    expect(chaveDaClinica('agendamento_online')).toBe(true);
    expect(chaveDaClinica('agenda_color_scheme')).toBe(false);
  });
});
