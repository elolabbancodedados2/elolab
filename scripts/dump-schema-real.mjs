/**
 * Despeja o schema REAL de produção em JSON, para o check-colunas conferir
 * contra o banco em vez dos arquivos de migration.
 *
 * Os dois divergem: várias migrations do repo nunca foram aplicadas, e
 * enquanto isso o verificador aprovava código que consultava tabelas
 * inexistentes. Como o supabase-js devolve { error } em vez de lançar, o
 * sintoma era só a tela vir vazia.
 *
 * Uso:
 *   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/dump-schema-real.mjs > schema-real.json
 *   SCHEMA_REAL=schema-real.json npm run check:colunas
 *
 * O token é pessoal (dá acesso a toda a conta) — não comite o arquivo gerado
 * nem o token. Para usar no CI, guarde como secret do repositório.
 */
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF = process.env.SUPABASE_PROJECT_REF || 'gebygucrpipaufrlyqqj';

if (!TOKEN) {
  console.error('Defina SUPABASE_ACCESS_TOKEN (https://supabase.com/dashboard/account/tokens)');
  process.exit(1);
}

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

const colunas = await sql(`
  select table_name as tabela, column_name as coluna
    from information_schema.columns
   where table_schema = 'public'
   order by 1, 2
`);

// Valores aceitos: enums e CHECK (col = ANY (ARRAY[...])) / CHECK (col IN (...)).
// Vêm do catálogo, então refletem o que o banco realmente aceita hoje —
// inclusive restrições alteradas depois da criação da tabela.
const restricoes = await sql(`
  select t.relname as tabela, a.attname as coluna,
         string_agg(distinct e.enumlabel, '') as valores
    from pg_class t
    join pg_namespace n on n.oid = t.relnamespace
    join pg_attribute a on a.attrelid = t.oid and a.attnum > 0
    join pg_type ty on ty.oid = a.atttypid
    join pg_enum e on e.enumtypid = ty.oid
   where n.nspname = 'public' and t.relkind = 'r'
   group by 1, 2

  union all

  select t.relname, a.attname,
         string_agg(distinct m[1], '')
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    join pg_attribute a on a.attrelid = t.oid and a.attnum = any(c.conkey)
    cross join lateral regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''', 'g') as m
   where n.nspname = 'public' and c.contype = 'c' and array_length(c.conkey, 1) = 1
   group by 1, 2
`);

const saida = { tabelas: {}, valoresAceitos: {} };

for (const { tabela, coluna } of colunas) {
  (saida.tabelas[tabela] ||= []).push(coluna);
}

for (const { tabela, coluna, valores } of restricoes) {
  if (!valores) continue;
  const lista = valores.split('');
  const atual = saida.valoresAceitos[tabela]?.[coluna];
  // Enum e CHECK podem coexistir na mesma coluna; a união é o que o banco aceita.
  (saida.valoresAceitos[tabela] ||= {})[coluna] = [...new Set([...(atual || []), ...lista])];
}

console.log(JSON.stringify(saida, null, 2));
