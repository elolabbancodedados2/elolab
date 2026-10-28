/**
 * Executa a migration 20261029120000_fila_jobs.sql num Postgres em memória
 * (PGlite) e confere as regras da fila. PGlite tem uma conexão só: a
 * disputa entre duas sessões (SKIP LOCKED) fica para o pgTAP no CI efêmero.
 */
import { PGlite } from 'npm:@electric-sql/pglite@0.2.17';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

async function banco() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
    CREATE TABLE public.clinicas (id uuid PRIMARY KEY);
    INSERT INTO public.clinicas VALUES ('${A}'), ('${B}');
  `);
  const sql = await Deno.readTextFile(new URL('../../migrations/20261029120000_fila_jobs.sql', import.meta.url));
  await db.exec(sql);
  return db;
}

type Linha = Record<string, unknown>;
const q = async (db: PGlite, sql: string, params: unknown[] = []) => (await db.query<Linha>(sql, params)).rows;

const enfileirar = (db: PGlite, chave: string, clinica: string | null = A, ordem: string | null = null, repetivel = false, max = 3) =>
  q(db, `SELECT * FROM public.enfileirar_job('t.teste', $1, '{"id":1}'::jsonb, $2, $3, $4, $5)`, [chave, clinica, ordem, repetivel, max]);

const reivindicar = (db: PGlite, limite = 10, porClinica = 10) =>
  q(db, `SELECT id, chave_idempotencia, status, tentativas FROM public.reivindicar_jobs(ARRAY['t.teste'], $1, interval '2 minutes', $2)`, [limite, porClinica]);

Deno.test('enfileirar é idempotente e recusa chave de outra clínica', async () => {
  const db = await banco();
  const [r1] = await enfileirar(db, 'm1');
  const [r2] = await enfileirar(db, 'm1');
  assert(r1.criado === true && r2.criado === false && r1.job_id === r2.job_id, 'idempotência');
  let recusou = false;
  try { await enfileirar(db, 'm1', B); } catch { recusou = true; }
  assert(recusou, 'reaproveitou chave de outra clínica');
  const [{ total }] = await q(db, 'SELECT count(*)::int AS total FROM public.jobs');
  assert(total === 1, `total ${total}`);
});

Deno.test('ordem por chave: um job por conversa até concluir', async () => {
  const db = await banco();
  await enfileirar(db, 'c1-a', A, 'conversa:1');
  await enfileirar(db, 'c1-b', A, 'conversa:1');
  await enfileirar(db, 'c2-a', A, 'conversa:2');
  const lote1 = await reivindicar(db);
  const chaves1 = lote1.map((j) => j.chave_idempotencia).sort();
  assert(JSON.stringify(chaves1) === '["c1-a","c2-a"]', `lote1 ${chaves1}`);
  assert((await reivindicar(db)).length === 0, 'pegou c1-b com c1-a executando');
  const idA = lote1.find((j) => j.chave_idempotencia === 'c1-a')!.id;
  const [{ concluir_job }] = await q(db, 'SELECT public.concluir_job($1)', [idA]);
  assert(concluir_job === true, 'concluir');
  const lote3 = await reivindicar(db);
  assert(lote3.length === 1 && lote3[0].chave_idempotencia === 'c1-b', 'c1-b depois de c1-a');
});

Deno.test('justiça: limite de jobs por clínica no lote', async () => {
  const db = await banco();
  for (let i = 0; i < 5; i++) await enfileirar(db, `a${i}`, A);
  await enfileirar(db, 'b0', B);
  const lote = await reivindicar(db, 10, 2);
  const deA = lote.filter((j) => String(j.chave_idempotencia).startsWith('a')).length;
  assert(deA === 2 && lote.some((j) => j.chave_idempotencia === 'b0'), `lote ${lote.map((j) => j.chave_idempotencia)}`);
});

Deno.test('falha: backoff, depois dead; incerto e definitivo', async () => {
  const db = await banco();
  await enfileirar(db, 'f1', A, null, false, 2);
  let [j] = await reivindicar(db);
  let [{ falhar_job: s1 }] = await q(db, `SELECT public.falhar_job($1, 'timeout')`, [j.id]);
  assert(s1 === 'pendente', `1ª falha ${s1}`);
  const [{ futuro }] = await q(db, 'SELECT executar_apos > now() AS futuro FROM public.jobs WHERE id = $1', [j.id]);
  assert(futuro === true, 'sem backoff');
  assert((await reivindicar(db)).length === 0, 'reservou antes do backoff');
  await q(db, 'UPDATE public.jobs SET executar_apos = now() - interval \'1 second\' WHERE id = $1', [j.id]);
  [j] = await reivindicar(db);
  assert(j.tentativas === 2, `tentativas ${j.tentativas}`);
  [{ falhar_job: s1 }] = await q(db, `SELECT public.falhar_job($1, 'timeout')`, [j.id]);
  assert(s1 === 'dead', `esgotado ${s1}`);

  await enfileirar(db, 'f2');
  await enfileirar(db, 'f3');
  const lote = await reivindicar(db);
  const id2 = lote.find((x) => x.chave_idempotencia === 'f2')!.id;
  const id3 = lote.find((x) => x.chave_idempotencia === 'f3')!.id;
  const [{ falhar_job: s2 }] = await q(db, `SELECT public.falhar_job($1, 'falha_apos_envio', false, true)`, [id2]);
  const [{ falhar_job: s3 }] = await q(db, `SELECT public.falhar_job($1, 'payload_invalido', true)`, [id3]);
  assert(s2 === 'incerto' && s3 === 'dead', `${s2} ${s3}`);
  const [{ falhar_job: s4 }] = await q(db, `SELECT public.falhar_job($1, 'x')`, [id3]);
  assert(s4 === null, 'falhou job que não estava executando');
});

Deno.test('lease expirado: não repetível vai para incerto, repetível volta', async () => {
  const db = await banco();
  await enfileirar(db, 'l1', A, null, false);
  await enfileirar(db, 'l2', A, null, true);
  await reivindicar(db);
  await q(db, `UPDATE public.jobs SET bloqueado_ate = now() - interval '1 second'`);
  const lote = await reivindicar(db);
  assert(lote.length === 1 && lote[0].chave_idempotencia === 'l2', `lote ${lote.map((j) => j.chave_idempotencia)}`);
  const [{ status }] = await q(db, `SELECT status FROM public.jobs WHERE chave_idempotencia = 'l1'`);
  assert(status === 'incerto', `l1 ${status}`);
});

Deno.test('anon e authenticated não leem a tabela nem chamam as funções', async () => {
  const db = await banco();
  await enfileirar(db, 'r1');
  for (const papel of ['anon', 'authenticated']) {
    for (const sql of [
      'SELECT * FROM public.jobs',
      `SELECT * FROM public.enfileirar_job('t.teste', 'x', '{}'::jsonb, '${A}')`,
      `SELECT * FROM public.reivindicar_jobs(ARRAY['t.teste'])`,
    ]) {
      let negado = false;
      try {
        await db.exec(`SET ROLE ${papel}`);
        await db.query(sql);
      } catch {
        negado = true;
      } finally {
        await db.exec('RESET ROLE');
      }
      assert(negado, `${papel} executou: ${sql}`);
    }
  }
  await db.exec('SET ROLE service_role');
  const lote = await reivindicar(db);
  await db.exec('RESET ROLE');
  assert(lote.length === 1, 'service_role não reservou');
});
