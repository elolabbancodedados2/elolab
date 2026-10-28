// Teste da migration 20261029100000_multiunidade_fase1_expand.sql em PGlite,
// com dados sintéticos.
// Uso: instalar @electric-sql/pglite@0.3.15 fora do repositório e executar
// node teste-multiunidade.mjs <caminho>/20261029100000_multiunidade_fase1_expand.sql
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const migration = readFileSync(process.argv[2], 'utf8');
const C1 = '11111111-1111-4111-8111-111111111111';
const C2 = '22222222-2222-4222-8222-222222222222';
const C3 = '33333333-3333-4333-8333-333333333333';
const U1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'; // dono e admin de C1, também médico
const U2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'; // dono e admin de C2
const U3 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'; // recepção de C1, funcionário inativo
const U4 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4'; // sem clínica
const PA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5'; // plataforma, casa C3, impersonando C2

const setup = `
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT NULLIF(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid $$;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
CREATE TYPE public.app_role AS ENUM ('admin', 'medico', 'recepcao', 'enfermagem', 'financeiro');
CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS
  $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TABLE public.clinicas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nome text NOT NULL, cnpj text,
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE TABLE public.profiles (id uuid PRIMARY KEY, clinica_id uuid REFERENCES public.clinicas(id));
CREATE TABLE public.user_roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, role public.app_role, UNIQUE (user_id, role));
CREATE TABLE public.funcionarios (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, clinica_id uuid, ativo boolean DEFAULT true);
CREATE TABLE public.platform_admins (user_id uuid PRIMARY KEY, ativo boolean, impersonating_clinica_id uuid, original_clinica_id uuid);
CREATE FUNCTION public.is_platform_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
  $$ SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid() AND ativo = true) $$;
CREATE FUNCTION public.is_same_clinica(record_clinica_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
  $$ SELECT CASE WHEN record_clinica_id IS NULL THEN false
     ELSE record_clinica_id = (SELECT p.clinica_id FROM public.profiles p WHERE p.id = auth.uid()) END $$;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinicas TO authenticated;
GRANT SELECT ON public.profiles TO authenticated;
ALTER TABLE public.clinicas ENABLE ROW LEVEL SECURITY;
CREATE POLICY clinicas_select ON public.clinicas FOR SELECT TO authenticated
  USING (id = (SELECT p.clinica_id FROM public.profiles p WHERE p.id = auth.uid()));
CREATE POLICY clinicas_update ON public.clinicas FOR UPDATE TO authenticated USING (owner_id = auth.uid());
CREATE POLICY clinicas_insert ON public.clinicas FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
INSERT INTO auth.users VALUES ('${U1}'), ('${U2}'), ('${U3}'), ('${U4}'), ('${PA}');
INSERT INTO public.clinicas VALUES ('${C1}', 'Clinica Sintetica Um', '00000000000101', '${U1}'),
  ('${C2}', 'Clinica Sintetica Dois', NULL, '${U2}'), ('${C3}', 'Plataforma Interna', NULL, '${PA}');
INSERT INTO public.profiles VALUES ('${U1}', '${C1}'), ('${U2}', '${C2}'), ('${U3}', '${C1}'), ('${U4}', NULL), ('${PA}', '${C2}');
INSERT INTO public.user_roles (user_id, role) VALUES ('${U1}', 'admin'), ('${U1}', 'medico'), ('${U2}', 'admin'),
  ('${U3}', 'recepcao'), ('${U4}', 'medico'), ('${PA}', 'admin');
INSERT INTO public.funcionarios (user_id, clinica_id, ativo) VALUES ('${U3}', '${C1}', false);
INSERT INTO public.platform_admins VALUES ('${PA}', true, '${C2}', '${C3}');
`;

let falhas = 0;
const ok = (cond, nome, detalhe = '') => {
  console.log(`${cond ? 'OK  ' : 'FALHA'} ${nome}${detalhe ? ` (${detalhe})` : ''}`);
  if (!cond) falhas++;
};

const db = new PGlite();
await db.exec(setup);
const defAntes = (await db.query("SELECT pg_get_functiondef('public.is_same_clinica(uuid)'::regprocedure) AS d")).rows[0].d;
await db.exec(migration);

async function como(uid, sql, params = [], papel = 'authenticated') {
  try {
    return await db.transaction(async (tx) => {
      if (uid) await tx.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid })]);
      await tx.exec(`SET LOCAL ROLE ${papel}`);
      return { rows: (await tx.query(sql, params)).rows };
    });
  } catch (e) {
    return { erro: e.message, codigo: e.code };
  }
}
const q = async (sql, p = []) => (await db.query(sql, p)).rows;

console.log('--- backfill');
{
  const orgs = await q('SELECT count(*)::int n FROM public.organizacoes');
  const semOrg = await q('SELECT count(*)::int n FROM public.clinicas WHERE organizacao_id IS NULL');
  ok(orgs[0].n === 3 && semOrg[0].n === 0, 'uma organização por clínica e nenhuma clínica sem organização', `${orgs[0].n}/${semOrg[0].n}`);
  const donos = await q(`SELECT c.id FROM public.clinicas c JOIN public.membros_organizacao mo
    ON mo.organizacao_id = c.organizacao_id AND mo.user_id = c.owner_id AND mo.papel_org = 'dono'`);
  ok(donos.length === 3, 'dono de cada clínica é dono da organização');
  const mu = await q('SELECT clinica_id, user_id, papel::text, ativo FROM public.membros_unidade ORDER BY 1, 2, 3');
  const tem = (c, u, p, a = true) => mu.some((r) => r.clinica_id === c && r.user_id === u && r.papel === p && r.ativo === a);
  ok(tem(C1, U1, 'admin') && tem(C1, U1, 'medico'), 'U1 tem admin e médico em C1');
  ok(tem(C2, U2, 'admin'), 'U2 tem admin em C2');
  ok(tem(C1, U3, 'recepcao', false), 'funcionário inativo entra com ativo = false');
  ok(!mu.some((r) => r.user_id === U4), 'perfil sem clínica não ganha vínculo');
  ok(tem(C3, PA, 'admin') && !mu.some((r) => r.user_id === PA && r.clinica_id === C2),
    'plataforma em impersonação recebe vínculo na clínica original, não na impersonada');
  ok(mu.length === 5, 'total de vínculos esperado', String(mu.length));
}

console.log('--- idempotência');
{
  await db.exec(migration);
  const n = await q('SELECT (SELECT count(*) FROM public.organizacoes)::int o, (SELECT count(*) FROM public.membros_unidade)::int m, (SELECT count(*) FROM public.membros_organizacao)::int mo');
  ok(n[0].o === 3 && n[0].m === 5 && n[0].mo === 3, 'reexecutar a migration não duplica nada', JSON.stringify(n[0]));
}

console.log('--- helpers existentes intactas');
{
  const defDepois = (await db.query("SELECT pg_get_functiondef('public.is_same_clinica(uuid)'::regprocedure) AS d")).rows[0].d;
  ok(defAntes === defDepois, 'is_same_clinica não foi alterada');
}

console.log('--- mesma clínica permitido');
{
  const r = await como(U1, 'SELECT user_id FROM public.membros_unidade ORDER BY user_id');
  ok(r.rows?.some((x) => x.user_id === U3), 'admin de C1 vê a equipe de C1', r.erro);
  const o = await como(U1, 'SELECT nome FROM public.organizacoes');
  ok(o.rows?.length === 1 && o.rows[0].nome === 'Clinica Sintetica Um', 'admin de C1 vê só a própria organização', r.erro);
  const self = await como(U3, 'SELECT user_id FROM public.membros_unidade');
  ok(self.rows?.length === 1 && self.rows[0].user_id === U3, 'não admin vê só o próprio vínculo');
  const tp = await como(U1, `SELECT public.tem_papel($1, 'admin') a, public.tem_papel($2, 'admin') b, public.tem_papel(NULL, 'admin') c`, [C1, C2]);
  ok(tp.rows?.[0].a === true && tp.rows[0].b === false && tp.rows[0].c === false, 'tem_papel: true em C1, false em C2 e em NULL');
  const mu = await como(U1, 'SELECT * FROM public.minhas_unidades()');
  ok(mu.rows?.length === 1 && mu.rows[0].minhas_unidades === C1, 'minhas_unidades devolve só C1');
  const inativo = await como(U3, `SELECT public.tem_papel($1, 'recepcao') r`, [C1]);
  ok(inativo.rows?.[0].r === false, 'vínculo inativo não dá papel');
}

console.log('--- outra clínica negado');
{
  const r = await como(U2, 'SELECT clinica_id FROM public.membros_unidade WHERE clinica_id = $1', [C1]);
  ok(r.rows?.length === 0, 'admin de C2 não vê vínculos de C1', r.erro);
  const o = await como(U2, 'SELECT id FROM public.organizacoes WHERE clinica_origem_id = $1', [C1]);
  ok(o.rows?.length === 0, 'admin de C2 não vê a organização de C1', o.erro);
  const ins = await como(U2, `INSERT INTO public.membros_unidade (clinica_id, user_id, papel) VALUES ($1, $2, 'admin')`, [C1, U2]);
  ok(ins.codigo === '42501', 'admin de C2 não se insere em C1', ins.codigo ?? 'inseriu');
  const ins2 = await como(U1, `INSERT INTO public.membros_unidade (clinica_id, user_id, papel) VALUES ($1, $2, 'admin')`, [C1, U4]);
  ok(ins2.codigo === '42501', 'escrita direta por admin da unidade é negada na fase 1', ins2.codigo ?? 'inseriu');
  const upd = await como(U2, `UPDATE public.membros_unidade SET ativo = false WHERE clinica_id = $1 RETURNING 1`, [C1]);
  ok(upd.rows?.length === 0, 'admin de C2 não altera vínculos de C1', upd.erro);
  const org2 = (await q('SELECT organizacao_id FROM public.clinicas WHERE id = $1', [C2]))[0].organizacao_id;
  const mv = await como(U1, 'UPDATE public.clinicas SET organizacao_id = $1 WHERE id = $2', [org2, C1]);
  ok(mv.codigo === '42501', 'dono não pendura a clínica na organização de outra rede', mv.codigo ?? 'alterou');
  const nome = await como(U1, `UPDATE public.clinicas SET nome = 'Clinica Sintetica Um Renomeada' WHERE id = $1 RETURNING 1`, [C1]);
  ok(nome.rows?.length === 1, 'dono continua alterando outras colunas da clínica', nome.erro);
}

console.log('--- anon negado');
{
  const r = await como(null, 'SELECT * FROM public.membros_unidade', [], 'anon');
  ok(r.codigo === '42501', 'anon não lê membros_unidade', r.codigo ?? 'leu');
  const o = await como(null, 'SELECT * FROM public.organizacoes', [], 'anon');
  ok(o.codigo === '42501', 'anon não lê organizacoes', o.codigo ?? 'leu');
  const f = await como(null, `SELECT public.tem_papel($1, 'admin')`, [C1], 'anon');
  ok(f.codigo === '42501', 'anon não executa tem_papel', f.codigo ?? 'executou');
  const s = await como(null, 'SELECT count(*)::int n FROM public.membros_unidade', [], 'authenticated');
  ok(s.rows?.[0].n === 0, 'authenticated sem sessão não vê vínculos', s.erro);
}

console.log('--- plataforma');
{
  const ins = await como(PA, `INSERT INTO public.membros_unidade (clinica_id, user_id, papel) VALUES ($1, $2, 'medico') RETURNING 1`, [C2, U4]);
  ok(ins.rows?.length === 1, 'administrador da plataforma insere vínculo', ins.erro);
}

console.log(falhas ? `\n${falhas} falha(s)` : '\nTodos os casos passaram');
process.exit(falhas ? 1 : 0);
