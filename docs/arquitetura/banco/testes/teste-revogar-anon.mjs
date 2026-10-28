// Teste da migration 20261028090000 (rodada 2: ressalvas R1, R2 e R3 da auditoria) em PGlite.
// Uso: num diretório fora do repositório, npm i @electric-sql/pglite@0.3.15; depois
//      node teste-revogar-anon.mjs <caminho>/supabase/migrations/20261028090000_revogar_anon_e_privilegios_padrao.sql
// Dados sintéticos. Simula os papéis e privilégios padrão do Supabase.
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync } from 'node:fs';

const migration = readFileSync(process.argv[2], 'utf8');
const db = new PGlite({ extensions: { pgcrypto } });

const C1 = '11111111-1111-1111-1111-111111111111';
const C2 = '22222222-2222-2222-2222-222222222222';
const U1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'; // admin da clínica 1
const UP = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa9'; // admin da plataforma
const P1 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1'; // paciente da clínica 1
const P2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2'; // paciente da clínica 2

const setup = `
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth; CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto SCHEMA extensions;
GRANT USAGE ON SCHEMA public, auth, extensions TO anon, authenticated, service_role;
-- Padrão do Supabase: funções novas no public nascem executáveis por anon.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT NULLIF(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid $$;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

CREATE TABLE public.clinicas (id uuid PRIMARY KEY, nome text, created_at timestamptz DEFAULT now(),
  suspensa boolean DEFAULT false, arquivada boolean DEFAULT false, owner_id uuid);
CREATE TABLE public.membros (user_id uuid PRIMARY KEY, clinica_id uuid, admin boolean);
CREATE TABLE public.platform_admins (user_id uuid PRIMARY KEY);
CREATE TABLE public.pacientes (id uuid PRIMARY KEY, clinica_id uuid);
CREATE TABLE public.paciente_portal_tokens (id bigserial PRIMARY KEY, paciente_id uuid, clinica_id uuid,
  token text, ativo boolean, expires_at timestamptz);
CREATE TABLE public.audit_log (clinica_id uuid, "timestamp" timestamptz);
CREATE TABLE public.agendamentos (clinica_id uuid, updated_at timestamptz, status text, data date);
CREATE TABLE public.lancamentos (clinica_id uuid, updated_at timestamptz, tipo text, status text,
  data_vencimento date, valor numeric, valor_pago numeric);
CREATE TABLE public.fila_alertas_lab_esquecido (clinica_id uuid);
CREATE TABLE public.exames (clinica_id uuid, paciente_id uuid, status text, created_at timestamptz DEFAULT now());
CREATE TABLE public.assinaturas_plano (user_id uuid, status text, plano_id uuid, created_at timestamptz);
CREATE TABLE public.planos (id uuid PRIMARY KEY, nome text, ativo boolean DEFAULT true);

INSERT INTO public.clinicas (id, nome) VALUES ('${C1}', 'Clínica Teste 1'), ('${C2}', 'Clínica Teste 2');
INSERT INTO public.membros VALUES ('${U1}', '${C1}', true);
INSERT INTO public.platform_admins VALUES ('${UP}');
INSERT INTO public.pacientes VALUES ('${P1}', '${C1}'), ('${P2}', '${C2}');

CREATE FUNCTION public.get_my_clinica_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS
  $$ SELECT clinica_id FROM public.membros WHERE user_id = auth.uid() $$;
CREATE FUNCTION public.can_manage_data(_uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS
  $$ SELECT COALESCE((SELECT admin FROM public.membros WHERE user_id = _uid), false) $$;
CREATE FUNCTION public.is_platform_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS
  $$ SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()) $$;

-- Allowlist (corpos sintéticos).
CREATE FUNCTION public.validate_invite_code(_codigo text) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$ SELECT true $$;
CREATE FUNCTION public.validate_invitation_token(_token text) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$ SELECT true $$;
CREATE FUNCTION public.accept_employee_invitation(_token text, _user_id uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$ SELECT true $$;
CREATE FUNCTION public.verificar_assinatura_prontuario(p_codigo uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$ SELECT true $$;

-- Restrita a service_role, como provision_clinic_after_subscription.
CREATE FUNCTION public.provision_clinic_after_subscription(p uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$ SELECT true $$;
REVOKE ALL ON FUNCTION public.provision_clinic_after_subscription(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_clinic_after_subscription(uuid) TO service_role;

-- Função interna criada depois de 28/07, herdou anon pelo padrão.
CREATE FUNCTION public.funcao_interna_qualquer() RETURNS int LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$ SELECT 1 $$;

-- Função INVOKER: fora do escopo, não deve ser tocada.
CREATE FUNCTION public.funcao_invoker() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$;

-- Versões vulneráveis atuais (resumo fiel da checagem de 20261011010000 e 20260817240000).
CREATE FUNCTION public.link_portal_paciente(p_paciente_id uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions AS $$
DECLARE v_c uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.can_manage_data(auth.uid()) THEN RAISE EXCEPTION 'sem permissão'; END IF;
  SELECT clinica_id INTO v_c FROM public.pacientes WHERE id = p_paciente_id;
  IF auth.uid() IS NOT NULL AND v_c IS DISTINCT FROM public.get_my_clinica_id() THEN RAISE EXCEPTION 'sem permissão'; END IF;
  RETURN 'link-' || p_paciente_id;
END $$;
REVOKE ALL ON FUNCTION public.link_portal_paciente(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_portal_paciente(uuid) TO authenticated;
CREATE FUNCTION public.platform_get_clinicas_saude() RETURNS TABLE (clinica_id uuid, clinica_nome text,
  criada_em timestamptz, assinatura_status text, em_trial boolean, plano_nome text, suspensa boolean, arquivada boolean,
  ultima_atividade timestamptz, ultima_atividade_ha_dias integer, agendamentos_em_atendimento integer,
  coletas_esquecidas integer, exames_solicitados_ha_7d integer, contas_a_receber_vencidas integer,
  contas_a_receber_valor numeric, total_pacientes integer, total_agendamentos_no_mes integer, audits_no_mes integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_platform_admin() THEN RAISE EXCEPTION 'sem permissão'; END IF;
  RETURN QUERY SELECT c.id, c.nome, c.created_at, NULL::text, NULL::boolean, NULL::text, c.suspensa, c.arquivada,
    NULL::timestamptz, NULL::int, NULL::int, NULL::int, NULL::int, NULL::int, NULL::numeric, NULL::int, NULL::int, NULL::int
    FROM public.clinicas c;
END $$;

-- Trigger que chama link_portal_paciente (como notify_exam_result_available).
CREATE TABLE public.log_link (link text);
CREATE FUNCTION public.trg_exame_liberado() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN INSERT INTO public.log_link VALUES (public.link_portal_paciente(NEW.paciente_id)); RETURN NEW; END $$;
CREATE TRIGGER exame_liberado AFTER INSERT ON public.exames FOR EACH ROW EXECUTE FUNCTION public.trg_exame_liberado();
GRANT INSERT ON public.exames TO service_role;

-- R1: landing lê planos como anon (como 20260730050000 e 20260727230000).
INSERT INTO public.planos VALUES ('cccccccc-cccc-cccc-cccc-ccccccccccc1', 'Plano Ativo', true),
  ('cccccccc-cccc-cccc-cccc-ccccccccccc2', 'Plano Inativo', false);
ALTER TABLE public.planos ENABLE ROW LEVEL SECURITY;
CREATE POLICY planos_public_select ON public.planos FOR SELECT TO anon, authenticated USING (ativo = true);
CREATE POLICY planos_platform_admin ON public.planos FOR ALL TO authenticated
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
-- Tabela clínica com policy TO public (cláusula TO omitida) chamando helper.
ALTER TABLE public.pacientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY pacientes_select ON public.pacientes FOR SELECT USING (clinica_id = public.get_my_clinica_id());
-- Padrão do Supabase para tabelas.
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;

-- R2: funções de cron (nascem executáveis por todos pelo padrão acima).
CREATE TABLE public.lembretes (n int);
GRANT INSERT ON public.lembretes TO anon, authenticated;
CREATE FUNCTION public.enfileirar_lembretes_retorno() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS
  $$ BEGIN INSERT INTO public.lembretes VALUES (1); RETURN 1; END $$;
CREATE FUNCTION public.verificar_saude_clinicas_e_alertar() RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path = '' AS
  $$ SELECT count(*)::int FROM public.platform_get_clinicas_saude() $$;
CREATE FUNCTION public.watchdog_atendimento_travado() RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$ SELECT 1 $$;
CREATE FUNCTION public.expirar_ofertas_lista_espera() RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$ SELECT 1 $$;
CREATE FUNCTION public.expire_trials() RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$ SELECT $$;
CREATE FUNCTION public.limpar_rate_limit_antigos() RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$ SELECT $$;
-- Já restritas a service_role nas migrations de origem.
CREATE FUNCTION public.expirar_planos_pre_pagos() RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$ SELECT $$;
REVOKE ALL ON FUNCTION public.expirar_planos_pre_pagos() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expirar_planos_pre_pagos() TO service_role;
-- atualizar_predicoes_no_show e limpar_logs_antigos ausentes: a migration só avisa.

-- pg_cron simulado: um job roda com papel que não é o dono.
CREATE ROLE cron_runner NOLOGIN;
GRANT USAGE ON SCHEMA public TO cron_runner;
CREATE SCHEMA cron;
CREATE TABLE cron.job (jobid serial, username text, command text);
INSERT INTO cron.job (username, command) VALUES
  ('cron_runner', 'SELECT public.watchdog_atendimento_travado()'),
  ('postgres', 'SELECT public.enfileirar_lembretes_retorno()');
`;

let falhas = 0;
const ok = (cond, nome) => { console.log(`${cond ? 'OK  ' : 'FALHA'} ${nome}`); if (!cond) falhas++; };

// Executa sql como um papel com JWT simulado; devolve {rows} ou {erro, codigo}.
async function como(papel, claims, sql) {
  try {
    return await db.transaction(async (tx) => {
      if (claims) await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
      if (papel) await tx.exec(`SET LOCAL ROLE ${papel}`);
      const r = await tx.query(sql);
      return { rows: r.rows };
    });
  } catch (e) {
    return { erro: e.message, codigo: e.code };
  }
}
const anon = (sql) => como('anon', { role: 'anon' }, sql);
const auth = (uid, sql) => como('authenticated', { role: 'authenticated', sub: uid }, sql);
const service = (sql) => como('service_role', { role: 'service_role' }, sql);
const priv = async (papel, fn) =>
  (await db.query(`SELECT has_function_privilege('${papel}', '${fn}', 'EXECUTE') AS p`)).rows[0].p;

await db.exec(setup);

console.log('--- antes da migration (reproduz o P0)');
ok(!(await anon(`SELECT public.platform_get_clinicas_saude()`)).erro, 'anon lê a saúde de todas as clínicas (vulnerável)');
ok(await priv('anon', 'public.funcao_interna_qualquer()'), 'função interna nova nasce executável por anon (vulnerável)');
ok(!(await auth(U1, `SELECT public.enfileirar_lembretes_retorno()`)).erro, 'usuário logado dispara job de cron (SEC-R1-05, vulnerável)');
ok((await anon(`SELECT count(*)::int n FROM public.planos`)).rows?.[0]?.n === 1, 'landing: anon lê 1 plano ativo antes');

await db.exec(migration);

console.log('--- link_portal_paciente');
let r = await anon(`SELECT public.link_portal_paciente('${P1}')`);
ok(r.codigo === '42501', `anon negado (${r.codigo})`);
r = await auth(U1, `SELECT public.link_portal_paciente('${P1}') AS l`);
ok(!r.erro && r.rows[0].l?.startsWith('https://'), `mesma clínica permitido ${r.erro ?? ''}`);
r = await auth(U1, `SELECT public.link_portal_paciente('${P2}')`);
ok(r.codigo === '42501', `outra clínica negado (${r.codigo})`);
r = await service(`SELECT public.link_portal_paciente('${P2}') AS l`);
ok(!r.erro, `service_role permitido ${r.erro ?? ''}`);
r = await service(`INSERT INTO public.exames (clinica_id, paciente_id, status) VALUES ('${C1}', '${P1}', 'liberado')`);
ok(!r.erro, `trigger sem usuário permitido ${r.erro ?? ''}`);
const tok = (await db.query(`SELECT count(*)::int n, bool_and(length(token) = 64) h FROM public.paciente_portal_tokens`)).rows[0];
ok(tok.n === 3 && tok.h, `tokens gravados só como hash SHA-256 (${tok.n})`);
// Ignora a ACL e simula anon com EXECUTE: a checagem interna ainda recusa.
r = await como(null, { role: 'anon' }, `SELECT public.link_portal_paciente('${P1}')`);
ok(r.codigo === '42501', `checagem interna recusa JWT anon mesmo com EXECUTE (${r.codigo})`);
r = await como(null, null, `SELECT public.link_portal_paciente('${P1}') AS l`);
ok(!r.erro, `chamada interna sem JWT permitida ${r.erro ?? ''}`);

console.log('--- platform_get_clinicas_saude');
r = await anon(`SELECT * FROM public.platform_get_clinicas_saude()`);
ok(r.codigo === '42501', `anon negado (${r.codigo})`);
r = await como(null, { role: 'anon' }, `SELECT * FROM public.platform_get_clinicas_saude()`);
ok(r.codigo === '42501', `checagem interna recusa JWT anon mesmo com EXECUTE (${r.codigo})`);
r = await auth(U1, `SELECT * FROM public.platform_get_clinicas_saude()`);
ok(r.codigo === '42501', `usuário de clínica negado (${r.codigo})`);
r = await auth(UP, `SELECT * FROM public.platform_get_clinicas_saude()`);
ok(!r.erro && r.rows.length === 2, `admin da plataforma vê 2 clínicas ${r.erro ?? ''}`);
r = await como(null, null, `SELECT * FROM public.platform_get_clinicas_saude()`);
ok(!r.erro && r.rows.length === 2, `cron (sem JWT) permitido ${r.erro ?? ''}`);

console.log('--- grants');
for (const fn of ['public.validate_invite_code(text)', 'public.validate_invitation_token(text)',
  'public.accept_employee_invitation(text,uuid)', 'public.verificar_assinatura_prontuario(uuid)']) {
  ok(await priv('anon', fn), `allowlist mantém anon: ${fn}`);
}
ok(!(await priv('anon', 'public.funcao_interna_qualquer()')), 'função interna: anon revogado');
ok(await priv('authenticated', 'public.funcao_interna_qualquer()'), 'função interna: authenticated mantido');
ok(!(await priv('authenticated', 'public.provision_clinic_after_subscription(uuid)')), 'restrita a service_role: authenticated continua sem acesso');
ok(await priv('service_role', 'public.provision_clinic_after_subscription(uuid)'), 'restrita a service_role: service_role mantido');
ok(await priv('anon', 'public.funcao_invoker()'), 'função INVOKER fora do escopo, não alterada');
const sobra = (await db.query(`SELECT count(*)::int n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prosecdef AND has_function_privilege('anon', p.oid, 'EXECUTE')`)).rows[0].n;
ok(sobra === 4, `só as 4 da allowlist executáveis por anon (${sobra})`);

console.log('--- privilégios padrão (função criada depois)');
await db.exec(`CREATE FUNCTION public.funcao_futura() RETURNS int LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$ SELECT 1 $$`);
ok(!(await priv('anon', 'public.funcao_futura()')), 'função futura: anon sem EXECUTE');
ok(await priv('authenticated', 'public.funcao_futura()'), 'função futura: authenticated com EXECUTE');
ok(await priv('service_role', 'public.funcao_futura()'), 'função futura: service_role com EXECUTE');


console.log('--- R3: papel da sessão sem JWT (PostgREST sem request.jwt.claims)');
// Concede EXECUTE só dentro da transação de teste, para exercitar a checagem interna.
async function sessaoSemJwt(papel, grantFn, sql) {
  try {
    return await db.transaction(async (tx) => {
      await tx.exec(`GRANT EXECUTE ON FUNCTION ${grantFn} TO ${papel}`);
      await tx.exec(`SET LOCAL ROLE ${papel}`);
      const r = await tx.query(sql);
      await tx.rollback();
      return { rows: r.rows };
    });
  } catch (e) { return { erro: e.message, codigo: e.code }; }
}
r = await sessaoSemJwt('anon', 'public.link_portal_paciente(uuid)', `SELECT public.link_portal_paciente('${P1}')`);
ok(r.codigo === '42501', `link_portal_paciente: SET ROLE anon sem JWT recusado (${r.codigo})`);
r = await sessaoSemJwt('anon', 'public.platform_get_clinicas_saude()', `SELECT * FROM public.platform_get_clinicas_saude()`);
ok(r.codigo === '42501', `platform_get_clinicas_saude: SET ROLE anon sem JWT recusado (${r.codigo})`);
r = await sessaoSemJwt('authenticated', 'public.platform_get_clinicas_saude()', `SELECT * FROM public.platform_get_clinicas_saude()`);
ok(r.codigo === '42501', `platform_get_clinicas_saude: SET ROLE authenticated sem JWT recusado (${r.codigo})`);
r = await como('service_role', null, `SELECT * FROM public.platform_get_clinicas_saude()`);
ok(!r.erro && r.rows.length === 2, `service_role sem JWT permitido ${r.erro ?? ''}`);
r = await como(null, null, `SELECT public.verificar_saude_clinicas_e_alertar() AS n`);
ok(!r.erro && r.rows[0].n === 2, `cron interno (dono, sem JWT) aninhado continua funcionando ${r.erro ?? ''}`);
const papelInterno = (await db.query(`SELECT current_setting('role') AS papel`)).rows[0].papel;
ok(papelInterno === 'none', `sessão interna tem role = none (${papelInterno})`);

console.log('--- R2: funções de cron');
for (const fn of ['enfileirar_lembretes_retorno', 'verificar_saude_clinicas_e_alertar', 'watchdog_atendimento_travado',
  'expirar_ofertas_lista_espera', 'expire_trials', 'limpar_rate_limit_antigos', 'expirar_planos_pre_pagos']) {
  ok(!(await priv('authenticated', `public.${fn}()`)) && !(await priv('anon', `public.${fn}()`)),
    `${fn}: sem anon e sem authenticated`);
  ok(await priv('service_role', `public.${fn}()`), `${fn}: service_role mantido`);
}
r = await auth(U1, `SELECT public.enfileirar_lembretes_retorno()`);
ok(r.codigo === '42501', `usuário logado não dispara o job (${r.codigo})`);
ok(await priv('cron_runner', 'public.watchdog_atendimento_travado()'), 'papel do job do cron (não dono) mantém EXECUTE');
ok(!(await priv('cron_runner', 'public.expire_trials()')), 'papel do cron não ganha EXECUTE em função de outro job');
r = await como('service_role', { role: 'service_role' }, `SELECT public.enfileirar_lembretes_retorno()`);
ok(!r.erro, `service_role chama o job manualmente ${r.erro ?? ''}`);

console.log('--- R1: policies alcançáveis por anon');
r = await anon(`SELECT nome FROM public.planos`);
ok(!r.erro && r.rows.length === 1, `landing: anon lê só o plano ativo depois ${r.erro ?? ''}`);
r = await auth(U1, `SELECT nome FROM public.planos`);
ok(!r.erro && r.rows.length === 1, `usuário de clínica lê planos ativos ${r.erro ?? ''}`);
r = await anon(`SELECT * FROM public.pacientes`);
ok(r.codigo === '42501', `pacientes (policy TO public com helper): anon recebe 42501, listado no NOTICE (${r.codigo})`);
r = await auth(U1, `SELECT id FROM public.pacientes`);
ok(!r.erro && r.rows.length === 1 && r.rows[0].id === P1, `pacientes: mesma clínica vê só o seu ${r.erro ?? ''}`);
const dep = (await db.query(`SELECT count(*)::int n FROM pg_depend d JOIN pg_policy p ON p.oid = d.objid
  WHERE d.classid = 'pg_policy'::regclass AND d.refclassid = 'pg_proc'::regclass AND p.polname = 'pacientes_select'`)).rows[0].n;
ok(dep >= 1, `pg_depend registra a função usada na policy (${dep})`);

console.log('--- R1: trava aborta se policy de tabela pública chamar função revogada');
const db2 = new PGlite({ extensions: { pgcrypto } });
await db2.exec(setup);
await db2.exec(`CREATE POLICY planos_select ON public.planos FOR SELECT USING (public.is_platform_admin() OR ativo)`);
let erroTrava = null;
try { await db2.exec(migration); } catch (e) { erroTrava = e.message; await db2.exec("ROLLBACK"); }
ok(erroTrava?.includes('planos_select') && erroTrava.includes('is_platform_admin'), `migration abortada: ${erroTrava?.slice(0, 120)}`);
ok(await (async () => (await db2.query(`SELECT has_function_privilege('anon', 'public.funcao_interna_qualquer()', 'EXECUTE') p`)).rows[0].p)(),
  'abortada sem efeito parcial (função interna continua como antes)');
r = await (async () => { try { await db2.transaction(async (tx) => { await tx.query(`SELECT set_config('request.jwt.claims', '{"role":"anon"}', true)`); await tx.exec('SET LOCAL ROLE anon'); await tx.query('SELECT * FROM public.planos'); }); return {}; } catch (e) { return { codigo: e.code }; } })();
ok(!r.codigo, `landing segue funcionando no banco onde a migration abortou (${r.codigo ?? 'ok'})`);
console.log('--- idempotência');
let erroReaplicar = null;
try { await db.exec(migration); } catch (e) { erroReaplicar = e.message; }
ok(!erroReaplicar, `migration reaplicada sem erro ${erroReaplicar ?? ''}`);

console.log(falhas ? `\n${falhas} falha(s)` : '\nTodos os casos passaram');
process.exit(falhas ? 1 : 0);
