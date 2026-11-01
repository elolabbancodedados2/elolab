import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { atualizarEvolucaoNoHistorico } from '@/lib/historicoEvolucoes';

describe('atualizarEvolucaoNoHistorico', () => {
  it('substitui a evolução existente sem duplicar', () => {
    const lista = [{ id: 'b', data: '2026-10-02', queixa: 'antiga' }, { id: 'a', data: '2026-10-01', queixa: 'x' }];
    const r = atualizarEvolucaoNoHistorico(lista, { id: 'b', data: '2026-10-02', queixa: 'nova' });
    expect(r.map(e => e.id)).toEqual(['b', 'a']);
    expect(r[0].queixa).toBe('nova');
  });

  it('insere uma evolução nova na posição pela data', () => {
    const lista = [{ id: 'b', data: '2026-10-02' }, { id: 'a', data: '2026-09-01' }];
    expect(atualizarEvolucaoNoHistorico(lista, { id: 'c', data: '2026-10-01' }).map(e => e.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('salvamento do prontuário', () => {
  const fonte = readFileSync('src/pages/Prontuarios.tsx', 'utf8');
  const salvar = fonte.slice(fonte.indexOf('const performSave = async'), fonte.indexOf('// Trava de duplo clique no salvar'));

  it('atualiza só a evolução salva, restrita à clínica', () => {
    expect(salvar).toMatch(/\.eq\('id', prontuarioId!\)\s*\.eq\('clinica_id', user\.clinica_id\)/);
    expect(salvar).not.toMatch(/buscarTodasAsPaginas/);
  });

  it('mantém a data de emissão dos itens já gravados', () => {
    expect(salvar).toMatch(/data_emissao: presc\.data_emissao \|\| dataDaEvolucao/);
  });
});
