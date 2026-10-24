import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { preparosAusentesNaGuia, textoPreparosParaGuia } from '../examesWorkflow';

const catalogo = [
  { nome: 'Glicemia de Jejum', preparo: 'Jejum de 8 horas.' },
  { nome: 'Hemograma', preparo: '  ' },
  { nome: 'Urina tipo I', preparo: 'Primeira urina da manhã, após higiene íntima.' },
];

describe('preparo configurado ausente na guia', () => {
  it('aponta exames com preparo configurado que a guia não traz', () => {
    expect(preparosAusentesNaGuia(
      [{ nome: 'glicemia de jejum' }, { nome: 'Hemograma' }, { nome: 'Urina Tipo I' }, { nome: 'TSH' }],
      catalogo,
      'Jejum: 8h',
    )).toEqual([
      { exame: 'glicemia de jejum', preparo: 'Jejum de 8 horas.' },
      { exame: 'Urina Tipo I', preparo: 'Primeira urina da manhã, após higiene íntima.' },
    ]);
  });

  it('considera atendido quando o texto do preparo já está na guia, sem diferenciar acento e caixa', () => {
    expect(preparosAusentesNaGuia(
      [{ nome: 'Urina tipo I' }],
      catalogo,
      'Observações: PRIMEIRA URINA DA MANHA, APOS HIGIENE INTIMA.',
    )).toEqual([]);
  });

  it('gera o texto que inclui os preparos nas observações da guia', () => {
    const texto = textoPreparosParaGuia([{ exame: 'Glicemia de Jejum', preparo: 'Jejum de 8 horas.' }]);
    expect(texto).toBe('Preparo — Glicemia de Jejum: Jejum de 8 horas.');
    expect(preparosAusentesNaGuia([{ nome: 'Glicemia de Jejum' }], catalogo, texto)).toEqual([]);
  });

  it('o formulário de solicitação avisa e oferece incluir o preparo', () => {
    const tela = readFileSync('src/pages/Exames.tsx', 'utf8');
    expect(tela).toMatch(/preparosAusentesNaGuia\(/);
    expect(tela).toMatch(/Incluir preparo na guia/);
    expect(tela).toMatch(/from\('tipo_exames_catalog'\)/);
  });
});
