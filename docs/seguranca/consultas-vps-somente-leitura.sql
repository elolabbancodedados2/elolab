-- =============================================================================
-- EloLab: consultas SOMENTE LEITURA para a VPS (rodada 1 de segurança)
--
-- Autor: security-engineer, 27/10/2026. A interpretação de cada resultado está
-- em docs/seguranca/auditoria-rodada-1.md, com a mesma numeração de seções.
--
-- Garantias deste arquivo:
--   * Só SELECT em catálogos do Postgres e contagens. Nenhum INSERT, UPDATE,
--     DELETE, DDL, GRANT, REVOKE, objeto temporário ou chamada de RPC.
--   * A sessão é forçada a READ ONLY. Qualquer escrita acidental falha com
--     "cannot execute ... in a read-only transaction".
--   * Nenhuma consulta devolve dado de paciente, e-mail, token, segredo ou o
--     texto de jobs do pg_cron (que pode conter chaves). Só nomes de objetos,
--     ACLs e contagens.
--
-- Como rodar (sugestão; o responsável escolhe o meio):
--   psql "<URL do banco; não deixe a senha no histórico do shell>" -X \
--        -v ON_ERROR_STOP=0 -P pager=off \
--        -f docs/seguranca/consultas-vps-somente-leitura.sql \
--        > resultado-consultas-vps.txt 2>&1
--   - Rode com o papel `postgres`, que lê pg_catalog, auth e
--     supabase_migrations. Não use a service_role pelo PostgREST.
--   - ON_ERROR_STOP=0 é proposital: se um schema opcional (cron,
--     supabase_migrations) não existir, aquela consulta falha e as outras
--     seguem. Um erro deixa a transação abortada; por isso cada seção abre a
--     própria transação somente leitura.
--   - O SQL Editor do Studio mostra só o último resultado e não entende
--     `\echo`. Use psql.
--   - Antes de anexar o resultado ao repositório, confira que não há segredo
--     nem dado pessoal. Pelo desenho, não deveria haver.
-- =============================================================================

SET default_transaction_read_only = on;
SET statement_timeout = '60s';

-- -----------------------------------------------------------------------------
-- 0. Contexto da execução
-- -----------------------------------------------------------------------------
BEGIN TRANSACTION READ ONLY;
\echo '== 0. Contexto'
SELECT current_user                              AS papel,
       current_database()                        AS banco,
       version()                                 AS versao_postgres,
       now()                                     AS executado_em,
       current_setting('transaction_read_only')  AS somente_leitura;

-- 0.1 Papéis da API: nenhum deve ter BYPASSRLS nem ser superusuário
--     (service_role tem BYPASSRLS por desenho no Supabase).
\echo '== 0.1 Papeis da API'
SELECT rolname, rolsuper, rolbypassrls, rolinherit, rolcanlogin
  FROM pg_roles
 WHERE rolname IN ('anon', 'authenticated', 'service_role', 'authenticator')
 ORDER BY rolname;

-- 0.2 Configuração do papel authenticator (schemas expostos, se definidos aqui).
\echo '== 0.2 Configuracao do authenticator'
SELECT rolname, rolconfig
  FROM pg_roles
 WHERE rolname = 'authenticator';
COMMIT;

-- -----------------------------------------------------------------------------
-- 1. Funções executáveis por anon (CLIN-QA-001; 301, 303, 313 do relatório 03)
-- -----------------------------------------------------------------------------
BEGIN TRANSACTION READ ONLY;

-- 1.1 Todas as funções do schema public que anon pode executar.
--     Allowlist esperada pelas migrations: validate_invite_code,
--     validate_invitation_token, accept_employee_invitation,
--     verificar_assinatura_prontuario. Funções de extensão aparecem marcadas.
\echo '== 1.1 Funcoes de public executaveis por anon'
SELECT p.proname                                   AS funcao,
       pg_get_function_identity_arguments(p.oid)   AS argumentos,
       p.prosecdef                                 AS security_definer,
       p.prorettype::regtype                       AS retorno,
       pg_get_userbyid(p.proowner)                 AS dono,
       EXISTS (SELECT 1 FROM pg_depend d
                WHERE d.objid = p.oid AND d.deptype = 'e') AS de_extensao,
       p.proname IN ('validate_invite_code', 'validate_invitation_token',
                     'accept_employee_invitation', 'verificar_assinatura_prontuario')
                                                   AS na_allowlist
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.prokind = 'f'
   AND has_function_privilege('anon', p.oid, 'EXECUTE')
 ORDER BY p.prosecdef DESC, de_extensao, p.proname;

-- 1.2 Resumo numérico da 1.1 (é o número do aceite de CLIN-QA-001).
\echo '== 1.2 Resumo: SECURITY DEFINER executaveis por anon fora da allowlist'
SELECT count(*) FILTER (WHERE p.prosecdef)                         AS definer_anon_total,
       count(*) FILTER (WHERE p.prosecdef
                          AND p.prorettype <> 'trigger'::regtype
                          AND p.proname NOT IN ('validate_invite_code', 'validate_invitation_token',
                                                'accept_employee_invitation', 'verificar_assinatura_prontuario'))
                                                                   AS definer_anon_fora_allowlist,
       count(*) FILTER (WHERE NOT p.prosecdef)                     AS invoker_anon_total
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.prokind = 'f'
   AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
   AND has_function_privilege('anon', p.oid, 'EXECUTE');

-- 1.3 As funções citadas nos achados de acesso, uma a uma, com a ACL crua.
--     `anon=X/...` na ACL = grant explícito para anon.
--     Função ausente do resultado = não existe na VPS (drift).
\echo '== 1.3 Funcoes dos achados de acesso'
SELECT p.proname                                   AS funcao,
       pg_get_function_identity_arguments(p.oid)   AS argumentos,
       p.prosecdef                                 AS security_definer,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon_executa,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_executa,
       p.proacl                                    AS acl,
       p.proconfig                                 AS config
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('link_portal_paciente',
                     'platform_get_clinicas_saude',
                     'verificar_saude_clinicas_e_alertar',
                     'watchdog_atendimento_travado',
                     'enfileirar_lembretes_retorno',
                     'expirar_ofertas_lista_espera',
                     'accept_employee_invitation',
                     'activate_public_registration',
                     'start_free_trial',
                     'validate_invitation_token',
                     'validate_invite_code',
                     'verificar_assinatura_prontuario',
                     'is_platform_admin')
 ORDER BY p.proname;

-- 1.4 Qual versão das duas funções do P0 está viva na VPS. Compara trechos do
--     corpo com as migrations do repositório, sem imprimir o corpo.
\echo '== 1.4 Versao viva das funcoes do P0'
SELECT p.proname AS funcao,
       md5(pg_get_functiondef(p.oid)) AS hash_definicao,
       CASE p.proname
         WHEN 'link_portal_paciente' THEN
           CASE
             WHEN pg_get_functiondef(p.oid) LIKE '%pg_trigger_depth()%'
              AND pg_get_functiondef(p.oid) LIKE '%get_my_clinica_id()%'
               THEN '20261011010000: confere a clinica, mas pula a checagem sem auth.uid()'
             WHEN pg_get_functiondef(p.oid) LIKE '%digest(%'
               THEN '20260817310000: hash do token, sem checagem de clinica'
             ELSE 'anterior a 20260817310000 ou divergente do repositorio'
           END
         WHEN 'platform_get_clinicas_saude' THEN
           CASE
             WHEN pg_get_functiondef(p.oid) LIKE '%auth.uid() IS NOT NULL AND NOT public.is_platform_admin()%'
               THEN '20260817240000: passa sem JWT'
             ELSE '20260817210000 ou divergente do repositorio'
           END
       END AS versao_inferida
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('link_portal_paciente', 'platform_get_clinicas_saude');

-- 1.5 SECURITY DEFINER sem search_path fixo (permite sequestro de objetos).
\echo '== 1.5 SECURITY DEFINER sem search_path'
SELECT p.proname AS funcao,
       pg_get_function_identity_arguments(p.oid) AS argumentos,
       p.proconfig AS config,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon_executa,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_executa
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE p.prosecdef
   AND n.nspname = 'public'
   AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}'::text[])) c
                    WHERE c LIKE 'search_path=%')
 ORDER BY p.proname;

-- 1.6 SECURITY DEFINER sem argumentos (perfil típico de cron/serviço) que
--     authenticated consegue chamar: qualquer usuário logado, de qualquer
--     clínica, dispara o efeito colateral.
\echo '== 1.6 SECURITY DEFINER sem argumentos executaveis por authenticated'
SELECT p.proname AS funcao,
       p.prorettype::regtype AS retorno,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_executa
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.prosecdef
   AND p.prokind = 'f'
   AND p.pronargs = 0
   AND p.prorettype <> 'trigger'::regtype
   AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
 ORDER BY p.proname;
COMMIT;

-- -----------------------------------------------------------------------------
-- 2. Privilégios padrão (causa raiz de CLIN-QA-001)
-- -----------------------------------------------------------------------------
BEGIN TRANSACTION READ ONLY;

-- 2.1 Default ACLs. Tipo: r = tabela, S = sequência, f = função, T = tipo.
--     Uma linha com dono postgres ou supabase_admin, schema public, tipo f e
--     `anon=X/...` significa: toda função nova criada por esse dono nasce
--     executável por anon.
\echo '== 2.1 pg_default_acl'
SELECT pg_get_userbyid(d.defaclrole)  AS dono_que_cria,
       coalesce(n.nspname, '(todos)') AS schema,
       d.defaclobjtype                AS tipo,
       d.defaclacl                    AS acl_padrao,
       array_to_string(d.defaclacl, ',') LIKE '%anon=%' AS concede_a_anon
  FROM pg_default_acl d
  LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
 ORDER BY 1, 2, 3;

-- 2.2 Donos das funções de public. Indica qual papel aplica as migrations e,
--     portanto, qual linha da 2.1 vale.
\echo '== 2.2 Donos das funcoes de public'
SELECT pg_get_userbyid(p.proowner)         AS dono,
       count(*)                            AS funcoes,
       count(*) FILTER (WHERE p.prosecdef) AS security_definer
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
 GROUP BY 1
 ORDER BY 2 DESC;

-- 2.3 Funções de public que o pseudo-papel PUBLIC executa (ACL nula ou com
--     `=X/`). Complementa a 2.1.
\echo '== 2.3 Funcoes de public executaveis por PUBLIC'
SELECT count(*) AS funcoes_com_execute_para_public
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
   AND (p.proacl IS NULL OR array_to_string(p.proacl, ',') ~ '(^|,)=X');
COMMIT;

-- -----------------------------------------------------------------------------
-- 3. Tabelas, views e RLS (CLIN-QA-002 / 305)
-- -----------------------------------------------------------------------------
BEGIN TRANSACTION READ ONLY;

-- 3.1 Tabelas de public sem RLS ativo e o que anon/authenticated podem fazer.
\echo '== 3.1 Tabelas de public sem RLS'
SELECT c.relname AS tabela,
       has_table_privilege('anon', c.oid, 'SELECT')          AS anon_select,
       has_table_privilege('anon', c.oid, 'INSERT')          AS anon_insert,
       has_table_privilege('authenticated', c.oid, 'SELECT') AS auth_select,
       has_table_privilege('authenticated', c.oid, 'UPDATE') AS auth_update
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public'
   AND c.relkind IN ('r', 'p')
   AND NOT c.relrowsecurity
 ORDER BY 1;

-- 3.2 Views de public SEM security_invoker que anon ou authenticated leem.
--     Essas views rodam com o dono e ignoram o RLS das tabelas de base.
\echo '== 3.2 Views sem security_invoker'
SELECT c.relname AS view,
       c.relkind AS tipo,
       c.reloptions AS opcoes,
       has_table_privilege('anon', c.oid, 'SELECT')          AS anon_select,
       has_table_privilege('authenticated', c.oid, 'SELECT') AS auth_select
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public'
   AND c.relkind IN ('v', 'm')
   AND NOT coalesce(c.reloptions && ARRAY['security_invoker=true', 'security_invoker=on'], false)
   AND (has_table_privilege('anon', c.oid, 'SELECT')
        OR has_table_privilege('authenticated', c.oid, 'SELECT'))
 ORDER BY 1;

-- 3.3 Tabelas com RLS ativo e nenhuma policy (negam tudo a anon e
--     authenticated; pode ser intencional ou tela quebrada).
\echo '== 3.3 RLS ativo sem policy'
SELECT c.relname AS tabela
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public'
   AND c.relkind IN ('r', 'p')
   AND c.relrowsecurity
   AND NOT EXISTS (SELECT 1 FROM pg_policy pol WHERE pol.polrelid = c.oid)
 ORDER BY 1;

-- 3.4 Quantas tabelas de public anon alcança por GRANT (o RLS fica como a
--     única barreira). Informativo; cruzar com a seção 4.
\echo '== 3.4 Tabelas com privilegio para anon (contagem)'
SELECT count(*) FILTER (WHERE has_table_privilege('anon', c.oid, 'SELECT')) AS anon_select,
       count(*) FILTER (WHERE has_table_privilege('anon', c.oid, 'INSERT')) AS anon_insert,
       count(*) FILTER (WHERE has_table_privilege('anon', c.oid, 'UPDATE')) AS anon_update,
       count(*) FILTER (WHERE has_table_privilege('anon', c.oid, 'DELETE')) AS anon_delete,
       count(*)                                                             AS tabelas_public
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public'
   AND c.relkind IN ('r', 'p');
COMMIT;

-- -----------------------------------------------------------------------------
-- 4. Policies permissivas (CLIN-QA-305; seção 1 do relatório 03)
-- -----------------------------------------------------------------------------
BEGIN TRANSACTION READ ONLY;

-- 4.1 USING (true), WITH CHECK (true) ou alvo anon, em public e storage.
--     Esperado pelas migrations: cid10, plataforma_estado, planos (ativo = true)
--     e as policies de bloqueio `USING (false)` para anon.
\echo '== 4.1 Policies com true ou para anon'
SELECT schemaname, tablename, policyname, permissive, roles, cmd,
       qual       AS using_expr,
       with_check AS check_expr
  FROM pg_policies
 WHERE schemaname IN ('public', 'storage')
   AND (qual = 'true' OR with_check = 'true' OR 'anon' = ANY (roles))
 ORDER BY schemaname, tablename, policyname;

-- 4.2 Policies para o papel PUBLIC (cláusula TO omitida) que valem também para
--     anon e não citam auth.*, clínica nem papel. Revisar uma a uma.
\echo '== 4.2 Policies TO public sem referencia a auth, clinica ou papel'
SELECT schemaname, tablename, policyname, cmd,
       qual       AS using_expr,
       with_check AS check_expr
  FROM pg_policies
 WHERE schemaname IN ('public', 'storage')
   AND 'public' = ANY (roles)
   AND coalesce(qual, '') || ' ' || coalesce(with_check, '') !~*
       '(auth\.|clinica|is_admin|is_medico|is_platform_admin|has_role|has_any_role|can_access|can_manage|service_role|false)'
 ORDER BY schemaname, tablename, policyname;

-- 4.3 Policies que aceitam clinica_id nulo (linhas órfãs; observação sobre
--     encaminhamentos e coletas_laboratorio no relatório 03).
\echo '== 4.3 Policies que aceitam clinica_id IS NULL'
SELECT tablename, policyname, cmd,
       qual       AS using_expr,
       with_check AS check_expr
  FROM pg_policies
 WHERE schemaname = 'public'
   AND coalesce(qual, '') || ' ' || coalesce(with_check, '') ILIKE '%clinica_id IS NULL%'
 ORDER BY tablename, policyname;

-- 4.4 Buckets do Storage marcados como públicos (arquivo acessível por URL sem
--     login).
\echo '== 4.4 Buckets do Storage'
SELECT id, public, file_size_limit
  FROM storage.buckets
 ORDER BY public DESC, id;
COMMIT;

-- -----------------------------------------------------------------------------
-- 5. MFA (CLIN-QA-007; 304 do relatório 03)
-- -----------------------------------------------------------------------------
BEGIN TRANSACTION READ ONLY;

-- 5.1 Alguma policy ou função de public lê o nível aal? Esperado hoje: 0 linhas.
\echo '== 5.1 Regras que leem aal'
SELECT 'policy' AS tipo,
       schemaname || '.' || tablename || ' / ' || policyname AS objeto
  FROM pg_policies
 WHERE coalesce(qual, '') || ' ' || coalesce(with_check, '') ILIKE '%aal%'
UNION ALL
SELECT 'funcao', n.nspname || '.' || p.proname
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.prosrc ILIKE '%''aal''%';

-- 5.2 Cobertura de MFA nos perfis sensíveis. Só contagens, sem identificar
--     ninguém.
\echo '== 5.2 Cobertura de MFA (contagens)'
WITH com_fator AS (
  SELECT DISTINCT user_id FROM auth.mfa_factors WHERE status = 'verified'
)
SELECT 'platform_admins ativos' AS grupo,
       count(*) AS usuarios,
       count(*) FILTER (WHERE pa.user_id IN (SELECT user_id FROM com_fator)) AS com_mfa
  FROM public.platform_admins pa
 WHERE pa.ativo
UNION ALL
SELECT 'papel ' || ur.role::text,
       count(DISTINCT ur.user_id),
       count(DISTINCT ur.user_id) FILTER (WHERE ur.user_id IN (SELECT user_id FROM com_fator))
  FROM public.user_roles ur
 WHERE ur.role::text IN ('admin', 'financeiro')
 GROUP BY ur.role;
COMMIT;

-- -----------------------------------------------------------------------------
-- 6. Portal do paciente (CLIN-QA-001; 319 do relatório 03)
-- -----------------------------------------------------------------------------
BEGIN TRANSACTION READ ONLY;

-- 6.1 Tokens ativos e quantos fogem do formato de hash SHA-256 (legado em texto
--     puro, ainda aceito pelo fallback de patient-portal). Só contagens.
\echo '== 6.1 Tokens do portal (contagens)'
SELECT count(*) FILTER (WHERE ativo AND (expires_at IS NULL OR expires_at > now())) AS ativos_validos,
       count(*) FILTER (WHERE ativo AND (expires_at IS NULL OR expires_at > now())
                          AND token !~ '^[0-9a-f]{64}$')                         AS ativos_fora_do_formato_hash,
       count(*) FILTER (WHERE ativo AND expires_at IS NULL)                      AS ativos_sem_expiracao,
       count(*) FILTER (WHERE clinica_id IS NULL)                                AS sem_clinica
  FROM public.paciente_portal_tokens;

-- 6.2 Tokens cujo clinica_id difere da clínica do paciente. Esperado: 0.
\echo '== 6.2 Tokens com clinica divergente do paciente'
SELECT count(*) AS tokens_com_clinica_divergente
  FROM public.paciente_portal_tokens t
  JOIN public.pacientes p ON p.id = t.paciente_id
 WHERE t.clinica_id IS DISTINCT FROM p.clinica_id;
COMMIT;

-- -----------------------------------------------------------------------------
-- 7. Realtime
-- -----------------------------------------------------------------------------
BEGIN TRANSACTION READ ONLY;
\echo '== 7.1 Tabelas publicadas no Realtime e RLS'
SELECT pt.schemaname, pt.tablename, c.relrowsecurity AS rls_ativo
  FROM pg_publication_tables pt
  JOIN pg_namespace n ON n.nspname = pt.schemaname
  JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = pt.tablename
 WHERE pt.pubname = 'supabase_realtime'
 ORDER BY 1, 2;
COMMIT;

-- -----------------------------------------------------------------------------
-- 8. pg_cron (sem o texto do comando, que pode conter chaves)
-- -----------------------------------------------------------------------------
BEGIN TRANSACTION READ ONLY;
\echo '== 8.1 Jobs do pg_cron (falha se a extensao nao existir)'
SELECT jobid, jobname, schedule, active, username
  FROM cron.job
 ORDER BY jobid;
COMMIT;

-- -----------------------------------------------------------------------------
-- 9. Migrations aplicadas vs repositório (CLIN-QA-006; 318 do relatório 03)
-- -----------------------------------------------------------------------------
BEGIN TRANSACTION READ ONLY;

-- 9.1 A tabela de histórico do CLI existe? NULL = as migrations foram aplicadas
--     fora do CLI, e a 9.2 e a 9.3 falham (esperado; registre isso).
\echo '== 9.1 Tabela de historico de migrations'
SELECT to_regclass('supabase_migrations.schema_migrations') AS tabela_historico;
COMMIT;

BEGIN TRANSACTION READ ONLY;
-- 9.2 Diferença entre o histórico da VPS e o repositório.
--     A lista `repo` é um retrato de supabase/migrations em 27/10/2026, no
--     worktree admin-finance-realtime: 456 arquivos e 455 versões distintas
--     (20261010198000 aparece em dois arquivos). Inclui 6 arquivos ainda não
--     commitados: 20261021120000, 20261021130000, 20261027120000,
--     20261027130000, 20261028090000 e 20261028100000. Se o repositório
--     mudar, gere a lista de novo antes de rodar.
--     situacao:
--       so_no_repositorio = migration escrita e não registrada na VPS
--       so_na_vps         = registrada na VPS e ausente do repositório
\echo '== 9.2 Migrations: diferencas entre VPS e repositorio'
WITH repo(versao, nome) AS (
  VALUES
      ('20260131002504', 'e20769f5-bf0b-4c5e-a3fe-55329ac9ecc4')
    , ('20260131002549', '38d940ba-6d0d-41b9-8d62-7a109c9a3841')
    , ('20260131002620', '052a665a-51da-4fb7-b696-4af16fb1b121')
    , ('20260131002709', 'd7fd94db-ba88-4177-a070-8250a28e38dd')
    , ('20260131005432', 'c0791b44-ebc0-42e2-bb83-8b3d70e4fee0')
    , ('20260131014446', '99ca0a50-be04-4b0b-8b96-b2b12b9610a8')
    , ('20260131014503', 'c2cf8369-e98f-4ba6-84eb-7c059dc1ef36')
    , ('20260131022551', '743b4c30-c0f8-43d3-88ec-9fa83390506f')
    , ('20260131022611', 'f87bc82b-880a-4796-b76c-f44ecce85525')
    , ('20260131023100', '640d13b1-9979-4742-bb0b-8e4e8b4f9278')
    , ('20260205172054', '2587ddb9-5d98-44fb-bd74-3eaeedbfae37')
    , ('20260205172117', '264ce3f9-f57c-42f0-8047-e9dda0053f48')
    , ('20260205173252', '6f370702-fcc1-4c6c-b1aa-13b0d3ab73cf')
    , ('20260206011031', 'cb3722b7-f954-49d8-bcd0-603a2d820ee2')
    , ('20260206014645', '0ec17efb-d2fc-4ade-982b-660e17a9be5b')
    , ('20260206034018', '96bd559d-c915-4cc3-a04d-7154dd0296f8')
    , ('20260206185404', 'd05a2691-f827-4e12-98cd-08acc9d4a585')
    , ('20260303164042', '1b53df84-0689-4f81-873c-d54ffc5e5d5e')
    , ('20260303164103', '1be6ce83-cff4-4ff0-bf2e-dec67531b2ac')
    , ('20260303170248', '6ffb3aa5-0586-4c24-9e85-5688d5d71c0e')
    , ('20260303170747', 'a9705902-7cb7-4dbc-8427-e304ae961b32')
    , ('20260303182322', '03b75b7a-7cbb-46ea-89cb-1114a54fc488')
    , ('20260303182346', '8e74f012-dbf6-43a9-93ce-5edbc004dbc8')
    , ('20260303182837', 'cb92017d-2cc3-40ec-a0d3-d2f285a67c85')
    , ('20260303205606', 'c04525cf-b4d0-49ac-8a0e-f8af5c4f36e3')
    , ('20260303205655', 'f8ff91d7-f02a-4886-a53a-991e71b97670')
    , ('20260303211636', '04bdd42d-116c-4a4e-b613-772375eccaa7')
    , ('20260303211712', '79a93d67-655d-4761-acb6-a23041563a59')
    , ('20260303211740', 'a4951f2d-ae32-4b83-a54a-2d9839dec140')
    , ('20260303212553', 'afb60e8f-8cff-43d7-b7e2-1fe6e1c0b243')
    , ('20260303213846', 'dba5f784-5daf-42d3-808f-1d08acd25111')
    , ('20260303220028', 'da0760bf-dccb-470c-aeb8-f311bb5f68ba')
    , ('20260314004638', '6bd39e3b-3fda-481c-bc57-54559777ad24')
    , ('20260314004654', 'b13dddc3-b8fc-4c1b-b94b-aa2f0ebcf93a')
    , ('20260314182012', 'fb994194-5ddd-4577-9270-d1bab9f79b33')
    , ('20260314184928', '468d9f24-3b32-422f-8c3b-660f1199dd7a')
    , ('20260314184948', '770a0f97-fcdf-4889-8d3c-df79861d9c90')
    , ('20260314220000', 'chat_interno_elolab')
    , ('20260314230001', 'feedbacks_nps')
    , ('20260315212446', '1112cee7-4697-4bb3-b6ed-52c6a865acf7')
    , ('20260315214458', '8d06ad00-1497-45c6-b90b-c6ebc94b6e03')
    , ('20260315215735', '2ad7af0f-d6ed-4723-bf41-c435b331b92a')
    , ('20260315220233', 'ec59b12e-2c25-46a6-9e94-1f5a1c22f5c7')
    , ('20260315222957', '91781f0a-4dc7-4d98-9f80-44c5b8ca0f4e')
    , ('20260315223526', '943b9bc8-9b51-4d73-9631-3393bf709d44')
    , ('20260315223749', 'fcc67c17-7d52-4c63-aef1-d85490ecbbaf')
    , ('20260315224100', 'e07f8d74-461e-41de-a227-727a8fa90464')
    , ('20260315224352', 'c27affe7-1c0c-4f36-bc43-37cb3a303c84')
    , ('20260315224607', 'aa99cbd0-016e-464b-b042-d3ed3702b8d9')
    , ('20260315224838', '6ab3c31d-bc2c-424c-9d8d-5597214fe0fa')
    , ('20260316020502', '5ea6a910-041d-49a1-a3c9-5524531af44a')
    , ('20260318015218', 'cc90bec4-9c83-4145-b020-f6df2efa7a35')
    , ('20260318031429', '58a8829a-64b0-4512-9425-c21106773f52')
    , ('20260318192900', 'e8ca6376-7daf-475a-b7ab-b86dbb968297')
    , ('20260318193349', '337232bc-da9d-4b83-9b50-56659cddc009')
    , ('20260319124029', '3c6c8bb5-1dc8-4982-8b3c-b1068a1cd72c')
    , ('20260319124630', 'df8c3ac2-2cca-4a4a-ae98-9f0d814ea37a')
    , ('20260319135438', 'a014baf9-bf9c-4030-bd30-130ee254fd33')
    , ('20260319144225', '3d9f42db-7849-4a43-9453-e5cc495106c2')
    , ('20260319235635', 'f53577aa-86e9-442b-b65b-6d59875ed3b3')
    , ('20260319235711', '7b13b710-5e62-4b2f-b401-3f93f1dc9ca0')
    , ('20260320000025', '33c983ec-bdf9-4178-959f-66017e262778')
    , ('20260320000056', 'f7d6e509-9263-4777-b2a2-2c7795b697b6')
    , ('20260320003843', '93747982-4620-4f18-912b-6e46b2c5007a')
    , ('20260320020828', 'fc8d9e8a-5307-4508-ab56-4cd63676ddfe')
    , ('20260321012844', '66decb2c-f8bb-4bc9-94ef-5773a3db99f8')
    , ('20260321012953', '05864ba4-2450-4289-999e-8db2fe923393')
    , ('20260321013128', '7851ace3-d778-4bf7-a4fa-4ec91d74d6ed')
    , ('20260321013210', '85b90041-07fb-4c51-99d6-bfb0cd2b1a59')
    , ('20260321014104', 'd3fb0b2b-fcec-4e68-a820-4f613fe87a6e')
    , ('20260321015432', '3787dfc7-1a87-4a56-9983-0fcea01d0cd2')
    , ('20260321215038', '4f646ae1-82dc-456b-9e3e-87ae3d0d8e97')
    , ('20260321215552', '8b62661d-786b-44cf-8cfd-0f7b6d8515f0')
    , ('20260321220028', '5492dbbe-2f71-4932-b9f1-544e30e419eb')
    , ('20260321231823', '87584545-e205-47c1-9f95-ec23a41e2d08')
    , ('20260322203714', '6c6ab0b2-d9d2-46f8-96b8-40af8db96d6d')
    , ('20260322224321', '1c11eaa3-314f-4e2b-92ea-bd61f403f3af')
    , ('20260322224450', '5502d180-be5a-433c-9ff5-4a4c23ab9acf')
    , ('20260322225324', '0ccd5038-eb9d-4a49-a87d-66d39aedf2c9')
    , ('20260322225518', '87972a2c-5631-4c21-94e6-8f12706e89c5')
    , ('20260322225539', '1255dc6f-244d-4e34-825a-d52a9a93d92e')
    , ('20260322225655', '4065a41b-9668-43f5-9dfb-42493ae182bb')
    , ('20260322225841', '7228c151-299c-46ee-9022-77053d4f950f')
    , ('20260322225957', '2e6ce57c-5ecf-420a-9b59-e062a033d2d5')
    , ('20260323015820', '9127d843-7bc7-4f2d-b861-c64a097e769d')
    , ('20260323020619', '78879b7a-e454-4098-b285-9bc634670463')
    , ('20260409134255', '5ab4b19b-38f3-443e-91da-c6fc5cc1def3')
    , ('20260409141959', '403ea3ac-f667-458f-8420-052386684437')
    , ('20260409144310', '7816f99f-1ad9-43fa-b27e-3b85c75b6269')
    , ('20260409214359', '643743a1-3f97-4369-8436-13ea0a5f352d')
    , ('20260409214430', 'c064e3d7-c866-47ee-bb84-77dfaf091b75')
    , ('20260410210231', '53967e18-a35b-4fff-890f-e9860cf74633')
    , ('20260413000001', 'medico_disponibilidade')
    , ('20260413000002', 'email_templates_production')
    , ('20260413222424', 'add_notification_templates')
    , ('20260413223725', 'caixa_diario_complete')
    , ('20260413225100', 'add_exam_pricing')
    , ('20260414000001', 'add_all_workflows')
    , ('20260414001917', 'enhance_webhook_logs')
    , ('20260414120000', 'add_reproductive_health_fields')
    , ('20260414130000', 'add_mfa_fields')
    , ('20260414140000', 'add_lgpd_compliance_tables')
    , ('20260414150000', 'add_cid10_diagnosis_system')
    , ('20260414160000', 'add_referral_system')
    , ('20260414170000', 'add_advanced_config_tables')
    , ('20260414190857', '89e73e8f-3dcc-4d89-b9f1-a2c546f4980b')
    , ('20260414190928', '286ea5aa-2de5-4fe8-a301-43f7646b189f')
    , ('20260414225021', 'be31961b-ca6f-4eaf-ad7d-f1597ccd25a8')
    , ('20260414225826', '66d1d373-6cb5-4f40-a71f-42dd86139d71')
    , ('20260414231038', '1044c857-a2fd-4ca0-ba28-f14ad436d918')
    , ('20260414231649', '47464b73-f597-4928-b3b5-b4980d1f4075')
    , ('20260414232523', 'd0f2d9a2-d37b-48c3-b7e9-cdf3b1e357b8')
    , ('20260414234615', '40cb4ba8-7705-4ac6-b124-5c3adc37dbc4')
    , ('20260415023949', '6c45e302-7fbb-4c75-b039-0af8a859a418')
    , ('20260415024032', 'f5986068-7630-4da1-9125-9637c66ef886')
    , ('20260415132402', '89ad5e7c-c256-42e2-90c7-48bab08535ff')
    , ('20260415202457', '9d8716d2-f14b-4ab0-9299-e26be748deac')
    , ('20260415210943', '398514d5-26dd-497e-aa12-aec4e487ed70')
    , ('20260415212619', '003f2bb4-cb15-46a3-b53e-316d415924f7')
    , ('20260423191101', '5522a674-c3c7-4b84-b69a-c40a96fc8473')
    , ('20260423191123', '6f158df1-5024-488e-b06d-e5a1d9a2ebf3')
    , ('20260423191323', 'e90663e9-37b5-4489-8586-e9e329236e06')
    , ('20260423191445', '9d59f1b6-d972-4123-aa4a-bcd8fd79968c')
    , ('20260423192112', 'd7abe43c-8ae0-4b9c-a64c-8246eb5e08cf')
    , ('20260507011432', '15fdd274-c714-4b45-b52e-73edbff62513')
    , ('20260507011617', '5fcaef0c-e7f1-48f5-9592-b4a0b2df961f')
    , ('20260507011814', '10751c10-4bca-4496-82e7-a03923cc301f')
    , ('20260507014233', '7b107413-70c6-4a9d-bb99-15551613239f')
    , ('20260507014519', '0694aa82-4dd7-4fa3-b153-4b6d715160dd')
    , ('20260507171108', '698c8997-5934-4953-bc2d-d3a455968400')
    , ('20260508031146', '19e27119-37f0-4ea8-8fa5-65f465e5f3ec')
    , ('20260508172810', '6e93f396-dcd6-41f1-bbb5-101bbbccc7f1')
    , ('20260508175643', 'b4dbd6eb-0c65-4f4c-baea-429c9987c41c')
    , ('20260509004646', '0420624c-643d-4f3e-afd8-99671f431dab')
    , ('20260509192215', '9cf037df-2313-4c3f-8e06-9cb6c6083948')
    , ('20260509192638', 'dcab0856-488d-4d81-9c8c-540961d684f1')
    , ('20260522163342', '4375d647-d8be-4414-91c6-1d1623017749')
    , ('20260522164857', 'a6b4131b-8db1-4001-ae92-6a826a8b31a7')
    , ('20260522165416', 'ab9bff70-2638-4c03-9306-79a64cbd32ea')
    , ('20260522171216', 'def6af16-0ae1-4b40-bcb5-d409997e411c')
    , ('20260522172845', 'b17b8904-f50a-4123-89eb-c218f34e6ee4')
    , ('20260522173641', 'ce3bce89-0edd-4e54-8048-362eae749cf5')
    , ('20260727184101', '71a86c2b-91ae-4d8b-912a-94de4952c5f7')
    , ('20260727230000', 'security_fixes_c1_c4')
    , ('20260727234500', 'c5_paywall_servidor')
    , ('20260727235000', 'cron_segredo_proprio')
    , ('20260728010000', 'lancamentos_valor_recebido')
    , ('20260728020000', 'baixa_estoque_idempotente')
    , ('20260728034201', '3d0de952-aec6-409d-a5cf-0cdbfc38007b')
    , ('20260728040111', '39f3f2fc-8036-4aa2-9e53-9464428b9208')
    , ('20260728041647', 'a174d0f5-b701-450f-843c-40042bcfdf1a')
    , ('20260728041952', '5d6b9a3c-40df-4f3d-b0f4-3d0a02ae1bd4')
    , ('20260728101043', 'd945f5e4-d93f-4ec3-b5f5-1a620bebc1c7')
    , ('20260728120000', 'corrige_politicas_storage_e_convite')
    , ('20260728140000', 'agenda_sem_dupla_marcacao')
    , ('20260728150000', 'patient_photos_privado')
    , ('20260728160000', 'tv_panel_media_por_clinica')
    , ('20260728170000', 'triagem_altura_em_cm')
    , ('20260728180000', 'alinha_checks_com_o_app')
    , ('20260729003818', 'e62b4271-db7d-4e1f-8e09-75c7387be314')
    , ('20260729120000', 'user_roles_vazamento_entre_clinicas')
    , ('20260729123000', 'remove_politicas_frouxas_duplicadas')
    , ('20260729130000', 'indices_chaves_estrangeiras')
    , ('20260729140000', 'tabelas_lgpd_de_verdade')
    , ('20260729150000', 'tabelas_e_campos_que_o_app_usa')
    , ('20260729160000', 'cron_segredo_nos_tres_restantes')
    , ('20260729170000', 'cron_devolve_authorization')
    , ('20260729180000', 'convite_funcao_ambigua')
    , ('20260730020000', 'comorbidades_recepcao_pode_gravar')
    , ('20260730030000', 'medico_pode_dar_baixa_no_estoque')
    , ('20260730040000', 'enfermagem_pode_cadastrar_paciente')
    , ('20260730050000', 'pagina_de_precos_quebrada_para_visitante')
    , ('20260730060000', 'carencia_maior_no_bloqueio')
    , ('20260730070000', 'automacoes_ligadas_por_padrao')
    , ('20260730080000', 'crm_da_plataforma')
    , ('20260730090000', 'vincula_fichas_orfas')
    , ('20260801160000', 'auditoria_de_acoes_do_dono')
    , ('20260801161000', 'encerrar_sessoes')
    , ('20260801162000', 'auditoria_registra_acao_pedida')
    , ('20260801163000', 'situacao_real_das_contas')
    , ('20260801170000', 'vencimento_alcanca_a_clinica_inteira')
    , ('20260801200000', 'backup_de_verdade_e_bucket_fechado')
    , ('20260801210000', 'alarme_de_queda_e_retencao_de_log')
    , ('20260801220000', 'modo_manutencao')
    , ('20260812120000', 'prescricoes_do_prontuario_em_transacao')
    , ('20260812130000', 'um_faturamento_por_agendamento')
    , ('20260812140000', 'isola_convites_e_fecha_pagamento')
    , ('20260812150000', 'assinatura_plataforma_segura')
    , ('20260812160000', 'laudo_so_sai_depois_da_conferencia')
    , ('20260813100000', 'preenche_clinica_nos_fluxos')
    , ('20260813110000', 'isola_automation_settings')
    , ('20260813120000', 'faturamento_unico_tambem_sem_clinica')
    , ('20260814120000', 'template_de_aniversario')
    , ('20260814130000', 'automacoes_estado_explicito')
    , ('20260814140000', 'baixa_estoque_atomica')
    , ('20260814150000', 'liberacao_laudos_atomica')
    , ('20260814160000', 'prescricoes_clinica_obrigatoria')
    , ('20260814170000', 'estados_do_fluxo_de_pagamento')
    , ('20260814180000', 'conta_com_itens_e_pagamentos')
    , ('20260814190000', 'permite_pagamento_parcial')
    , ('20260814200000', 'rpc_registrar_pagamento')
    , ('20260814210000', 'trava_pagamento_antes_da_consulta')
    , ('20260814220000', 'item_lancado_no_atendimento')
    , ('20260814230000', 'voltar_para_atendimento_nao_pede_pagamento')
    , ('20260814240000', 'conta_antiga_ganha_item_antes_do_adicional')
    , ('20260814250000', 'triagem_entre_o_pagamento_e_a_fila')
    , ('20260815120000', 'pagamento_antes_da_consulta_para_todos')
    , ('20260815130000', 'impersonacao_da_dona_do_saas_funciona')
    , ('20260815140000', 'ordem_de_restauracao_do_backup')
    , ('20260815150000', 'cpf_unico_por_clinica_e_sem_mascara')
    , ('20260815160000', 'insercao_nao_pode_apontar_para_outra_clinica')
    , ('20260815170000', 'convite_vencido_para_de_dizer_que_esta_pendente')
    , ('20260815180000', 'arquivar_clinica_e_excluir_a_vazia')
    , ('20260815190000', 'bucket_para_os_arquivos_do_backup')
    , ('20260815200000', 'backup_diario_em_vez_de_semanal')
    , ('20260815210000', 'convidado_que_se_cadastra_direto_nao_cria_clinica')
    , ('20260815220000', 'funcionario_sempre_com_clinica')
    , ('20260815230000', 'estornar_pagamento')
    , ('20260815240000', 'estornar_o_ultimo_pagamento_zera_a_conta')
    , ('20260815250000', 'conferir_o_backup_todo_dia')
    , ('20260815260000', 'laudo_exige_resultado_e_diz_quem_lancou')
    , ('20260815270000', 'anexo_de_prontuario_escapava_da_clinica')
    , ('20260817120000', 'auditoria_universal_no_banco')
    , ('20260817130000', 'exame_realizado_exige_coleta')
    , ('20260817140000', 'token_de_guias_expira')
    , ('20260817150000', 'watchdog_de_atendimento_travado')
    , ('20260817160000', 'watchdog_de_coleta_esquecida')
    , ('20260817170000', 'cancelar_coletas_pendentes_em_lote')
    , ('20260817180000', 'notifica_laudo_por_whatsapp_tambem')
    , ('20260817190000', 'rate_limit_para_endpoints_publicos')
    , ('20260817200000', 'portal_do_paciente_com_link_no_email')
    , ('20260817210000', 'dashboard_de_saude_por_clinica')
    , ('20260817220000', 'templates_whatsapp_padrao')
    , ('20260817230000', 'alerta_de_saude_para_a_dona')
    , ('20260817240000', 'saude_permite_chamada_do_cron')
    , ('20260817250000', 'alerta_usa_notification_queue_pra_dedup')
    , ('20260817260000', 'finalizacao_atendimento_atomica')
    , ('20260817270000', 'corrige_ambiguidade_rpcs_atomicas')
    , ('20260817280000', 'prescricao_referencias_da_mesma_clinica')
    , ('20260817290000', 'fluxos_completos_faturamento_retorno_nps')
    , ('20260817291000', 'convenio_no_agendamento')
    , ('20260817292000', 'cancelamento_convoca_lista_espera')
    , ('20260817293000', 'aceite_atomico_lista_espera')
    , ('20260817294000', 'risco_no_show_baseado_em_historico')
    , ('20260817295000', 'fila_notificacoes_confiavel')
    , ('20260817300000', 'autorizacao_convenio_e_telemetria')
    , ('20260817310000', 'hash_tokens_portal_paciente')
    , ('20260817320000', 'whatsapp_webhook_idempotente')
    , ('20260818010000', 'inbox_whatsapp_operacional')
    , ('20260818020000', 'sla_primeira_resposta_real')
    , ('20260818030000', 'assinatura_prontuario_verificavel')
    , ('20260818040000', 'lotes_tiss_e_glosas')
    , ('20260818050000', 'repasses_medicos')
    , ('20260818060000', 'auditoria_interoperabilidade')
    , ('20260818070000', 'texto_banco_desconectado')
    , ('20260818080000', 'texto_supabase_nao_suportado')
    , ('20260818090000', 'desativa_modo_manutencao')
    , ('20260818100000', 'bloqueio_migracao_sql')
    , ('20260819020000', 'acompanhamento_migracao_sql')
    , ('20260819030000', 'auditoria_global_da_plataforma')
    , ('20260819040000', 'central_suporte')
    , ('20260819050000', 'governanca_ia')
    , ('20260819060000', 'comunicacao_global')
    , ('20260819070000', 'controle_operacional')
    , ('20260819080000', 'central_lgpd_plataforma')
    , ('20260819090000', 'central_logs_erros')
    , ('20260819100000', 'central_backups')
    , ('20260819110000', 'relatorio_executivo')
    , ('20260819120000', 'cobrancas_plataforma')
    , ('20260819130000', 'historico_financeiro_plataforma')
    , ('20260819140000', 'acesso_assistido')
    , ('20260819150000', 'integracoes_por_clinica')
    , ('20260819160000', 'central_filas_webhooks')
    , ('20260819170000', 'gestao_incidentes')
    , ('20260819180000', 'restauracao_controlada')
    , ('20260819190000', 'central_seguranca')
    , ('20260819200000', 'limites_consumo')
    , ('20260819210000', 'onboarding_clinicas')
    , ('20260819220000', 'dominios_entregabilidade')
    , ('20260819230000', 'relatorios_plataforma_agendados')
    , ('20260820010000', 'onboarding_guiado_clinica')
    , ('20260820020000', 'central_notificacoes_usuario')
    , ('20260820110000', 'busca_global_segura')
    , ('20260820115000', 'reparar_funcoes_admin_schema')
    , ('20260820130000', 'historico_pessoal_seguro')
    , ('20260820150000', 'preferencias_pessoais')
    , ('20260820190000', 'indicadores_produtividade')
    , ('20260820200000', 'feedback_in_app')
    , ('20260820201000', 'reparar_rate_limit_feedback')
    , ('20260820210000', 'treinamento_guiado')
    , ('20260823010000', 'corrigir_resolucao_preco_exame')
    , ('20260824010000', 'eventos_operacionais_integrados')
    , ('20260824020000', 'transicoes_atendimento_atomicas')
    , ('20260826010000', 'consulta_de_retorno_usa_preco_retorno')
    , ('20260831010000', 'repasse_medico_fixo_ou_percentual')
    , ('20260915090000', 'isola_retornos_por_clinica')
    , ('20260923100000', 'is_same_clinica_nunca_aceita_null')
    , ('20260923110000', 'pagar_adicional_fecha_o_atendimento')
    , ('20261001090000', 'configuracoes_da_clinica_compartilhadas')
    , ('20261001100000', 'remove_tipo_telemedicina')
    , ('20261001110000', 'integracoes_por_clinica_com_credencial')
    , ('20261001120000', 'checkin_prioridade_atomico')
    , ('20261001130000', 'busca_paciente_por_cpf_normalizado')
    , ('20261001140000', 'checkin_rollback_condicional')
    , ('20261001150000', 'pagamento_exige_caixa_aberto_e_idempotencia')
    , ('20261001160000', 'concluir_fila_atomico')
    , ('20261001170000', 'checkin_estado_cobranca')
    , ('20261001180000', 'verificar_pagamento_fila_sem_expor_financeiro')
    , ('20261001190000', 'finalizacao_confere_estado_atendimento')
    , ('20261001200000', 'caixa_diario_eventos_e_reabertura')
    , ('20261001210000', 'onboarding_requires_operational_readiness')
    , ('20261001220000', 'pagamento_trava_caixa_com_privilegio_minimo')
    , ('20261001230000', 'finalizar_ve_cobranca_mesmo_sem_acesso_financeiro')
    , ('20261001240000', 'pacientes_busca_por_digitos')
    , ('20261006130000', 'memed_receitas_digitais')
    , ('20261006140000', 'revoga_conta_de_desenvolvimento')
    , ('20261007100000', 'tarefas_vinculo_paciente')
    , ('20261007130000', 'agenda_relatorios_da_plataforma')
    , ('20261007140000', 'governanca_ia_consistente')
    , ('20261007150000', 'comunicacao_global_ciclo_de_vida')
    , ('20261007160000', 'usuarios_da_plataforma_seguro')
    , ('20261007170000', 'suporte_fluxo_de_resposta')
    , ('20261007180000', 'onboarding_responsavel_e_arquivo')
    , ('20261007181000', 'atualiza_papeis_de_funcionario_atomico')
    , ('20261007190000', 'central_seguranca_contexto')
    , ('20261007200000', 'preservar_historico_ao_excluir_paciente')
    , ('20261007210000', 'venda_pdv_baixa_estoque_atomica')
    , ('20261007220000', 'repasse_por_data_do_recebimento')
    , ('20261007230000', 'movimentacao_estoque_atomica')
    , ('20261007230500', 'abertura_incidente_com_historico')
    , ('20261007240000', 'ampliar_auditoria_de_seguranca')
    , ('20261007250000', 'preservar_dia_dos_relatorios_mensais')
    , ('20261007260000', 'auditar_comunicados_globais')
    , ('20261007270000', 'comunicados_sem_duplicatas_e_leitura_idempotente')
    , ('20261007280000', 'auditar_controles_operacionais')
    , ('20261007290000', 'ampliar_modo_somente_leitura')
    , ('20261007300000', 'corrigir_competencia_do_repasse')
    , ('20261007310000', 'registrar_retorno_financeiro_lote_tiss')
    , ('20261008090000', 'validar_coleta_com_autoria')
    , ('20261008095000', 'restaurar_historico_encaminhamento')
    , ('20261008100000', 'registrar_historico_encaminhamentos')
    , ('20261008110000', 'registrar_glosa_com_limite_atomico')
    , ('20261008120000', 'repasse_fixo_unico_por_atendimento')
    , ('20261008130000', 'cadastro_estoque_com_abertura_atomica')
    , ('20261008140000', 'preservar_historico_estoque')
    , ('20261008150000', 'agenda_libera_horarios_de_faltas')
    , ('20261008160000', 'proteger_historico_convenios')
    , ('20261008170000', 'janelas_de_indicadores_produtividade')
    , ('20261008180000', 'contar_notificacoes_enviadas_no_consumo')
    , ('20261008190000', 'contexto_humano_na_auditoria_plataforma')
    , ('20261008200000', 'auditar_decisoes_de_solicitacoes_lgpd')
    , ('20261008210000', 'auditar_revogacao_acesso_assistido')
    , ('20261008220000', 'excluir_assinaturas_vencidas_do_mrr')
    , ('20261008230000', 'alinhar_mrr_do_relatorio_executivo')
    , ('20261008240000', 'corrigir_prazos_e_clinicas_arquivadas_no_crm')
    , ('20261008250000', 'exibir_estado_completo_de_assinaturas')
    , ('20261008260000', 'exigir_contexto_no_bloqueio_de_onboarding')
    , ('20261008270000', 'precificar_exame_sem_correspondencia_ambigua')
    , ('20261008280000', 'permitir_correcao_retorno_lote_pago')
    , ('20261008290000', 'revogar_acesso_ao_inativar_funcionario')
    , ('20261008300000', 'validar_limites_do_estoque')
    , ('20261008310000', 'idempotencia_movimentacao_manual_estoque')
    , ('20261008320000', 'identificar_lote_de_pagamento')
    , ('20261008330000', 'salvamento_concorrente_de_configuracoes')
    , ('20261008340000', 'remover_item_fila_atomico')
    , ('20261008350000', 'registrar_saida_de_repasse_medico')
    , ('20261008360000', 'guias_externas_fluxos_atomicos')
    , ('20261008370000', 'conciliar_retorno_tiss_no_fluxo_financeiro')
    , ('20261008380000', 'agenda_evitar_conflito_de_paciente_e_sala')
    , ('20261008390000', 'libera_coleta_apos_liberar_todos_resultados')
    , ('20261008400000', 'incluir_ultimo_acesso_no_crm')
    , ('20261008410000', 'persistir_dados_complementares_paciente')
    , ('20261008420000', 'retornos_agendamento_atomico')
    , ('20261008430000', 'cadastro_estoque_idempotente')
    , ('20261009090000', 'retornos_bloqueiam_conflito_de_paciente')
    , ('20261009100000', 'agendamento_publico_sem_conflito_de_paciente')
    , ('20261009110000', 'notificacoes_usam_data_civil_sao_paulo')
    , ('20261009120000', 'prescricoes_pdf_persistente')
    , ('20261009130000', 'impedir_triagem_duplicada_por_agendamento')
    , ('20261009140000', 'impedir_lista_espera_duplicada')
    , ('20261009150000', 'impedir_medico_com_registro_duplicado')
    , ('20261010160000', 'resumo_pacientes_por_clinica')
    , ('20261010170000', 'status_agendamento_e_fila_atomicos')
    , ('20261010180000', 'gerar_proxima_conta_recorrente')
    , ('20261010190000', 'isolar_chat_por_clinica')
    , ('20261010191000', 'onboarding_exige_funcao_na_equipe')
    , ('20261010192000', 'bloquear_resultados_apos_validacao')
    , ('20261010193000', 'sincronizar_comorbidades_paciente_atomicamente')
    , ('20261010194000', 'pagamentos_no_realtime')
    , ('20261010195000', 'agendar_expiracao_de_trials')
    , ('20261010196000', 'historico_de_faturas_da_plataforma')
    , ('20261010197000', 'checkout_transparente_planos')
    , ('20261010198000', 'checkout_provisionamento_seguro')
    , ('20261010198000', 'mercadopago_oauth_clinicas')
    , ('20261010199000', 'mercadopago_point_clinica')
    , ('20261010200000', 'registrar_pagamento_point_no_financeiro')
    , ('20261010201000', 'mercadopago_point_one_open_order_per_bill')
    , ('20261010202000', 'agente_whatsapp_capacidades_e_confirmacao')
    , ('20261010210000', 'provisionar_conta_dona_com_clinica_interna')
    , ('20261010220000', 'cron_endpoints_supabase_vps')
    , ('20261010230000', 'planos_pro_ultra_precos_e_recursos')
    , ('20261011000000', 'laboratorio_lis_foundation')
    , ('20261011010000', 'portal_paciente_scoped_links')
    , ('20261011020000', 'prontuario_autoria_e_auditoria')
    , ('20261011030000', 'agenda_isolamento_medico')
    , ('20261011040000', 'caixa_select_por_perfil')
    , ('20261011050000', 'fila_triagem_perfis_e_privacidade')
    , ('20261011060000', 'gestao_salas_recepcao')
    , ('20261011070000', 'retornos_perfil_medico_e_agenda')
    , ('20261011080000', 'risco_faltas_perfil_e_lembrete')
    , ('20261011090000', 'pacientes_privacidade_financeira')
    , ('20261011090001', 'tiss_gravacoes_controladas')
    , ('20261011100000', 'prontuario_audit_privacy')
    , ('20261011110000', 'tarefas_responsavel_mesma_clinica')
    , ('20261011120000', 'triagem_tenant_e_autoria')
    , ('20261011130000', 'integridade_salas_lista_espera')
    , ('20261011140000', 'retornos_integridade_tenant')
    , ('20261011150000', 'convenios_integridade_tenant')
    , ('20261011160000', 'prontuario_integridade_assinado')
    , ('20261011170000', 'documentos_clinicos_integridade_tenant')
    , ('20261011180000', 'integridade_tenant_laboratorio')
    , ('20261011190000', 'convites_funcionario_select_admin')
    , ('20261011200000', 'estoque_acesso_por_responsabilidade')
    , ('20261011210000', 'chat_integridade_conversas')
    , ('20261011220000', 'indicadores_produtividade_fuso')
    , ('20261011230000', 'relatorios_salvos_acesso_e_propriedade')
    , ('20261011240000', 'financeiro_integridade_e_gravacao_controlada')
    , ('20261011250000', 'cobranca_inadimplente_claim_atomico')
    , ('20261011260000', 'agenda_integridade_referencial_e_status')
    , ('20261011270000', 'proteger_lancamentos_e_limites_de_desconto')
    , ('20261011280000', 'prontuario_referencias_e_anexos_assinados')
    , ('20261011290000', 'documentos_clinicos_autoria_transicoes')
    , ('20261011300000', 'prescricao_memed_idempotencia')
    , ('20261011310000', 'pagamentos_insercao_controlada')
    , ('20261011330000', 'precos_consulta_tenant_integrity')
    , ('20261011340000', 'equipe_privacidade_campos')
    , ('20261011350000', 'whatsapp_admin_perfil')
    , ('20261011360000', 'whatsapp_rpcs_admin_only')
    , ('20261011370000', 'impersonacao_exige_motivo')
    , ('20261011380000', 'registros_pendentes_so_plataforma')
    , ('20261011390000', 'platform_feature_flags_admin_only')
    , ('20261011400000', 'tarefas_integridade_tenant')
    , ('20261011410000', 'caixa_diario_pagamentos_parciais_legados')
    , ('20261011420000', 'precos_exames_config_access')
    , ('20261011430000', 'automacao_envios_claims')
    , ('20261011440000', 'fila_notificacoes_resultado_incerto')
    , ('20261011450000', 'agendamento_bloqueia_remarcacao_em_andamento')
    , ('20261011460000', 'convenios_codigo_por_clinica')
    , ('20261011470000', 'exame_vinculo_prontuario')
    , ('20261012100000', 'admin_finance_realtime')
    , ('20261021120000', 'perfil_proprio_medico_e_logo_clinica')
    , ('20261021130000', 'pre_consulta_portal')
    , ('20261027120000', 'desfazer_checkin_volta_status')
    , ('20261027130000', 'agendamento_tipo_consulta_da_clinica')
    , ('20261028090000', 'revogar_anon_e_privilegios_padrao')
    , ('20261028100000', 'lgpd_anonimizacao_transacional')
),
repo_versoes AS (
  SELECT versao, string_agg(nome, ' + ' ORDER BY nome) AS nome
    FROM repo
   GROUP BY versao
),
vps AS (
  SELECT version::text AS versao
    FROM supabase_migrations.schema_migrations
)
SELECT coalesce(r.versao, v.versao) AS versao,
       r.nome                       AS nome_no_repositorio,
       CASE
         WHEN v.versao IS NULL THEN 'so_no_repositorio'
         WHEN r.versao IS NULL THEN 'so_na_vps'
       END                          AS situacao
  FROM repo_versoes r
  FULL JOIN vps v ON v.versao = r.versao
 WHERE r.versao IS NULL OR v.versao IS NULL
 ORDER BY 1;

-- 9.3 Resumo da 9.2.
\echo '== 9.3 Migrations: resumo'
SELECT (SELECT count(*) FROM supabase_migrations.schema_migrations)     AS registradas_na_vps,
       (SELECT max(version::text) FROM supabase_migrations.schema_migrations) AS ultima_registrada_na_vps,
       456                                                              AS arquivos_no_repositorio,
       455                                                              AS versoes_distintas_no_repositorio;
COMMIT;

-- Fim. Nenhuma alteração foi feita por este arquivo.
