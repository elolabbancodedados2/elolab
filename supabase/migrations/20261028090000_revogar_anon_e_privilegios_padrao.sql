-- ============================================================================
-- Revogação de EXECUTE para anon/PUBLIC e privilégios padrão de funções
-- (CLIN-QA-001, itens 7.2 do diagnóstico)
--
-- ESCRITA LOCALMENTE. NÃO APLICAR sem aprovação do responsável, backup e a
-- consulta somente leitura do item 7.1 (lista de funções executáveis por anon
-- antes da mudança, guardada para a reversão).
--
-- Problema:
--   * A revogação em massa de 20260728041952 foi pontual. Funções
--     SECURITY DEFINER criadas depois herdaram EXECUTE para anon pelos
--     privilégios padrão do Supabase (não há ALTER DEFAULT PRIVILEGES em
--     nenhuma migration).
--   * link_portal_paciente (20261011010000) e platform_get_clinicas_saude
--     (20260817240000) só checam permissão e tenant quando auth.uid() não é
--     nulo. Uma chamada anon pela API pula as duas checagens.
--
-- O que esta migration faz (tudo em uma transação):
--   1. Reescreve link_portal_paciente e platform_get_clinicas_saude:
--      sem login, só passam chamadas internas (sem JWT: pg_cron, SQL do
--      banco) ou com papel service_role. JWT de anon recebe 42501.
--      search_path passa a ser '' com nomes qualificados.
--   2. Revoga EXECUTE de PUBLIC e anon em todas as funções SECURITY DEFINER
--      do schema public, exceto a allowlist abaixo. Os privilégios efetivos
--      de authenticated e service_role são preservados: quem só tinha
--      EXECUTE via PUBLIC recebe GRANT explícito.
--   3. ALTER DEFAULT PRIVILEGES: funções futuras deixam de nascer
--      executáveis por anon e PUBLIC; authenticated e service_role mantêm.
--   2b. Funções de pg_cron (SEC-R1-05): tira EXECUTE de PUBLIC, anon e
--      authenticated; só service_role, o dono e o papel do job do cron.
--   4. Verificação final: aborta a transação se (a) sobrar função SECURITY
--      DEFINER do public executável por anon fora da allowlist; (b) alguma
--      função de cron continuar executável por anon ou authenticated;
--      (c) alguma policy de SELECT que vale para anon, numa tabela lida antes
--      do login (lista v_tabelas_publicas), chamar função que anon não pode
--      executar. Sem (c), a landing receberia 42501 em vez das linhas.
--
-- Ajustes da rodada 2 (ressalvas da seção 4.5 de
-- docs/seguranca/auditoria-rodada-1.md):
--   R1 policies TO public: verificação 4c acima, mais NOTICE com as demais
--      tabelas em que anon passa a receber erro em vez de lista vazia.
--   R2 cron: passo 2b e verificação 4b.
--   R3 caminho sem JWT: as duas RPCs não dependem mais só de
--      request.jwt.claims. O papel da sessão (current_setting('role'), que o
--      PostgREST define em toda requisição e que SECURITY DEFINER não altera)
--      também é conferido. Sem usuário, só passa se nenhum dos dois indicar
--      papel diferente de service_role.
--
-- Allowlist (funções que DEVEM continuar executáveis por anon, usadas antes
-- do login):
--   public.validate_invite_code(text)           src/pages/Auth.tsx:305
--   public.validate_invitation_token(text)      src/pages/AceitarConvite.tsx:80
--   public.accept_employee_invitation(text,uuid) src/pages/AceitarConvite.tsx:246
--   public.verificar_assinatura_prontuario(uuid) src/pages/VerificarAssinatura.tsx:43
-- Funções novas que precisem de anon devem ter GRANT ... TO anon explícito
-- na própria migration e entrar nesta lista no próximo ajuste.
--
-- Compatibilidade (expand/contract): as assinaturas não mudam. Frontend
-- chama as duas RPCs autenticado (src/pages/Pacientes.tsx:1066,
-- src/pages/PortalPacientesClinica.tsx:39, src/pages/PlatformSaude.tsx:105);
-- o trigger de resultado de exame chama link_portal_paciente com
-- pg_trigger_depth() > 0; o cron chama platform_get_clinicas_saude via
-- verificar_saude_clinicas_e_alertar, sem JWT. Edge functions usam
-- service_role. Nenhum desses caminhos perde acesso.
--
-- ----------------------------------------------------------------------------
-- REVERSÃO (rodar em transação, só com aprovação do responsável):
--   1. Funções: reaplicar os corpos de
--        supabase/migrations/20261011010000_portal_paciente_scoped_links.sql
--        supabase/migrations/20260817240000_saude_permite_chamada_do_cron.sql
--   2. Grants: para cada função da lista salva no item 7.1 (executáveis por
--      anon antes desta migration):
--        GRANT EXECUTE ON FUNCTION <assinatura> TO anon;
--      Não reverter em massa com GRANT ... TO PUBLIC: reabre o P0.
--      Funções de cron (passo 2b): só se algo legítimo quebrar, devolver
--      authenticated às funções da saída da consulta 1.6 guardada antes:
--        GRANT EXECUTE ON FUNCTION <assinatura> TO authenticated;
--   3. Privilégios padrão:
--        ALTER DEFAULT PRIVILEGES FOR ROLE postgres
--          GRANT EXECUTE ON FUNCTIONS TO PUBLIC;
--        ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--          GRANT EXECUTE ON FUNCTIONS TO anon;
--      (repetir FOR ROLE supabase_admin se o passo 3 abaixo tiver rodado
--      para esse papel; ver NOTICE da aplicação).
--   4. NOTIFY pgrst, 'reload schema';
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ─── 1a. link_portal_paciente ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.link_portal_paciente(p_paciente_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_token_bruto text;
  v_clinica_id uuid;
  v_uid uuid := auth.uid();
  v_chamada_trigger boolean := pg_trigger_depth() > 0;
  -- Papel do JWT da requisição. NULL quando não há requisição da API
  -- (pg_cron, SQL direto no banco, trigger disparado por esses contextos).
  v_papel_jwt text := COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    NULLIF(current_setting('request.jwt.claim.role', true), '')
  );
  -- Papel da sessão (SET ROLE do PostgREST). SECURITY DEFINER troca o
  -- current_user, mas não este parâmetro. 'none' = sem SET ROLE (interno).
  v_papel_sessao text := NULLIF(NULLIF(current_setting('role', true), ''), 'none');
BEGIN
  IF v_uid IS NULL THEN
    -- Sem usuário: só trigger, chamada interna (sem JWT e sem SET ROLE) ou
    -- service_role. anon, ou qualquer outro papel, é recusado, mesmo que o
    -- JWT não tenha chegado ao banco.
    IF NOT v_chamada_trigger
       AND (COALESCE(v_papel_jwt, 'service_role') <> 'service_role'
            OR COALESCE(v_papel_sessao, 'service_role') <> 'service_role') THEN
      RAISE EXCEPTION 'Sem permissão para gerar link do portal'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF NOT v_chamada_trigger AND NOT public.can_manage_data(v_uid) THEN
    RAISE EXCEPTION 'Sem permissão para gerar link do portal'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Serializa as emissões para este paciente e evita deixar dois links ativos.
  SELECT p.clinica_id INTO v_clinica_id
    FROM public.pacientes p
   WHERE p.id = p_paciente_id
   FOR UPDATE;

  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Com usuário (inclusive em trigger), o paciente precisa ser da clínica dele.
  IF v_uid IS NOT NULL
     AND v_clinica_id IS DISTINCT FROM public.get_my_clinica_id() THEN
    RAISE EXCEPTION 'Sem permissão para gerar link do portal deste paciente'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Emissões interativas rotacionam o link; o trigger de resultado não.
  IF NOT v_chamada_trigger THEN
    UPDATE public.paciente_portal_tokens
       SET ativo = false
     WHERE paciente_id = p_paciente_id
       AND clinica_id IS NOT DISTINCT FROM v_clinica_id
       AND ativo = true;
  END IF;

  v_token_bruto := encode(extensions.gen_random_bytes(32), 'hex');
  INSERT INTO public.paciente_portal_tokens
    (paciente_id, clinica_id, token, ativo, expires_at)
  VALUES
    (p_paciente_id, v_clinica_id,
     encode(extensions.digest(v_token_bruto, 'sha256'), 'hex'),
     true, now() + interval '1 year');

  RETURN 'https://app.elolab.com.br/portal-paciente?token=' || v_token_bruto;
END;
$$;

REVOKE ALL ON FUNCTION public.link_portal_paciente(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_portal_paciente(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.link_portal_paciente(uuid) IS
  'Gera link do portal para paciente da clínica do usuário; sem usuário, só trigger, chamada interna sem JWT ou service_role. Persiste somente o hash.';

-- ─── 1b. platform_get_clinicas_saude ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.platform_get_clinicas_saude()
RETURNS TABLE (
  clinica_id                    uuid,
  clinica_nome                  text,
  criada_em                     timestamptz,
  assinatura_status             text,
  em_trial                      boolean,
  plano_nome                    text,
  suspensa                      boolean,
  arquivada                     boolean,
  ultima_atividade              timestamptz,
  ultima_atividade_ha_dias      integer,
  agendamentos_em_atendimento   integer,
  coletas_esquecidas            integer,
  exames_solicitados_ha_7d      integer,
  contas_a_receber_vencidas     integer,
  contas_a_receber_valor        numeric,
  total_pacientes               integer,
  total_agendamentos_no_mes     integer,
  audits_no_mes                 integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_papel_jwt text := COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    NULLIF(current_setting('request.jwt.claim.role', true), '')
  );
  v_papel_sessao text := NULLIF(NULLIF(current_setting('role', true), ''), 'none');
BEGIN
  -- Com usuário: precisa ser admin da plataforma. Sem usuário: só chamada
  -- interna sem JWT e sem SET ROLE (pg_cron via
  -- verificar_saude_clinicas_e_alertar) ou service_role. anon é recusado
  -- pelo JWT ou, se ele faltar, pelo papel da sessão.
  IF auth.uid() IS NOT NULL THEN
    IF NOT public.is_platform_admin() THEN
      RAISE EXCEPTION 'Só a dona do SaaS pode consultar a saúde das clínicas.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF COALESCE(v_papel_jwt, 'service_role') <> 'service_role'
     OR COALESCE(v_papel_sessao, 'service_role') <> 'service_role' THEN
    RAISE EXCEPTION 'Só a dona do SaaS pode consultar a saúde das clínicas.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  WITH ult_atividade AS (
    SELECT c.id AS clinica_id, GREATEST(
      COALESCE((SELECT MAX(a.timestamp)  FROM public.audit_log    a WHERE a.clinica_id = c.id), '1970-01-01'::timestamptz),
      COALESCE((SELECT MAX(a.updated_at) FROM public.agendamentos a WHERE a.clinica_id = c.id), '1970-01-01'::timestamptz),
      COALESCE((SELECT MAX(l.updated_at) FROM public.lancamentos  l WHERE l.clinica_id = c.id), '1970-01-01'::timestamptz)
    ) AS quando
    FROM public.clinicas c
  )
  SELECT
    c.id,
    c.nome,
    c.created_at,
    COALESCE(a.status, 'sem_assinatura')::text,
    COALESCE(a.status = 'trial', false),
    COALESCE(p.nome, ''),
    c.suspensa,
    COALESCE(c.arquivada, false),
    NULLIF(ua.quando, '1970-01-01'::timestamptz),
    CASE WHEN ua.quando > '1970-01-01'::timestamptz
         THEN EXTRACT(DAY FROM now() - ua.quando)::integer
         ELSE NULL END,
    (SELECT COUNT(*)::integer FROM public.agendamentos ag
      WHERE ag.clinica_id = c.id AND ag.status = 'em_atendimento'),
    (SELECT COUNT(*)::integer FROM public.fila_alertas_lab_esquecido f
      WHERE f.clinica_id = c.id),
    (SELECT COUNT(*)::integer FROM public.exames e
      WHERE e.clinica_id = c.id
        AND e.status = 'solicitado'
        AND e.created_at < now() - interval '7 days'),
    (SELECT COUNT(*)::integer FROM public.lancamentos l
      WHERE l.clinica_id = c.id
        AND l.tipo = 'receita'
        AND l.status = 'pendente'
        AND l.data_vencimento < CURRENT_DATE),
    COALESCE((SELECT SUM(l.valor - COALESCE(l.valor_pago, 0)) FROM public.lancamentos l
      WHERE l.clinica_id = c.id
        AND l.tipo = 'receita'
        AND l.status IN ('pendente','parcial','atrasado')
        AND l.data_vencimento < CURRENT_DATE), 0),
    (SELECT COUNT(*)::integer FROM public.pacientes pa WHERE pa.clinica_id = c.id),
    (SELECT COUNT(*)::integer FROM public.agendamentos ag
      WHERE ag.clinica_id = c.id AND ag.data >= date_trunc('month', CURRENT_DATE)),
    (SELECT COUNT(*)::integer FROM public.audit_log al
      WHERE al.clinica_id = c.id AND al.timestamp >= date_trunc('month', now()))
  FROM public.clinicas c
  LEFT JOIN LATERAL (
    SELECT ap.status, ap.plano_id FROM public.assinaturas_plano ap
     WHERE ap.user_id = c.owner_id
     ORDER BY ap.created_at DESC LIMIT 1
  ) a ON TRUE
  LEFT JOIN public.planos p ON p.id = a.plano_id
  LEFT JOIN ult_atividade ua ON ua.clinica_id = c.id
  ORDER BY ua.quando DESC NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_get_clinicas_saude() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_get_clinicas_saude() TO authenticated, service_role;

-- ─── 2. Revogação em massa com allowlist ────────────────────────────────────
DO $$
DECLARE
  -- Assinaturas exatas. Sobrecargas com outros argumentos NÃO entram.
  v_allowlist text[] := ARRAY[
    'public.validate_invite_code(text)',
    'public.validate_invitation_token(text)',
    'public.accept_employee_invitation(text,uuid)',
    'public.verificar_assinatura_prontuario(uuid)'
  ];
  v_permitidas oid[] := ARRAY[]::oid[];
  v_assinatura text;
  v_oid oid;
  r record;
  v_auth_antes boolean;
  v_service_antes boolean;
  v_revogadas integer := 0;
BEGIN
  FOREACH v_assinatura IN ARRAY v_allowlist LOOP
    v_oid := to_regprocedure(v_assinatura);
    IF v_oid IS NULL THEN
      RAISE NOTICE '[revogar-anon] função da allowlist não existe: %', v_assinatura;
    ELSE
      v_permitidas := array_append(v_permitidas, v_oid);
    END IF;
  END LOOP;

  FOR r IN
    SELECT p.oid, p.oid::regprocedure AS assinatura
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prosecdef
       AND p.prokind = 'f'
       -- Funções de extensão ficam com o dono da extensão.
       AND NOT EXISTS (
         SELECT 1 FROM pg_catalog.pg_depend d
          WHERE d.classid = 'pg_catalog.pg_proc'::regclass
            AND d.objid = p.oid
            AND d.deptype = 'e'
       )
  LOOP
    IF r.oid = ANY (v_permitidas) THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.assinatura);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role', r.assinatura);
      CONTINUE;
    END IF;

    -- Preserva exatamente o acesso efetivo atual de authenticated e
    -- service_role (funções restritas a service_role continuam restritas).
    v_auth_antes    := pg_catalog.has_function_privilege('authenticated', r.oid, 'EXECUTE');
    v_service_antes := pg_catalog.has_function_privilege('service_role',  r.oid, 'EXECUTE');

    IF pg_catalog.has_function_privilege('anon', r.oid, 'EXECUTE') THEN
      v_revogadas := v_revogadas + 1;
      RAISE NOTICE '[revogar-anon] revogado de anon: %', r.assinatura;
    END IF;

    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.assinatura);

    IF v_auth_antes
       AND NOT pg_catalog.has_function_privilege('authenticated', r.oid, 'EXECUTE') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.assinatura);
    END IF;
    IF v_service_antes
       AND NOT pg_catalog.has_function_privilege('service_role', r.oid, 'EXECUTE') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.assinatura);
    END IF;
  END LOOP;

  RAISE NOTICE '[revogar-anon] funções que deixaram de ser executáveis por anon: %', v_revogadas;
END $$;

-- ─── 2b. Funções de pg_cron: fora do alcance de anon e authenticated ────────
-- SEC-R1-05. São jobs de lote sem chamador autorizado: qualquer usuário logado
-- disparava efeitos em todas as clínicas (lembretes em massa, expiração de
-- ofertas e de trials). Nenhuma é chamada pelo frontend nem pelas edge
-- functions (busca em src/ e supabase/functions/: só aparecem em
-- src/integrations/supabase/types.ts). O dono continua executando (pg_cron
-- roda como dono do job); service_role fica para chamada manual.
-- Função nova de cron deve entrar nesta lista e repetir o REVOKE na própria
-- migration, porque o privilégio padrão do passo 3 concede a authenticated.
DO $$
DECLARE
  v_cron text[] := ARRAY[
    'public.verificar_saude_clinicas_e_alertar()',
    'public.watchdog_atendimento_travado()',
    'public.enfileirar_lembretes_retorno()',
    'public.expirar_ofertas_lista_espera()',
    'public.expire_trials()',
    'public.limpar_rate_limit_antigos()',
    'public.atualizar_predicoes_no_show()',
    'public.expirar_planos_pre_pagos()',
    'public.limpar_logs_antigos()'
  ];
  v_assinatura text;
  v_oid oid;
  v_usuario text;
BEGIN
  FOREACH v_assinatura IN ARRAY v_cron LOOP
    v_oid := to_regprocedure(v_assinatura);
    IF v_oid IS NULL THEN
      RAISE NOTICE '[revogar-anon] função de cron não existe: %', v_assinatura;
      CONTINUE;
    END IF;

    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_oid::regprocedure);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_oid::regprocedure);

    -- Se o job do pg_cron roda com um papel que não é o dono e só executava
    -- pela concessão a PUBLIC, devolve o acesso a esse papel.
    IF to_regclass('cron.job') IS NOT NULL THEN
      BEGIN
        FOR v_usuario IN
          EXECUTE 'SELECT DISTINCT j.username::text FROM cron.job j WHERE j.command ILIKE $1'
            USING '%' || (SELECT p.proname FROM pg_catalog.pg_proc p WHERE p.oid = v_oid) || '%'
        LOOP
          IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = v_usuario)
             AND v_usuario NOT IN ('anon', 'authenticated')
             AND NOT pg_catalog.has_function_privilege(v_usuario, v_oid, 'EXECUTE') THEN
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', v_oid::regprocedure, v_usuario);
            RAISE NOTICE '[revogar-anon] EXECUTE mantido para o papel do job do cron: % em %', v_usuario, v_assinatura;
          END IF;
        END LOOP;
      EXCEPTION WHEN insufficient_privilege THEN
        RAISE NOTICE '[revogar-anon] sem leitura de cron.job; conferir manualmente o papel dos jobs (consulta 8.1)';
      END;
    END IF;
  END LOOP;
END $$;

-- ─── 3. Privilégios padrão para funções futuras ─────────────────────────────
-- EXECUTE para PUBLIC é padrão global do Postgres: só sai sem IN SCHEMA.
-- O GRANT para anon vem do padrão por schema do Supabase: sai com IN SCHEMA.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO authenticated, service_role;

-- No self-hosted, o Studio pode criar objetos como supabase_admin. Só é
-- possível alterar os padrões desse papel se o papel atual for membro dele.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'supabase_admin')
     AND pg_catalog.pg_has_role(current_user, 'supabase_admin', 'MEMBER') THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC';
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon';
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated, service_role';
    RAISE NOTICE '[revogar-anon] privilégios padrão ajustados também para supabase_admin';
  ELSE
    RAISE NOTICE '[revogar-anon] supabase_admin não ajustado (papel atual: %). Rodar como supabase_admin se o Studio criar funções.', current_user;
  END IF;
END $$;

-- ─── 4. Verificação: nada fora da allowlist executável por anon ─────────────
DO $$
DECLARE
  v_sobrando text;
BEGIN
  SELECT string_agg(p.oid::regprocedure::text, ', ' ORDER BY 1)
    INTO v_sobrando
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prosecdef
     AND p.prokind = 'f'
     AND pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
     -- Comparação por OID: o texto de regprocedure varia com o search_path.
     AND p.oid <> ALL (ARRAY[
       COALESCE(to_regprocedure('public.validate_invite_code(text)')::oid, 0),
       COALESCE(to_regprocedure('public.validate_invitation_token(text)')::oid, 0),
       COALESCE(to_regprocedure('public.accept_employee_invitation(text,uuid)')::oid, 0),
       COALESCE(to_regprocedure('public.verificar_assinatura_prontuario(uuid)')::oid, 0)
     ]::oid[])
     AND NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_depend d
        WHERE d.classid = 'pg_catalog.pg_proc'::regclass
          AND d.objid = p.oid
          AND d.deptype = 'e'
     );

  IF v_sobrando IS NOT NULL THEN
    RAISE EXCEPTION 'Funções SECURITY DEFINER ainda executáveis por anon: %', v_sobrando;
  END IF;
END $$;

-- 4b. Funções de cron sem anon nem authenticated.
DO $$
DECLARE
  v_sobrando text;
BEGIN
  SELECT string_agg(f.oid::regprocedure::text, ', ')
    INTO v_sobrando
    FROM (
      SELECT to_regprocedure(s)::oid AS oid
        FROM unnest(ARRAY[
          'public.verificar_saude_clinicas_e_alertar()',
          'public.watchdog_atendimento_travado()',
          'public.enfileirar_lembretes_retorno()',
          'public.expirar_ofertas_lista_espera()',
          'public.expire_trials()',
          'public.limpar_rate_limit_antigos()',
          'public.atualizar_predicoes_no_show()',
          'public.expirar_planos_pre_pagos()',
          'public.limpar_logs_antigos()'
        ]) AS s
    ) f
   WHERE f.oid IS NOT NULL
     AND (pg_catalog.has_function_privilege('anon', f.oid, 'EXECUTE')
          OR pg_catalog.has_function_privilege('authenticated', f.oid, 'EXECUTE'));

  IF v_sobrando IS NOT NULL THEN
    RAISE EXCEPTION 'Funções de cron ainda executáveis por anon ou authenticated: %', v_sobrando;
  END IF;
END $$;

-- 4c. Policies alcançáveis por anon em tabelas lidas antes do login.
-- Postgres confere EXECUTE das funções da policy com o papel de quem consulta;
-- sem EXECUTE, o SELECT inteiro falha com 42501 (não devolve vazio). Por isso
-- nenhuma policy de SELECT que vale para anon (TO public ou TO anon) numa
-- tabela pública pode chamar função fora do alcance de anon.
-- Tabelas lidas por anon no frontend (rotas públicas de src/App.tsx:208-235):
--   public.planos  src/hooks/useSubscriptionPlan.ts:29 via src/pages/LandingPage.tsx
-- As demais telas públicas usam as RPCs da allowlist ou edge functions com
-- service_role. Tabela nova lida por anon entra nesta lista.
DO $$
DECLARE
  v_tabelas_publicas text[] := ARRAY['public.planos'];
  v_anon oid := (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'anon');
  v_quebradas text;
  v_afetadas text;
BEGIN
  SELECT string_agg(DISTINCT format('%s policy %I chama %s',
                      pol.polrelid::regclass, pol.polname, d.refobjid::regprocedure), '; ')
    INTO v_quebradas
    FROM pg_catalog.pg_policy pol
    JOIN pg_catalog.pg_depend d
      ON d.classid = 'pg_catalog.pg_policy'::regclass
     AND d.objid = pol.oid
     AND d.refclassid = 'pg_catalog.pg_proc'::regclass
   WHERE pol.polrelid = ANY (
           SELECT to_regclass(t)::oid FROM unnest(v_tabelas_publicas) AS t
            WHERE to_regclass(t) IS NOT NULL)
     AND pol.polcmd IN ('r', '*')
     AND (0::oid = ANY (pol.polroles) OR v_anon = ANY (pol.polroles))
     AND NOT pg_catalog.has_function_privilege('anon', d.refobjid, 'EXECUTE');

  IF v_quebradas IS NOT NULL THEN
    RAISE EXCEPTION 'Leitura anônima quebraria (42501) por policy que chama função sem EXECUTE para anon: %. Restringir a policy a authenticated ou reescrevê-la sem a função antes de aplicar.', v_quebradas;
  END IF;

  -- Informativo para o aviso de mudança: tabelas em que anon tem SELECT e
  -- uma policy de leitura que vale para anon chama função revogada. Nessas,
  -- uma consulta anônima passa a falhar com 42501 em vez de voltar vazia.
  SELECT string_agg(DISTINCT pol.polrelid::regclass::text, ', ')
    INTO v_afetadas
    FROM pg_catalog.pg_policy pol
    JOIN pg_catalog.pg_class c ON c.oid = pol.polrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_catalog.pg_depend d
      ON d.classid = 'pg_catalog.pg_policy'::regclass
     AND d.objid = pol.oid
     AND d.refclassid = 'pg_catalog.pg_proc'::regclass
   WHERE n.nspname = 'public'
     AND c.relrowsecurity
     AND pol.polcmd IN ('r', '*')
     AND (0::oid = ANY (pol.polroles) OR v_anon = ANY (pol.polroles))
     AND pg_catalog.has_table_privilege('anon', c.oid, 'SELECT')
     AND NOT pg_catalog.has_function_privilege('anon', d.refobjid, 'EXECUTE');

  RAISE NOTICE '[revogar-anon] tabelas em que SELECT anônimo passa a responder 42501 em vez de vazio: %',
    COALESCE(v_afetadas, '(nenhuma)');
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
