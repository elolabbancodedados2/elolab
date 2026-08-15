-- ============================================================================
-- VERIFICAÇÃO — a dona do SaaS entra na clínica, e só nela
--
-- O risco desta correção não é ela não funcionar: é funcionar demais. Por isso
-- metade dos casos abaixo verifica o que ela NÃO pode ver.
--
-- Termina em ROLLBACK.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE _res(n int, caso text, ok boolean, detalhe text);
GRANT ALL ON _res TO authenticated;

CREATE TEMP TABLE _ctx AS
SELECT
  (SELECT id FROM auth.users WHERE email = 'contato@elolab.com.br')            AS dona,
  (SELECT id FROM public.clinicas WHERE nome ILIKE '%MONTE SINAI%' LIMIT 1)    AS monte_sinai,
  (SELECT id FROM public.clinicas WHERE nome ILIKE '%INOVALAB%'    LIMIT 1)    AS inovalab,
  (SELECT count(*) FROM public.pacientes p JOIN public.clinicas c ON c.id = p.clinica_id
    WHERE c.nome ILIKE '%MONTE SINAI%')                                        AS pac_monte,
  (SELECT count(*) FROM public.pacientes p JOIN public.clinicas c ON c.id = p.clinica_id
    WHERE c.nome ILIKE '%INOVALAB%')                                           AS pac_inova;
GRANT SELECT ON _ctx TO authenticated;

SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT dona::text FROM _ctx), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

-- ─── 1. Fora da impersonação, nada mudou: continua sem ver dado clínico ───
INSERT INTO _res SELECT 1, 'fora da impersonação não vê paciente',
  (SELECT count(*) FROM public.pacientes) = 0,
  (SELECT count(*)||' paciente(s)' FROM public.pacientes);

-- ─── 2. Entra na Monte Sinai ───
SELECT public.platform_start_impersonation((SELECT monte_sinai FROM _ctx), 'Verificação automatizada');

INSERT INTO _res SELECT 2, 'dentro da Monte Sinai vê os pacientes dela',
  (SELECT count(*) FROM public.pacientes) = (SELECT pac_monte FROM _ctx),
  (SELECT count(*)||' de '||(SELECT pac_monte FROM _ctx) FROM public.pacientes);

-- ─── 3. E NÃO vê os da INOVALAB ───
INSERT INTO _res SELECT 3, 'não enxerga a clínica vizinha',
  (SELECT count(*) FROM public.pacientes WHERE clinica_id = (SELECT inovalab FROM _ctx)) = 0,
  (SELECT count(*)||' paciente(s) da INOVALAB visíveis (esperado 0; ela tem '
        ||(SELECT pac_inova FROM _ctx)||')'
     FROM public.pacientes WHERE clinica_id = (SELECT inovalab FROM _ctx));

-- ─── 4. O rastro foi aberto, com motivo ───
INSERT INTO _res SELECT 4, 'auditoria registrou a entrada',
  EXISTS (SELECT 1 FROM public.platform_impersonation_log
           WHERE platform_admin_id = (SELECT dona FROM _ctx)
             AND clinica_id = (SELECT monte_sinai FROM _ctx)
             AND encerrado_em IS NULL
             AND btrim(motivo) <> ''),
  coalesce((SELECT motivo FROM public.platform_impersonation_log
             WHERE platform_admin_id = (SELECT dona FROM _ctx) AND encerrado_em IS NULL
             ORDER BY iniciado_em DESC LIMIT 1), '(sem linha)');

-- ─── 5. Pular direto para outra clínica fecha a sessão anterior ───
SELECT public.platform_start_impersonation((SELECT inovalab FROM _ctx), 'Troca sem sair');

INSERT INTO _res SELECT 5, 'trocar de clínica não deixa sessão aberta pendurada',
  (SELECT count(*) FROM public.platform_impersonation_log
    WHERE platform_admin_id = (SELECT dona FROM _ctx) AND encerrado_em IS NULL) = 1,
  (SELECT count(*)||' sessão(ões) em aberto (esperado 1)'
     FROM public.platform_impersonation_log
    WHERE platform_admin_id = (SELECT dona FROM _ctx) AND encerrado_em IS NULL);

INSERT INTO _res SELECT 6, 'agora vê a INOVALAB e não a Monte Sinai',
  (SELECT count(*) FROM public.pacientes WHERE clinica_id = (SELECT monte_sinai FROM _ctx)) = 0
  AND (SELECT count(*) FROM public.pacientes) = (SELECT pac_inova FROM _ctx),
  (SELECT count(*)||' visíveis' FROM public.pacientes);

-- ─── 7. Ao sair, volta a não ver nada e o rastro fecha ───
SELECT public.platform_stop_impersonation();

INSERT INTO _res SELECT 7, 'ao sair volta a não ver dado clínico',
  (SELECT count(*) FROM public.pacientes) = 0,
  (SELECT count(*)||' paciente(s)' FROM public.pacientes);

INSERT INTO _res SELECT 8, 'auditoria fechou todas as sessões',
  (SELECT count(*) FROM public.platform_impersonation_log
    WHERE platform_admin_id = (SELECT dona FROM _ctx) AND encerrado_em IS NULL) = 0,
  (SELECT count(*)||' em aberto' FROM public.platform_impersonation_log
    WHERE platform_admin_id = (SELECT dona FROM _ctx) AND encerrado_em IS NULL);

RESET ROLE;

-- ─── 9. Quem NÃO é admin da plataforma não consegue impersonar ───
SELECT set_config('request.jwt.claims',
  json_build_object(
    'sub', (SELECT ur.user_id::text FROM public.user_roles ur LIMIT 1),
    'role','authenticated')::text, true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE v_alvo uuid;
BEGIN
  SELECT monte_sinai INTO v_alvo FROM _ctx;
  BEGIN
    PERFORM public.platform_start_impersonation(v_alvo, 'tentativa indevida');
    INSERT INTO _res VALUES (9, 'usuário comum não impersona', false, 'CONSEGUIU IMPERSONAR');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _res VALUES (9, 'usuário comum não impersona', true, SQLERRM);
  END;
END $$;

RESET ROLE;

-- ─── 10. Usuário comum de clínica não foi afetado pela mudança ───
SELECT set_config('request.jwt.claims',
  json_build_object(
    'sub', (SELECT p.id::text FROM public.profiles p
             JOIN public.user_roles ur ON ur.user_id = p.id
             JOIN public.clinicas c ON c.id = p.clinica_id
            WHERE c.nome ILIKE '%MONTE SINAI%' LIMIT 1),
    'role','authenticated')::text, true);
SET LOCAL ROLE authenticated;

INSERT INTO _res SELECT 10, 'funcionário da clínica continua vendo a clínica dele',
  (SELECT count(*) FROM public.pacientes) = (SELECT pac_monte FROM _ctx),
  (SELECT count(*)||' de '||(SELECT pac_monte FROM _ctx) FROM public.pacientes);

RESET ROLE;

SELECT
  string_agg(
    (CASE WHEN ok THEN 'OK   ' ELSE 'FALHOU ' END) || n || '. ' || caso || ' [' || detalhe || ']',
    E'\n' ORDER BY n) AS resultado,
  count(*) FILTER (WHERE ok) || '/' || count(*) AS placar
FROM _res;

ROLLBACK;
