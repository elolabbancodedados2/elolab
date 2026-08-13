#!/usr/bin/env node
/**
 * Botão que só tem ícone precisa de nome acessível.
 *
 * Um `<Button size="icon"><Trash2 /></Button>` é anunciado pelo leitor de tela
 * apenas como "botão". A pessoa não sabe se apaga o paciente ou fecha a janela
 * — e num sistema de clínica esse botão apaga prontuário.
 *
 * Basta `aria-label` ou `title` na tag. Este check acusa quem não tem nenhum
 * dos dois.
 *
 * POR QUE UM SCRIPT E NÃO UM CODEMOD
 * A correção automática foi tentada e descartada: regex sobre JSX quebra no
 * `>` de `onClick={() => algo()}`, que é indistinguível do `>` que fecha a
 * tag. Corrigir exige ler o contexto — o rótulo certo depende do que o botão
 * faz, não só do ícone. Então o script mede e cobra; a correção é manual.
 *
 * Uso:
 *   node scripts/check-acessibilidade.mjs           # lista e falha se houver
 *   node scripts/check-acessibilidade.mjs --teto N  # tolera até N (dívida atual)
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const RAIZ = 'src';

/** Percorre .tsx ignorando testes. */
function arquivos(dir) {
  const saida = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) {
      if (nome === '__tests__' || nome === 'node_modules') continue;
      saida.push(...arquivos(caminho));
    } else if (nome.endsWith('.tsx')) {
      saida.push(caminho);
    }
  }
  return saida;
}

/**
 * Extrai a tag de abertura a partir de um `<Button`, respeitando chaves.
 *
 * Não dá para procurar o primeiro `>`: `onClick={() => x()}` tem um `>` que
 * não fecha a tag. Contamos a profundidade de `{}` e só aceitamos o `>` que
 * aparece fora de expressão.
 */
function tagDeAbertura(texto, inicio) {
  let profundidade = 0;
  for (let i = inicio; i < texto.length; i++) {
    const c = texto[i];
    if (c === '{') profundidade++;
    else if (c === '}') profundidade--;
    else if (c === '>' && profundidade === 0) return texto.slice(inicio, i + 1);
  }
  return null;
}

const achados = [];

for (const caminho of arquivos(RAIZ)) {
  const texto = readFileSync(caminho, 'utf8');
  const regex = /<Button\b/g;
  let m;

  while ((m = regex.exec(texto)) !== null) {
    const tag = tagDeAbertura(texto, m.index);
    if (!tag || !tag.includes('size="icon"')) continue;
    if (tag.includes('aria-label') || tag.includes('title=')) continue;

    // O conteúdo do botão: se tiver texto visível, o nome acessível já existe.
    const depois = texto.slice(m.index + tag.length, m.index + tag.length + 400);
    const conteudo = depois.split('</Button>')[0] ?? '';
    const temTextoVisivel = /[A-Za-zÀ-ÿ]{3,}/.test(conteudo.replace(/<[^>]*>/g, '').trim());
    if (temTextoVisivel) continue;

    const icone = conteudo.match(/<([A-Z][A-Za-z0-9]+)[\s/]/)?.[1] ?? '?';
    achados.push({
      arquivo: relative('.', caminho).replace(/\\/g, '/'),
      linha: texto.slice(0, m.index).split('\n').length,
      icone,
    });
  }
}

const argTeto = process.argv.indexOf('--teto');
const teto = argTeto !== -1 ? Number(process.argv[argTeto + 1]) : 0;

if (achados.length === 0) {
  console.log('OK — todo botão de ícone tem nome acessível.');
  process.exit(0);
}

console.log(`${achados.length} botão(ões) só com ícone e sem aria-label/title:\n`);
for (const a of achados) {
  console.log(`  ${a.arquivo}:${a.linha}  <${a.icone} />`);
}

console.log(
  `\nCada um é anunciado apenas como "botão" por leitor de tela.` +
  `\nAdicione aria-label descrevendo a AÇÃO ("Excluir paciente", não "lixeira").`,
);

if (achados.length > teto) {
  console.log(`\nFALHOU: ${achados.length} achado(s), teto de ${teto}.`);
  process.exit(1);
}

console.log(`\nDentro do teto atual (${teto}). Reduza o teto ao corrigir.`);
process.exit(0);
