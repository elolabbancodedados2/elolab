import { describe, expect, it } from 'vitest';
import { agruparPorPaciente, posicaoTuboClsi } from '../mapaColetaOrdem';

describe('ordem de coleta CLSI', () => {
  it('ordena citrato, soro, heparina, EDTA e fluoreto, com urina depois do sangue', () => {
    const tubos = ['Fluoreto (Cinza)', 'EDTA (Roxo)', 'Coletor Urina', 'Citrato (Azul)', 'Heparina (Verde)', 'Soro (Amarelo)'];
    expect([...tubos].sort((a, b) => posicaoTuboClsi(a) - posicaoTuboClsi(b))).toEqual([
      'Citrato (Azul)', 'Soro (Amarelo)', 'Heparina (Verde)', 'EDTA (Roxo)', 'Fluoreto (Cinza)', 'Coletor Urina',
    ]);
  });

  it('agrupa por paciente na ordem de prioridade e ordena os tubos de cada um', () => {
    const grupos = agruparPorPaciente([
      { id: '1', paciente_id: 'ana', tubo: 'EDTA (Roxo)', pacientes: { nome: 'Ana' } },
      { id: '2', paciente_id: 'bia', tubo: 'Soro (Amarelo)', pacientes: { nome: 'Bia', nome_social: 'Bea' } },
      { id: '3', paciente_id: 'ana', tubo: 'Citrato (Azul)', pacientes: { nome: 'Ana' } },
    ]);
    expect(grupos.map(grupo => [grupo.nome, grupo.itens.map(item => item.id)])).toEqual([['Ana', ['3', '1']], ['Bea', ['2']]]);
  });
});
