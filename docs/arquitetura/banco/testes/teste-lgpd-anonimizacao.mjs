// Teste da RPC lgpd_anonimizar_paciente em PGlite, com dados sintéticos.
// Uso: instalar @electric-sql/pglite@0.3.15 fora do repositório e executar
// node teste-lgpd-anonimizacao.mjs <caminho>/20261028100000_lgpd_anonimizacao_transacional.sql
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const migration = readFileSync(process.argv[2], 'utf8');
const C1 = '11111111-1111-4111-8111-111111111111';
const C2 = '22222222-2222-4222-8222-222222222222';
const U1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const U2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
const P1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
const FUTURO = '2099-12-31';

const setup = `
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid $$;
CREATE TABLE public.membros (user_id uuid, clinica_id uuid, admin boolean);
CREATE FUNCTION public.is_admin(uuid) RETURNS boolean LANGUAGE sql STABLE AS
  $$ SELECT COALESCE((SELECT admin FROM public.membros WHERE user_id = $1), false) $$;
CREATE FUNCTION public.is_same_clinica(uuid) RETURNS boolean LANGUAGE sql STABLE AS
  $$ SELECT EXISTS (SELECT 1 FROM public.membros WHERE user_id = auth.uid() AND clinica_id = $1) $$;
CREATE TABLE public.pacientes (
  id uuid PRIMARY KEY, clinica_id uuid NOT NULL, nome text NOT NULL, nome_social text,
  cpf text, cpf_digitos text, telefone text, telefone_digitos text, email text,
  data_nascimento date, cep text, logradouro text, numero text, complemento text,
  bairro text, cidade text, estado text, foto_url text, nome_responsavel text,
  cpf_responsavel text, parentesco_responsavel text, profissao text, estado_civil text,
  observacoes text, numero_carteira text, validade_carteira date
);
CREATE TABLE public.lgpd_deletion_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), paciente_id uuid, clinica_id uuid,
  reason text, deleted_by uuid, created_at timestamptz DEFAULT now()
);
CREATE TABLE public.agendamentos (
  id uuid, paciente_id uuid, clinica_id uuid, status text, data date
);
CREATE TABLE public.guias_externas (
  paciente_id uuid, clinica_id uuid, paciente_nome text, paciente_cpf text,
  paciente_nascimento date, paciente_telefone text, paciente_email text
);
CREATE TABLE public.tarefas (paciente_id uuid, clinica_id uuid, titulo text, descricao text);
CREATE TABLE public.paciente_portal_tokens (paciente_id uuid, ativo boolean, expires_at timestamptz);
CREATE TABLE public.lista_espera (paciente_id uuid, clinica_id uuid);
CREATE TABLE public.whatsapp_conversations (paciente_id uuid, clinica_id uuid);
CREATE TABLE public.audit_log (
  collection text, record_id uuid, record_name text, changes jsonb
);
CREATE TABLE public.prontuarios (id uuid, paciente_id uuid, conteudo text);
CREATE TABLE public.lancamentos (id uuid, paciente_id uuid, descricao text, valor numeric);
INSERT INTO auth.users VALUES ('${U1}'), ('${U2}');
INSERT INTO public.membros VALUES ('${U1}', '${C1}', true), ('${U2}', '${C2}', true);
INSERT INTO public.pacientes (id, clinica_id, nome, cpf, telefone, email)
  VALUES ('${P1}', '${C1}', 'Paciente Sintetico', '11122233344', '11999990000', 'teste@example.invalid');
INSERT INTO public.prontuarios VALUES ('dddddddd-dddd-4ddd-8ddd-ddddddddddd1', '${P1}', 'Conteudo clinico preservado');
INSERT INTO public.lancamentos VALUES ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1', '${P1}', 'Cobranca preservada', 123.45);
`;

let falhas = 0;
const ok = (cond, nome, detalhe = '') => {
  console.log(`${cond ? 'OK  ' : 'FALHA'} ${nome}${detalhe ? ` (${detalhe})` : ''}`);
  if (!cond) falhas++;
};

async function novoBanco() {
  const db = new PGlite();
  await db.exec(setup);
  await db.exec(migration);
  return db;
}

async function chamar(db, uid, clinica = C1) {
  try {
    return await db.transaction(async (tx) => {
      if (uid) await tx.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid })]);
      await tx.exec('SET LOCAL ROLE authenticated');
      const r = await tx.query(
        'SELECT public.lgpd_anonimizar_paciente($1, $2, $3, $4) AS resultado',
        [P1, clinica, 'Solicitacao sintetica do titular', 'Paciente Sintetico']
      );
      return { resultado: r.rows[0].resultado };
    });
  } catch (e) {
    return { erro: e.message, codigo: e.code };
  }
}

console.log('--- mesma clínica, admin');
{
  const db = await novoBanco();
  const r = await chamar(db, U1);
  const p = (await db.query('SELECT nome, cpf, telefone, email FROM public.pacientes WHERE id = $1', [P1])).rows[0];
  const prontuario = (await db.query('SELECT conteudo FROM public.prontuarios WHERE paciente_id = $1', [P1])).rows[0];
  const lancamento = (await db.query('SELECT descricao, valor FROM public.lancamentos WHERE paciente_id = $1', [P1])).rows[0];
  ok(r.resultado?.anonimizado === true, 'admin da própria clínica anonimiza');
  ok(p.nome === 'Paciente anonimizado BBBBBBBB' && p.cpf === null && p.telefone === null && p.email === null, 'dados identificadores do cadastro foram removidos');
  ok(prontuario?.conteudo === 'Conteudo clinico preservado', 'prontuário permanece intacto');
  ok(lancamento?.descricao === 'Cobranca preservada' && Number(lancamento.valor) === 123.45, 'lançamento permanece intacto');
}

console.log('--- outra clínica');
{
  const db = await novoBanco();
  const r = await chamar(db, U2);
  const p = (await db.query('SELECT nome FROM public.pacientes WHERE id = $1', [P1])).rows[0];
  ok(r.codigo === '42501', 'admin de outra clínica recebe 42501', r.codigo ?? r.erro);
  ok(p.nome === 'Paciente Sintetico', 'recusa não altera o paciente');
}

console.log('--- sem sessão');
{
  const db = await novoBanco();
  const r = await chamar(db, null);
  ok(r.codigo === '42501', 'chamada sem sessão recebe 42501', r.codigo ?? r.erro);
}

console.log('--- agendamento futuro');
{
  const db = await novoBanco();
  await db.query('INSERT INTO public.agendamentos VALUES ($1, $2, $3, $4, $5)', [
    'ffffffff-ffff-4fff-8fff-fffffffffff1', P1, C1, 'confirmado', FUTURO,
  ]);
  const r = await chamar(db, U1);
  const p = (await db.query('SELECT nome FROM public.pacientes WHERE id = $1', [P1])).rows[0];
  ok(r.codigo === '55000', 'agendamento futuro é recusado com 55000', r.codigo ?? r.erro);
  ok(p.nome === 'Paciente Sintetico', 'recusa por agendamento não altera o paciente');
}

console.log('--- repetição idempotente');
{
  const db = await novoBanco();
  const primeira = await chamar(db, U1);
  const segunda = await chamar(db, U1);
  const logs = (await db.query("SELECT count(*)::int AS n FROM public.lgpd_deletion_log WHERE operacao = 'anonimizacao'")).rows[0].n;
  ok(primeira.resultado?.anonimizado === true, 'primeira chamada anonimiza');
  ok(segunda.resultado?.ja_anonimizado === true && segunda.resultado?.anonimizado === false, 'segunda chamada informa estado já anonimizado');
  ok(logs === 1, 'repetição não duplica o registro de auditoria', String(logs));
}

console.log(falhas ? `\n${falhas} falha(s)` : '\nTodos os casos passaram');
process.exit(falhas ? 1 : 0);
