import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/pages/FaturamentoConvenios.tsx', 'utf8');
// Criar lote, registrar glosa e conciliar retorno foram movidos para páginas próprias.
const paginasTiss = [
  'src/pages/FaturamentoConvenios.tsx',
  'src/pages/NovoLoteTissPage.tsx',
  'src/pages/NovaGlosaTissPage.tsx',
  'src/pages/RecursoGlosaTissPage.tsx',
  'src/pages/RetornoGlosaTissPage.tsx',
  'src/pages/RetornoLoteTissPage.tsx',
].map(path => ({ path, source: readFileSync(path, 'utf8') }));
const todasAsPaginas = paginasTiss.map(pagina => pagina.source).join('\n');

describe('exportação do lote de convênio', () => {
  it('identifica o arquivo e o controle como resumo operacional, não transmissão TISS', () => {
    expect(source).toMatch(/resumo-operacional-lote-/i);
    expect(source).toMatch(/não é arquivo TISS de transmissão/i);
    expect(source).toMatch(/Baixar resumo XML/i);
  });

  it('usa operações do banco para criar, enviar e atualizar sem mutações diretas', () => {
    expect(todasAsPaginas).toMatch(/rpc\('criar_lote_tiss'/);
    expect(todasAsPaginas).toMatch(/rpc\('registrar_envio_lote_tiss'/);
    expect(todasAsPaginas).toMatch(/rpc\('atualizar_glosa_convenio'/);
    expect(todasAsPaginas).not.toMatch(/from\('lotes_tiss'\)\.insert/);
    expect(todasAsPaginas).not.toMatch(/from\('lotes_tiss'\)\.update/);
    expect(todasAsPaginas).not.toMatch(/from\('glosas_convenio'\)\.update/);
  });

  it('mostra status traduzidos, compara dinheiro em centavos e lê só as colunas das guias', () => {
    expect(source).toContain("pago_parcial: 'Pago parcial'");
    expect(source).toContain("recurso_preparacao: 'Preparando recurso'");
    expect(source).not.toMatch(/status\.replaceAll\(/);
    expect(source).toMatch(/!mesmoValor\(Number\(lote\.valor_pago/);
    expect(source).not.toMatch(/from\('lote_tiss_guias'\)\.select\('\*'\)/);
    expect(source).toMatch(/\['cancelado', 'rejeitado'\]\.includes\(l\.status\)/);
  });

  it('associa rótulos aos campos e nomeia os seletores acessivelmente', () => {
    for (const pagina of paginasTiss) {
      for (const [, id] of pagina.source.matchAll(/<SelectTrigger[^>]*\bid="([^"]+)"/g)) {
        expect(pagina.source, `${pagina.path}: seletor ${id} sem rótulo`).toContain(`htmlFor="${id}"`);
      }
      const seletoresSemNome = [...pagina.source.matchAll(/<SelectTrigger(?![^>]*\b(?:id|aria-label|aria-labelledby)=)[^>]*>/g)];
      expect(seletoresSemNome, `${pagina.path}: seletor sem nome acessível`).toEqual([]);
    }
  });
});
