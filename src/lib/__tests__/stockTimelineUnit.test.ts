import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('unidade no histórico de estoque', () => {
  it('exibe a unidade cadastrada do item com fallback para unidade', () => {
    const source = readFileSync('src/pages/Estoque.tsx', 'utf8');
    expect(source).toMatch(/\{mov\.quantidade\}\s*\{timelineItem\?\.unidade\s*\|\|\s*'unidade'\}/);
  });
});
