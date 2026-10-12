import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/pages/FaturamentoConvenios.tsx', 'utf8');

describe('exportação do lote de convênio', () => {
  it('identifica o arquivo e o controle como resumo operacional, não transmissão TISS', () => {
    expect(source).toMatch(/resumo-operacional-lote-/i);
    expect(source).toMatch(/não é arquivo TISS de transmissão/i);
    expect(source).toMatch(/Baixar resumo XML/i);
  });

  it('usa operações do banco para criar, enviar e atualizar sem mutações diretas', () => {
    expect(source).toMatch(/rpc\('criar_lote_tiss'/);
    expect(source).toMatch(/rpc\('registrar_envio_lote_tiss'/);
    expect(source).toMatch(/rpc\('atualizar_glosa_convenio'/);
    expect(source).not.toMatch(/from\('lotes_tiss'\)\.insert/);
    expect(source).not.toMatch(/from\('lotes_tiss'\)\.update/);
    expect(source).not.toMatch(/from\('glosas_convenio'\)\.update/);
  });

  it('associa rótulos aos campos e nomeia os seletores acessivelmente', () => {
    expect(source).toMatch(/htmlFor=\{controlId\}/);
    expect(source).toMatch(/'aria-labelledby': labelId/);
    expect(source).toMatch(/SelectTrigger aria-label="Convênio"/);
    expect(source).toMatch(/SelectTrigger aria-label="Lote"/);
    expect(source).toMatch(/SelectTrigger aria-label="Decisão"/);
  });
});
