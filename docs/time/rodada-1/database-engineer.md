# Rodada 1 — database-engineer

Tarefa: migration local de revogação de `EXECUTE` para anon/PUBLIC, privilégios padrão e correção de `link_portal_paciente` e `platform_get_clinicas_saude` (CLIN-QA-001, item 7.2 do diagnóstico). Nada foi aplicado em banco algum, e não houve commit.

## O que fiz

Escrevi `supabase/migrations/20261028090000_revogar_anon_e_privilegios_padrao.sql`. Ela roda numa única transação, com `lock_timeout` de 5 s:

1. **`link_portal_paciente(uuid)`**: sem usuário, só passam trigger (`pg_trigger_depth() > 0`), chamada interna sem JWT ou `service_role`. Um JWT de anon recebe `42501`. Com usuário, as checagens continuam: `can_manage_data` e o paciente precisa ser da clínica do usuário. `search_path = ''`, com nomes qualificados (`extensions.gen_random_bytes`, `extensions.digest`).
2. **`platform_get_clinicas_saude()`**: com usuário, exige `is_platform_admin()`. Sem usuário, aceita só o cron (sem JWT) ou `service_role`; anon recebe `42501`. `search_path = ''`. A assinatura e as colunas de retorno não mudaram.
3. **Revogação em massa**: retira `EXECUTE` de PUBLIC e de anon em toda função `SECURITY DEFINER` do schema `public`, exceto as funções de extensão e a allowlist. O acesso efetivo de `authenticated` e `service_role` é medido antes e restaurado com `GRANT` explícito. Assim, funções restritas a `service_role` (por exemplo `provision_clinic_after_subscription`) continuam restritas. A migration de 28/07 fazia `GRANT ... TO authenticated` em tudo; esta não.
4. **Privilégios padrão**: `ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` (precisa ser global, porque o `EXECUTE` para PUBLIC é padrão do Postgres) e `... IN SCHEMA public REVOKE ... FROM anon`. Também reafirma o `GRANT` para `authenticated` e `service_role`. Faz o mesmo para `supabase_admin` só se o papel que aplica for membro dele; senão, avisa com `NOTICE`.
5. **Verificação final**: aborta a transação se sobrar alguma função `SECURITY DEFINER` do `public` executável por anon fora da allowlist. A comparação é por OID, não pelo texto da assinatura.
6. `NOTIFY pgrst, 'reload schema'`.

Allowlist: funções que continuam executáveis por anon porque são usadas antes do login.

| Função | Chamador |
|---|---|
| `validate_invite_code(text)` | `src/pages/Auth.tsx:305` |
| `validate_invitation_token(text)` | `src/pages/AceitarConvite.tsx:80` |
| `accept_employee_invitation(text, uuid)` | `src/pages/AceitarConvite.tsx:246` |
| `verificar_assinatura_prontuario(uuid)` | `src/pages/VerificarAssinatura.tsx:43`, rota pública `src/App.tsx:235` |

Funções que avaliei e que **não** precisam de anon:
- `estado_operacional`: a query só roda com usuário logado (`src/components/OperationalGuard.tsx:21`).
- `activate_public_registration`: exige `auth.uid()` (`supabase/migrations/20261010198000_checkout_provisionamento_seguro.sql:191`).
- `checar_rate_limit`: só para `service_role` (`supabase/migrations/20260817190000_rate_limit_para_endpoints_publicos.sql:97`).
- Edge functions: as que usam a anon key repassam o `Authorization` do usuário (`admin-contas/index.ts:65`, `integration-health/index.ts:24`, `invite-employee/index.ts:49`, `memed-prescription/index.ts:123`, `backup-verificar/index.ts:44`, `resend-pending-registration/index.ts:22`, `reconcile-pending-registrations/index.ts:31`); `public-booking` usa service role (`public-booking/index.ts:88`).

A reversão está documentada no cabeçalho da migration. Ela depende de guardar antes a lista do item 7.1.

## Arquivos tocados

- `supabase/migrations/20261028090000_revogar_anon_e_privilegios_padrao.sql` (novo)
- `docs/time/rodada-1/database-engineer.md` (este arquivo)

Não toquei `20261028100000_lgpd_anonimizacao_transacional.sql`, que é do backend-developer, nem as notas em `docs/arquitetura/banco/`, porque a regra da rodada limita os arquivos.

## Evidências

O repositório não tem padrão de PGlite nem de pgTAP (`grep -ril "pglite\|pgtap"` sem resultado; não existe `supabase/tests`). Por isso o teste rodou em PGlite 0.3.15 instalado só no scratchpad, sem alterar o `package.json`. O script está no apêndice.

Ele simula os papéis `anon`, `authenticated` e `service_role`, os privilégios padrão do Supabase, `auth.uid()` lido de `request.jwt.claims`, e as versões vulneráveis atuais das duas RPCs. Usa dados sintéticos.

Comando: `node teste-revogar-anon.mjs supabase/migrations/20261028090000_revogar_anon_e_privilegios_padrao.sql`. Resultado: **30 de 30 OK, "Todos os casos passaram"**. Os casos cobrem:
- antes da migration: anon lê a saúde de todas as clínicas e uma função interna nova nasce executável por anon (reproduz o P0);
- `link_portal_paciente`: anon negado com `42501`; mesma clínica permitido; outra clínica negado com `42501`; `service_role` permitido; trigger sem usuário permitido; token gravado só como hash de 64 caracteres; JWT de anon recusado pela checagem interna mesmo com `EXECUTE`; chamada interna sem JWT permitida;
- `platform_get_clinicas_saude`: anon negado; JWT de anon negado mesmo com `EXECUTE`; usuário de clínica negado; admin da plataforma vê as 2 clínicas; cron sem JWT permitido;
- grants: as 4 da allowlist mantêm anon; função interna perde anon e mantém `authenticated`; função restrita a `service_role` continua sem `authenticated`; função INVOKER não é alterada; só 4 funções `SECURITY DEFINER` continuam executáveis por anon;
- privilégios padrão: função criada depois da migration nasce sem anon e com `authenticated` e `service_role`;
- idempotência: reaplicar a migration não dá erro.

Não rodei tsc nem vitest, conforme o aviso do orquestrador. Nenhum arquivo TypeScript foi tocado.

## Riscos

- **NÃO VERIFICADO em produção.** A lista real de funções executáveis por anon na VPS depende da consulta somente leitura do item 7.1 (security-engineer). Se ela mostrar outra função usada antes do login, essa função precisa entrar na allowlist antes da aplicação; caso contrário, a verificação final aborta ou a tela pública quebra com `42501`.
- Policies `TO public` que chamam helper `SECURITY DEFINER`: se o anon consultar essas tabelas, recebe `42501` em vez de lista vazia. Esse comportamento já existia para as helpers anteriores a 28/07. NÃO VERIFICADO para tabelas consultadas por anon.
- O `REVOKE ... FROM PUBLIC` global nos privilégios padrão de `postgres` vale para funções futuras em qualquer schema: fora do `public`, elas passam a precisar de `GRANT` explícito.
- A regra "sem JWT = chamada interna" pressupõe que todo acesso pela API passa pelo PostgREST, que define `request.jwt.claims`. Uma conexão direta ao Postgres com credencial de banco é tratada como interna, como já acontecia.
- `supabase_admin`: se o Studio self-hosted criar funções com esse papel e a migration não rodar como membro dele, os padrões desse papel continuam abertos (aparece no `NOTICE`).
- Funções criadas daqui para frente que precisem de anon têm de fazer `GRANT ... TO anon` explicitamente. Isso precisa entrar no checklist de revisão de migrations.

## Próximo dono

1. **security-engineer**: rodar a consulta do item 7.1 na VPS (somente leitura), guardar a lista para a reversão e comparar com a allowlist.
2. **Responsável**: aprovar e aplicar, com backup antes, depois do item 1.
3. **qa-engineer / devops-sre**: adotar o teste do apêndice no CI contra banco efêmero. Ele pode virar `supabase/tests/database/*.test.sql` em pgTAP ou ficar em PGlite, conforme `docs/operations/ci-banco-efemero.md`.
4. **backend-developer**: a migration `20261028100000` roda depois desta e já nasce sem anon pelos novos padrões, mas deve manter `REVOKE ... FROM PUBLIC, anon` explícito.

## Apêndice — teste PGlite

Para rodar: num diretório fora do repositório, `npm i @electric-sql/pglite@0.3.15` e `node teste-revogar-anon.mjs <caminho-da-migration>`.

```js
// Teste da migration 20261028090000_revogar_anon_e_privilegios_padrao.sql em PGlite.
// Uso: node teste-revogar-anon.mjs <caminho-da-migration>
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
CREATE TABLE public.planos (id uuid PRIMARY KEY, nome text);

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

console.log('--- idempotência');
let erroReaplicar = null;
try { await db.exec(migration); } catch (e) { erroReaplicar = e.message; }
ok(!erroReaplicar, `migration reaplicada sem erro ${erroReaplicar ?? ''}`);

console.log(falhas ? `\n${falhas} falha(s)` : '\nTodos os casos passaram');
process.exit(falhas ? 1 : 0);
```
