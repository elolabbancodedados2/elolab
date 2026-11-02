import { describe, expect, it } from 'vitest';
import { agruparBancadaPorSetor, htmlMapaBancada } from '../mapaBancada';

const amostras = [
  { codigo_amostra: 'A1', status: 'coletado', laboratorio_setores: { nome: 'Hematologia' }, pacientes: { nome: 'Ana' } },
  { codigo_amostra: 'A2', status: 'em_analise', urgente: true, laboratorio_setores: { nome: 'Hematologia' }, pacientes: { nome: 'Bia' } },
  { codigo_amostra: 'A3', status: 'pendente', laboratorio_setores: { nome: 'Bioquímica' }, pacientes: { nome: 'Caio' } },
  { codigo_amostra: 'A4', status: 'coletado', laboratorio_setores: null, pacientes: { nome: '<Davi>' } },
  { codigo_amostra: 'A5', status: 'coletado', laboratorio_setores: { nome: 'Bioquímica' }, pacientes: { nome: 'Eva' } },
];

describe('mapa de bancada', () => {
  it('agrupa por setor só o que está na bancada, urgentes primeiro e sem setor no fim', () => {
    const grupos = agruparBancadaPorSetor(amostras);
    expect(grupos.map(grupo => [grupo.setor, grupo.itens.map(item => item.codigo_amostra)])).toEqual([
      ['Bioquímica', ['A5']],
      ['Hematologia', ['A2', 'A1']],
      ['Sem setor', ['A4']],
    ]);
  });

  it('gera HTML A4 escapando os dados do paciente', () => {
    const html = htmlMapaBancada(amostras, '01/11/2026 09:00');
    expect(html).toContain('size:A4');
    expect(html).toContain('&lt;Davi&gt;');
    expect(html).not.toContain('<Davi>');
    expect(html).toContain('Hematologia · 2 amostras');
  });
});
