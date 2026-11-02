import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/pages/PrecosExames.tsx', 'utf8');
const catalogo = source.slice(source.indexOf('const CATALOGO_EXAMES'), source.indexOf('];', source.indexOf('const CATALOGO_EXAMES')));
const itens = [...catalogo.matchAll(/\{ nome: '([^']+)', tuss: '(\d*)' \}/g)].map(([, nome, tuss]) => ({ nome, tuss }));

describe('catálogo de exames da tabela particular', () => {
  it('não repete código TUSS entre exames diferentes', () => {
    expect(itens.length).toBeGreaterThan(20);
    const porCodigo = new Map<string, string[]>();
    for (const item of itens.filter(i => i.tuss)) porCodigo.set(item.tuss, [...(porCodigo.get(item.tuss) ?? []), item.nome]);
    const repetidos = [...porCodigo.entries()].filter(([, nomes]) => nomes.length > 1);
    expect(repetidos).toEqual([]);
  });

  it('usa códigos TUSS de 8 dígitos quando informados', () => {
    expect(itens.filter(i => i.tuss && i.tuss.length !== 8)).toEqual([]);
  });
});
