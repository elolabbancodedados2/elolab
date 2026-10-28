// Reproduz o efeito da versão duplicada na CLI do Supabase.
// Uso: npm i @electric-sql/pglite@0.3.15 fora do repositório; node versao-duplicada.mjs <caminho>/supabase/migrations
// (1) Tabela de histórico e INSERT copiados de supabase/cli apps/cli-go/pkg/migration/history.go.
// (2) FindPendingMigrations portado de apps/cli-go/pkg/migration/apply.go, sobre a lista real de arquivos.
import { PGlite } from '@electric-sql/pglite';
import { readdirSync } from 'node:fs';
const dir = process.argv[2];
const db = new PGlite();
await db.exec(`CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations (version text NOT NULL PRIMARY KEY, statements text[], name text);`);
const ins = 'INSERT INTO supabase_migrations.schema_migrations(version, name, statements) VALUES($1, $2, $3)';
await db.query(ins, ['20261010198000', 'checkout_provisionamento_seguro', []]);
try { await db.query(ins, ['20261010198000', 'mercadopago_oauth_clinicas', []]); console.log('(1) segundo INSERT aceito'); }
catch (e) { console.log(`(1) db reset: segundo arquivo falha com ${e.code}: ${e.message}`); }

const re = /^([0-9]+)_(.*)\.sql$/;
const local = readdirSync(dir).filter(f => re.test(f)).sort();
function pending(local, remote) {
  let i = 0, j = 0; const unapplied = [], missing = [];
  while (i < remote.length && j < local.length) {
    const l = re.exec(local[j])[1];
    if (remote[i] === l) { i++; j++; } else if (remote[i] < l) { missing.push(remote[i]); i++; } else { unapplied.push(local[j]); j++; }
  }
  if (j === local.length) missing.push(...remote.slice(i));
  if (missing.length) return { erro: 'Remote migration versions not found in local migrations directory.', itens: missing };
  if (unapplied.length) return { erro: 'Found local migration files to be inserted before the last migration on remote database.', itens: unapplied };
  return { pendentes: local.slice(remote.length) };
}
const versoes = [...new Set(local.map(f => re.exec(f)[1]))];
console.log(`arquivos=${local.length} versoes_distintas=${versoes.length}`);
// Produção com todas as versões distintas até 20261027130000 registradas (cenário ideal).
const remoto = versoes.filter(v => v <= '20261027130000');
console.log('(2) db push, produção com histórico completo:', JSON.stringify(pending(local, remoto)));
// Depois de renomear o arquivo não registrado para 20261010198500 sem repair.
const renomeado = local.map(f => f === '20261010198000_mercadopago_oauth_clinicas.sql' ? '20261010198500_mercadopago_oauth_clinicas.sql' : f).sort();
console.log('(3) após renomear, sem repair:', JSON.stringify(pending(renomeado, remoto)));
const remoto2 = [...remoto, '20261010198500'].sort();
console.log('(4) após renomear + repair 20261010198500 applied:', JSON.stringify(pending(renomeado, remoto2)));
console.log('(5) 20261010198500 livre:', !local.some(f => f.startsWith('20261010198500')));
