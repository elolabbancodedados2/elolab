import fs from 'fs';
import path from 'path';

/**
 * Compara as colunas que o código grava com o schema das migrations.
 *
 * Esta classe de bug já apareceu quatro vezes no projeto — nota fiscal,
 * autorização de convênio, auditoria LGPD e altura da triagem — sempre pelo
 * mesmo motivo: o supabase-js não lança em erro de API, então escrever numa
 * coluna inexistente falha em silêncio.
 */

const ID = '[a-z_][a-z_0-9]*'; // nomes de coluna podem ter dígitos (participante_1_id)

// ── 1. Schema a partir das migrations ────────────────────────────────────────
const migDir = 'supabase/migrations';
const schema = new Map();

for (const f of fs.readdirSync(migDir).filter(f => f.endsWith('.sql')).sort()) {
  const sql = fs.readFileSync(path.join(migDir, f), 'utf8');

  const createRe = /CREATE TABLE (?:IF NOT EXISTS )?(?:public\.)?([a-z_0-9]+)\s*\(([\s\S]*?)\n\s*\);/gi;
  let m;
  while ((m = createRe.exec(sql))) {
    const cols = schema.get(m[1]) || new Set();
    for (const linha of m[2].split('\n')) {
      const c = linha.trim().match(new RegExp(`^(${ID})\\s+[A-Za-z]`, 'i'));
      if (c && !/^(constraint|primary|foreign|unique|check|references)$/i.test(c[1])) cols.add(c[1]);
    }
    schema.set(m[1], cols);
  }

  const alterRe = /ALTER TABLE (?:IF EXISTS )?(?:public\.)?([a-z_0-9]+)([\s\S]*?);/gi;
  while ((m = alterRe.exec(sql))) {
    const cols = schema.get(m[1]) || new Set();
    let c;
    const colRe = new RegExp(`ADD COLUMN (?:IF NOT EXISTS )?(${ID})`, 'gi');
    while ((c = colRe.exec(m[2]))) cols.add(c[1]);
    schema.set(m[1], cols);
  }
}

// ── 2. Chaves de primeiro nível, ignorando strings e template literals ───────
function chavesDeTopo(src, abre) {
  let nivel = 0, chaves = [];
  // Uma chave só começa logo depois de `{` ou `,`. Sem isso, o `null` de um
  // ternário (`cond ? null : x`) seria lido como nome de coluna.
  let podeSerChave = false;
  for (let i = abre; i < src.length; i++) {
    const ch = src[i];

    // Pula strings — evita que `${x} Exame` ou 'ID:' virem "colunas"
    if (ch === "'" || ch === '"' || ch === '`') {
      const aspas = ch;
      i++;
      while (i < src.length) {
        if (src[i] === '\\') { i += 2; continue; }
        if (aspas === '`' && src[i] === '$' && src[i + 1] === '{') {
          let n = 1; i += 2;
          while (i < src.length && n > 0) { if (src[i] === '{') n++; else if (src[i] === '}') n--; i++; }
          continue;
        }
        if (src[i] === aspas) break;
        i++;
      }
      continue;
    }

    // Pula comentários de linha
    if (ch === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }

    if (ch === '{') { nivel++; podeSerChave = nivel === 1; continue; }
    if (ch === '}') { nivel--; if (nivel === 0) break; podeSerChave = false; continue; }
    if (ch === ',') { podeSerChave = nivel === 1; continue; }
    if (/\s/.test(ch)) continue; // espaços não encerram a expectativa de chave

    if (nivel === 1 && podeSerChave) {
      const k = src.slice(i).match(new RegExp(`^(${ID})\\s*:`, 'i'));
      if (k) { chaves.push(k[1]); i += k[0].length - 1; }
    }
    podeSerChave = false;
  }
  return chaves;
}

const arquivos = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name).split(path.sep).join('/');
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(e.name) && !/__tests__|\.test\./.test(p)) arquivos.push(p);
  }
})('src');

const achados = [];
for (const f of arquivos) {
  const src = fs.readFileSync(f, 'utf8');
  const re = /\.from\(\s*['"]([a-z_0-9]+)['"][^)]*\)\s*(?:as any\s*)?\r?\n?\s*\.(insert|update)\(\s*\[?\s*\{/g;
  let m;
  while ((m = re.exec(src))) {
    const tabela = m[1], op = m[2];
    const cols = schema.get(tabela);
    if (!cols || cols.size === 0) continue;

    const abre = src.lastIndexOf('{', re.lastIndex);
    const linha = src.slice(0, m.index).split('\n').length;
    for (const col of chavesDeTopo(src, abre)) {
      if (!cols.has(col)) achados.push({ f, linha, tabela, op, col });
    }
  }
}

// ── 3. Colunas listadas em .select('...') ────────────────────────────────────
/**
 * Um select do PostgREST aceita formas como:
 *   'id, nome'                       colunas simples
 *   '*, pacientes(nome)'             relação aninhada
 *   'medicos:medico_id(crm)'         relação com apelido
 *   'count'                          agregado
 * Verificamos apenas as colunas de PRIMEIRO nível da tabela consultada; o
 * conteúdo entre parênteses pertence a outra tabela e é ignorado, porque o
 * apelido nem sempre revela qual é.
 */
function colunasDeSelect(sel) {
  const fora = [];
  let nivel = 0, atual = '';
  for (const ch of sel) {
    if (ch === '(') { nivel++; continue; }
    if (ch === ')') { nivel--; continue; }
    if (ch === ',' && nivel === 0) { fora.push(atual); atual = ''; continue; }
    if (nivel === 0) atual += ch;
  }
  fora.push(atual);

  return fora
    .map(s => s.trim())
    .filter(Boolean)
    // descarta o que não é coluna simples desta tabela
    .filter(s => s !== '*' && s !== 'count' && !s.includes('!'))
    // `apelido:coluna` → coluna
    .map(s => (s.includes(':') ? s.split(':').pop().trim() : s))
    .filter(s => /^[a-z_][a-z_0-9]*$/i.test(s));
}

for (const f of arquivos) {
  const src = fs.readFileSync(f, 'utf8');
  const re = /\.from\(\s*['"]([a-z_0-9]+)['"][^)]*\)\s*(?:as any\s*)?\r?\n?\s*\.select\(\s*(['"])([^'"]*)\2/g;
  let m;
  while ((m = re.exec(src))) {
    const tabela = m[1];
    const sel = m[3];
    const cols = schema.get(tabela);
    if (!cols || cols.size === 0) continue;

    // Se o select traz relação aninhada, o trecho antes do parêntese pode
    // conter o nome da relação (não é coluna). Ignoramos nomes que casem com
    // uma tabela conhecida, para não acusar falso positivo.
    const linha = src.slice(0, m.index).split('\n').length;
    for (const col of colunasDeSelect(sel)) {
      if (!cols.has(col) && !schema.has(col)) {
        achados.push({ f, linha, tabela, op: 'select', col });
      }
    }
  }
}

// ── 4. Colunas em filtros e ordenação ────────────────────────────────────────
/**
 * `.eq('col', v)`, `.order('col')`, `.gte('col', v)`… também derrubam a consulta
 * inteira quando a coluna não existe.
 *
 * Cada cadeia começa num `.from('tabela')` e vai até o fim do statement. Não
 * tentamos entender cadeias montadas em pedaços (`let q = ...; q = q.eq(...)`),
 * então esses casos ficam de fora — é a diferença entre acusar pouco e acusar
 * errado, e acusar errado destrói a confiança na ferramenta.
 */
const METODOS_FILTRO = 'eq|neq|gt|gte|lt|lte|like|ilike|is|in|contains|containedBy|order';

/** Fim da cadeia: primeiro `;` fora de parênteses/colchetes/strings. */
function fimDaCadeia(src, inicio) {
  let nivel = 0;
  for (let i = inicio; i < src.length; i++) {
    const ch = src[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      const q = ch; i++;
      while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; }
      continue;
    }
    if (ch === '(' || ch === '[') nivel++;
    else if (ch === ')' || ch === ']') nivel--;
    else if (ch === ';' && nivel <= 0) return i;
  }
  return Math.min(src.length, inicio + 1500);
}

for (const f of arquivos) {
  const src = fs.readFileSync(f, 'utf8');
  const fromRe = /\.from\(\s*['"]([a-z_0-9]+)['"]/g;
  let m;
  while ((m = fromRe.exec(src))) {
    const tabela = m[1];
    const cols = schema.get(tabela);
    if (!cols || cols.size === 0) continue;

    // A cadeia termina no fim do statement OU no próximo .from(), o que vier
    // antes. Sem o segundo limite, consultas irmãs dentro de um
    // `Promise.all([...])` — separadas por vírgula, sem `;` entre elas —
    // teriam seus filtros atribuídos à tabela da primeira.
    const proximoFrom = src.indexOf('.from(', m.index + 1);
    const fimStatement = fimDaCadeia(src, m.index);
    const fim = proximoFrom === -1 ? fimStatement : Math.min(fimStatement, proximoFrom);
    const trecho = src.slice(m.index, fim);
    const filtroRe = new RegExp(`\\.(${METODOS_FILTRO})\\(\\s*['"]([^'"]+)['"]`, 'g');
    let fm;
    while ((fm = filtroRe.exec(trecho))) {
      const metodo = fm[1];
      const col = fm[2];

      // `prontuarios.paciente_id` refere-se a recurso aninhado — outra tabela
      if (col.includes('.') || col.includes('(')) continue;
      if (!/^[a-z_][a-z_0-9]*$/i.test(col)) continue;

      if (!cols.has(col)) {
        const linha = src.slice(0, m.index + fm.index).split('\n').length;
        achados.push({ f, linha, tabela, op: `.${metodo}()`, col });
      }
    }
  }
}

if (!achados.length) {
  console.log('OK — nenhuma coluna inexistente em insert, update, select ou filtro.');
} else {
  console.log(`${achados.length} uso(s) suspeito(s):\n`);
  for (const a of achados) {
    console.log(`  ${a.f}:${a.linha}  ${a.op} em "${a.tabela}" -> coluna "${a.col}"`);
  }
}
console.log(`\n(${schema.size} tabelas, ${arquivos.length} arquivos)`);

if (achados.length) process.exit(1);
