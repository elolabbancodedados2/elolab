/**
 * One-shot: troca o CORS wildcard (`Access-Control-Allow-Origin: '*'`) das
 * edge functions pelo helper allowlistado `corsPadrao(req)`.
 *
 * Padrões que cobre:
 *   const corsHeaders = { 'Access-Control-Allow-Origin': '*', ... }        (top-level)
 *   const headers = {...com Allow-Origin '*' e outras props...}            (uma linha)
 *
 * O que faz em cada função:
 *   1. adiciona `import { corsPadrao } from '../_shared/cors.ts';`
 *   2. remove a declaração top-level que continha o wildcard
 *   3. injeta logo após `Deno.serve(... => {`:
 *        const <nomeOriginal> = { ...corsPadrao(req), <props extras preservadas> };
 *
 * Rodar com: node scripts/aplicar-cors.mjs --dry   (ver o que mudaria)
 *           node scripts/aplicar-cors.mjs         (aplicar)
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'functions');
const DRY = process.argv.includes('--dry');

const CORS_KEYS = new Set([
  'Access-Control-Allow-Origin',
  'Access-Control-Allow-Headers',
  'Access-Control-Allow-Methods',
  'Access-Control-Max-Age',
  'Vary',
]);

const declRe = /(?:^|\n)((?:[ \t]*(?:\/\/[^\n]*\n)[ \t]*)*)(const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\{([^{}]*?['"]Access-Control-Allow-Origin['"][^{}]*?)\}/;
const propRe = /['"]([\w-]+)['"]\s*:\s*('[^']*'|"[^"]*")/g;
const serveRe = /(Deno\.serve\(\s*(?:async\s*)?(?:\(\s*(\w+)\s*(?:\s*:\s*[^)]+)?\s*\)|(\w+))\s*(?:=>\s*|\s*:\s*)?\{)/;

let changed = 0, skipped = [], errors = [];

for (const entry of readdirSync(root)) {
  const dir = join(root, entry);
  if (!statSync(dir).isDirectory() || entry === '_shared') continue;
  const file = join(dir, 'index.ts');
  let src;
  try { src = readFileSync(file, 'utf8'); } catch { errors.push(`sem index.ts: ${entry}`); continue; }

  if (!src.includes("Access-Control-Allow-Origin")) { skipped.push(`sem cors: ${entry}`); continue; }
  if (!src.includes(`'*'`) && !src.includes(`"*"`)) { skipped.push(`origem não-wildcard: ${entry}`); continue; }
  if (src.includes('corsPadrao')) { skipped.push(`já migrado: ${entry}`); continue; }

  const m = src.match(declRe);
  if (!m) { errors.push(`padrão não reconhecido: ${entry}`); continue; }

  const [full, leadingComments, _kw, varName, body] = m;

  // Propriedades não-CORS do objeto original (Content-Type, Cache-Control...).
  const extras = [];
  let pm;
  while ((pm = propRe.exec(body)) !== null) {
    if (CORS_KEYS.has(pm[1])) continue;
    extras.push(`'${pm[1]}': ${pm[2]}`);
  }

  // Remove a declaração inteira (incluindo comentários imediatamente acima
  // que se refiram apenas a ela) e a linha que sobra em branco.
  const withoutDecl = src.replace(full, '\n').replace(/\n\s*\n\s*\n/g, '\n\n');

  const sm = withoutDecl.match(serveRe);
  if (!sm) { errors.push(`Deno.serve(req) não encontrado: ${entry}`); continue; }
  const reqParam = sm[2] || 'req';

  const injection = `\n  ${varName} = { ...corsPadrao(${reqParam}),${extras.length ? ' ' + extras.join(', ') + ' ' : ''}};`;
  const next = withoutDecl.replace(serveRe, sm[1] + injection);

  // Import: após o último import do topo.
  let out;
  const importRe = /^import[^\n]*\n/gm;
  let lastEnd = 0, im;
  while ((im = importRe.exec(next)) !== null) lastEnd = im.index + im[0].length;
  if (lastEnd > 0) {
    out = next.slice(0, lastEnd)
      + "import { corsPadrao } from '../_shared/cors.ts';\n"
      + `\n// Atribuído em cada request (reflete a origem permitida). Helpers\n// top-level (json/reply) capturam esta variável por closure.\nlet ${varName}: Record<string, string> = {};\n`
      + next.slice(lastEnd);
  } else {
    out = "import { corsPadrao } from '../_shared/cors.ts';\n"
      + `\nlet ${varName}: Record<string, string> = {};\n`
      + next;
  }

  changed++;
  console.log(`${DRY ? '[dry] ' : ''}${entry}: var=${varName}${extras.length ? ` extras=[${extras.map(e => e.split(':')[0].replace(/'/g, '')).join(',')}]` : ''}`);
  if (!DRY) writeFileSync(file, out);
}

console.log(`\n${DRY ? 'simulando' : 'aplicado'}: ${changed} funções`);
if (skipped.length) console.log('puladas:\n  ' + skipped.join('\n  '));
if (errors.length) console.log('ERROS (revisar à mão):\n  ' + errors.join('\n  '));
