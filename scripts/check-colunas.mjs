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

/** tabela -> coluna -> Set(valores aceitos), vindo de CHECK IN (...) e de ENUM */
const valoresAceitos = new Map();
const enums = new Map(); // nome do tipo -> Set(valores)

function registrarValores(tabela, coluna, lista) {
  if (!valoresAceitos.has(tabela)) valoresAceitos.set(tabela, new Map());
  valoresAceitos.get(tabela).set(coluna, new Set(lista));
}

// ── 1. Schema a partir das migrations ────────────────────────────────────────
const migDir = 'supabase/migrations';
const schema = new Map();

for (const f of fs.readdirSync(migDir).filter(f => f.endsWith('.sql')).sort()) {
  const sql = fs.readFileSync(path.join(migDir, f), 'utf8');

  // Enums declarados como tipo
  const enumRe = /CREATE TYPE (?:public\.)?([a-z_0-9]+) AS ENUM \(([^)]*)\)/gi;
  let em;
  while ((em = enumRe.exec(sql))) {
    enums.set(em[1], new Set([...em[2].matchAll(/'([^']*)'/g)].map(x => x[1])));
  }

  const createRe = /CREATE TABLE (?:IF NOT EXISTS )?(?:public\.)?([a-z_0-9]+)\s*\(([\s\S]*?)\n\s*\);/gi;
  let m;
  while ((m = createRe.exec(sql))) {
    const tabela = m[1];
    const cols = schema.get(tabela) || new Set();
    for (const linha of m[2].split('\n')) {
      const c = linha.trim().match(new RegExp(`^(${ID})\\s+[A-Za-z]`, 'i'));
      if (!c || /^(constraint|primary|foreign|unique|check|references)$/i.test(c[1])) continue;
      cols.add(c[1]);

      // CHECK (coluna IN ('a','b')) na própria linha
      const chk = linha.match(new RegExp(`CHECK\\s*\\(\\s*${c[1]}\\s+IN\\s*\\(([^)]*)\\)`, 'i'));
      if (chk) {
        registrarValores(tabela, c[1], [...chk[1].matchAll(/'([^']*)'/g)].map(x => x[1]));
      }

      // Coluna tipada com um enum conhecido
      const tipo = linha.trim().match(new RegExp(`^${c[1]}\\s+(?:public\\.)?([a-z_0-9]+)`, 'i'));
      if (tipo && enums.has(tipo[1])) {
        registrarValores(tabela, c[1], [...enums.get(tipo[1])]);
      }
    }
    schema.set(tabela, cols);
  }

  const alterRe = /ALTER TABLE (?:IF EXISTS )?(?:public\.)?([a-z_0-9]+)([\s\S]*?);/gi;
  while ((m = alterRe.exec(sql))) {
    const tabela = m[1], corpo = m[2];
    const cols = schema.get(tabela) || new Set();
    let c;
    const colRe = new RegExp(`ADD COLUMN (?:IF NOT EXISTS )?(${ID})`, 'gi');
    while ((c = colRe.exec(corpo))) cols.add(c[1]);
    schema.set(tabela, cols);

    // Restrições redefinidas depois da criação da tabela. Ignorar isto fazia o
    // verificador acusar valores que passaram a ser válidos — lancamentos.tipo
    // ganhou 'sangria'/'suprimento' e agendamentos.tipo ganhou 'coleta'.
    // Duas sintaxes convivem no projeto:
    //   CHECK (col IN ('a','b'))
    //   CHECK (col = ANY (ARRAY['a'::text, 'b'::text]))
    const chkIn = corpo.match(new RegExp(`CHECK\\s*\\(\\s*(${ID})\\s+IN\\s*\\(([^)]*)\\)`, 'i'));
    if (chkIn) {
      registrarValores(tabela, chkIn[1], [...chkIn[2].matchAll(/'([^']*)'/g)].map(x => x[1]));
    }
    const chkAny = corpo.match(new RegExp(`CHECK\\s*\\(\\s*(${ID})\\s*=\\s*ANY\\s*\\(\\s*ARRAY\\s*\\[([\\s\\S]*?)\\]`, 'i'));
    if (chkAny) {
      registrarValores(tabela, chkAny[1], [...chkAny[2].matchAll(/'([^']*)'/g)].map(x => x[1]));
    }
  }
}

// ── 2. Chaves de primeiro nível, ignorando strings e template literals ───────
function chavesDeTopo(src, abre) {
  let nivel = 0, chaves = [];
  // Guarda também o literal quando a chave recebe uma string constante,
  // para conferir contra CHECK IN (...) e enums.
  const literais = chavesDeTopo.literais = new Map();
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
      const resto = src.slice(i);
      const k = resto.match(new RegExp(`^(${ID})\\s*:`, 'i'));
      if (k) {
        chaves.push(k[1]);
        // `coluna: 'valor'` — só literal puro; expressões ficam de fora
        const lit = resto.match(new RegExp(`^${k[1]}\\s*:\\s*'([^']*)'\\s*[,}]`));
        if (lit) literais.set(k[1], lit[1]);
        i += k[0].length - 1;
      }
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
    const chaves = chavesDeTopo(src, abre);
    const literais = chavesDeTopo.literais;

    for (const col of chaves) {
      if (!cols.has(col)) { achados.push({ f, linha, tabela, op, col }); continue; }

      // Valor constante fora do conjunto aceito pelo CHECK/enum. Foi assim que
      // `action: 'DATA_CORRECTION'` passou despercebido em audit_log, cuja
      // restrição só admite create/update/delete.
      const permitidos = valoresAceitos.get(tabela)?.get(col);
      const valor = literais.get(col);
      if (permitidos && valor !== undefined && !permitidos.has(valor)) {
        achados.push({
          f, linha, tabela, op, col,
          detalhe: `valor '${valor}' não é aceito (esperado: ${[...permitidos].join(', ')})`,
        });
      }
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
    const cauda = a.detalhe ? `\n      ${a.detalhe}` : '';
    console.log(`  ${a.f}:${a.linha}  ${a.op} em "${a.tabela}" -> coluna "${a.col}"${cauda}`);
  }
}
console.log(`\n(${schema.size} tabelas, ${arquivos.length} arquivos)`);

if (achados.length) process.exit(1);
