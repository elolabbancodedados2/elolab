import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { formatarReferenciaLaudo, procedenciaResultadoLaudo } from '../laudoWorkflow';

describe('intervalo de referência separado do resultado observado', () => {
  it('prefere a referência textual configurada', () => {
    expect(formatarReferenciaLaudo({ valorReferenciaTexto: '  Negativo ', valorReferenciaMin: 1, valorReferenciaMax: 2, unidade: 'mg/dL' })).toBe('Negativo');
  });

  it('mostra faixa completa e limites de um lado só com a unidade', () => {
    expect(formatarReferenciaLaudo({ valorReferenciaMin: 70, valorReferenciaMax: 99, unidade: 'mg/dL' })).toBe('70 a 99 mg/dL');
    expect(formatarReferenciaLaudo({ valorReferenciaMax: 200, unidade: 'mg/dL' })).toBe('Até 200 mg/dL');
    expect(formatarReferenciaLaudo({ valorReferenciaMin: 0, unidade: null })).toBe('A partir de 0');
  });

  it('não inventa referência quando nada foi configurado', () => {
    expect(formatarReferenciaLaudo({})).toBe('Não informado');
  });
});

describe('procedência técnica do resultado', () => {
  it('lista método, equipamento e laboratório executor disponíveis', () => {
    expect(procedenciaResultadoLaudo({ metodo: 'Enzimático', equipamento: ' BS-200 ', laboratorio: 'Lab Parceiro' }))
      .toBe('Método: Enzimático · Equipamento: BS-200 · Laboratório: Lab Parceiro');
    expect(procedenciaResultadoLaudo({ metodo: '', equipamento: null, laboratorio: 'Clínica X' })).toBe('Laboratório: Clínica X');
    expect(procedenciaResultadoLaudo({})).toBe('');
  });

  it('o laudo PDF imprime referência e procedência por parâmetro, não só do primeiro', () => {
    const pdf = readFileSync('src/lib/pdfGenerator.ts', 'utf8');
    expect(pdf).toMatch(/formatarReferenciaLaudo\(r\)/);
    expect(pdf).toMatch(/procedenciaResultadoLaudo\(\{[\s\S]*?laboratorio: r\.laboratorio \|\| clinica\.nome/);
    const tela = readFileSync('src/pages/LaudosLab.tsx', 'utf8');
    expect(tela).toMatch(/laboratorios\(nome\)/);
    expect(tela).toMatch(/Resultado observado/);
  });
});
