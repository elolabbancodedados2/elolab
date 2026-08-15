-- ============================================================================
-- VERIFICAÇÃO — convite de funcionário: cada clínica com a sua equipe
--
-- Um convite dá acesso ao prontuário de uma clínica inteira. As perguntas que
-- este arquivo responde, contra o banco real:
--
--   um admin consegue convidar para a clínica do vizinho?
--   consegue ver os convites do vizinho?
--   o aceite coloca a pessoa na clínica certa, com os papéis certos?
--   token de outra pessoa, expirado ou já usado é recusado?
--   funcionário criado sem clínica some da lista de quem o criou?
--
-- Termina em ROLLBACK: nenhum convite, conta ou funcionário fica no banco.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE _res(n int, caso text, ok boolean, detalhe text);
GRANT ALL ON _res TO authenticated;

-- ─── Cenário: duas clínicas, um admin em cada ───
CREATE TEMP TABLE _ctx AS
WITH a AS (
  SELECT p.id AS admin_a, p.clinica_id AS clinica_a
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role::text = 'admin'
   WHERE p.clinica_id IS NOT NULL
   ORDER BY p.id LIMIT 1
)
SELECT a.admin_a, a.clinica_a,
       (SELECT c.id FROM public.clinicas c WHERE c.id <> a.clinica_a
         AND EXISTS (SELECT 1 FROM public.profiles q WHERE q.clinica_id = c.id) LIMIT 1) AS clinica_b
  FROM a;
GRANT SELECT ON _ctx TO authenticated;

-- Conta descartável que vai aceitar o convite. Criada como postgres porque a
-- criação de usuário é do servidor, não da sessão do admin.
CREATE TEMP TABLE _convidado AS
SELECT gen_random_uuid() AS user_id, '__verificacao_convite__@exemplo.test' AS email;
GRANT SELECT ON _convidado TO authenticated;

-- `invite_token` no metadado é o que faz `handle_new_user` NÃO criar clínica
-- própria nem conceder admin. Sem isso, todo cadastro direto vira dono de uma
-- clínica nova — é assim que o app funciona, e foi o que quebrou este teste na
-- primeira tentativa.
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at, raw_user_meta_data)
SELECT c.user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       c.email, '', now(), now(), now(),
       jsonb_build_object('nome', 'Convidado da Verificação', 'invite_token', '__tok_rpc__')
  FROM _convidado c;

-- Um gatilho em auth.users já cria o profile; por isso o ON CONFLICT.
INSERT INTO public.profiles (id, nome, email)
SELECT c.user_id, 'Convidado da Verificação', c.email FROM _convidado c
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, email = EXCLUDED.email;

-- ─── Sessão do admin da clínica A ───
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT admin_a::text FROM _ctx), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

-- 1. Convidar para a clínica do vizinho
DO $$
DECLARE v_b uuid;
BEGIN
  SELECT clinica_b INTO v_b FROM _ctx;
  BEGIN
    INSERT INTO public.convites_funcionario (clinica_id, email, nome, roles, token, expires_at, invited_by)
    VALUES (v_b, 'invasor@exemplo.test', 'Invasor', ARRAY['admin']::app_role[],
            '__tok_vizinho__', now() + interval '7 days', auth.uid());
    INSERT INTO _res VALUES (1, 'convidar para a clínica do vizinho', false, 'ACEITOU — daria acesso à clínica dos outros');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _res VALUES (1, 'convidar para a clínica do vizinho', true, SQLERRM);
  END;
END $$;

-- 2. Enxergar convites do vizinho
DO $$
DECLARE v_b uuid; v_qtd int;
BEGIN
  SELECT clinica_b INTO v_b FROM _ctx;
  SELECT count(*) INTO v_qtd FROM public.convites_funcionario WHERE clinica_id = v_b;
  INSERT INTO _res VALUES (2, 'ver convites do vizinho', v_qtd = 0, v_qtd||' convite(s) visíveis');
END $$;

-- 3. Convidar para a PRÓPRIA clínica funciona
DO $$
DECLARE v_a uuid; v_email text;
BEGIN
  SELECT clinica_a INTO v_a FROM _ctx;
  SELECT email INTO v_email FROM _convidado;
  BEGIN
    INSERT INTO public.convites_funcionario (clinica_id, email, nome, roles, token, expires_at, invited_by)
    VALUES (v_a, v_email, 'Convidado da Verificação', ARRAY['recepcao']::app_role[],
            '__tok_valido__', now() + interval '7 days', auth.uid());
    INSERT INTO _res VALUES (3, 'convidar para a própria clínica', true, 'criado');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _res VALUES (3, 'convidar para a própria clínica', false, SQLERRM);
  END;
END $$;

-- 4. Funcionário criado SEM clínica some da lista de quem criou
DO $$
DECLARE v_id uuid; v_visivel int;
BEGIN
  BEGIN
    INSERT INTO public.funcionarios (nome, email, clinica_id)
    VALUES ('__verificacao_sem_clinica__', 'semclinica@exemplo.test', NULL)
    RETURNING id INTO v_id;
    SELECT count(*) INTO v_visivel FROM public.funcionarios WHERE id = v_id;
    INSERT INTO _res VALUES (4, 'funcionário criado sem clínica continua visível', v_visivel = 1,
      CASE WHEN v_visivel = 1 THEN 'visível' ELSE 'SUMIU da lista de quem acabou de criar' END);
  EXCEPTION WHEN OTHERS THEN
    -- Recusar na origem também resolve, e é ainda melhor.
    INSERT INTO _res VALUES (4, 'funcionário criado sem clínica continua visível', true,
      'recusado na criação: '||SQLERRM);
  END;
END $$;

RESET ROLE;

-- A partir daqui a sessão é a do convidado: a RPC recusa aceite feito de
-- dentro da sessão de outra pessoa, e é assim que deve ser.
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT user_id::text FROM _convidado), 'role', 'authenticated')::text, true);

-- ─── Aceite: pelo RPC, que é o caminho testável em SQL ───
-- Espelha o convite criado acima em employee_invitations, que é a tabela que a
-- RPC atende. As duas guardam a mesma informação.
-- A RPC exige `funcionario_id`: cria-se a ficha do convidado antes, que é o
-- que o fluxo real também faz.
CREATE TEMP TABLE _ficha AS
WITH ins AS (
  INSERT INTO public.funcionarios (nome, email, clinica_id, ativo, pending_roles)
  SELECT 'Convidado da Verificação', c.email, x.clinica_a, true, ARRAY['recepcao']::app_role[]
    FROM _convidado c, _ctx x
  RETURNING id
)
SELECT id FROM ins;

INSERT INTO public.employee_invitations (funcionario_id, email, token, roles, status, expires_at, clinica_id)
SELECT (SELECT id FROM _ficha), c.email, '__tok_rpc__', ARRAY['recepcao']::app_role[],
       'pending', now() + interval '7 days', x.clinica_a
  FROM _convidado c, _ctx x;

-- 5. Token que não é da conta
DO $$
DECLARE v_outro uuid; v_r jsonb;
BEGIN
  SELECT admin_a INTO v_outro FROM _ctx;
  v_r := public.accept_employee_invitation('__tok_rpc__', v_outro);
  INSERT INTO _res VALUES (5, 'aceitar convite de outra pessoa', (v_r->>'success')::boolean IS NOT TRUE,
    coalesce(v_r->>'error', 'ACEITOU'));
END $$;

-- 6. Token inexistente
DO $$
DECLARE v_u uuid; v_r jsonb;
BEGIN
  SELECT user_id INTO v_u FROM _convidado;
  v_r := public.accept_employee_invitation('__nao_existe__', v_u);
  INSERT INTO _res VALUES (6, 'token inventado', (v_r->>'success')::boolean IS NOT TRUE,
    coalesce(v_r->>'error', 'ACEITOU'));
END $$;

-- 7. Convite expirado
DO $$
DECLARE v_u uuid; v_r jsonb; v_a uuid;
BEGIN
  SELECT user_id INTO v_u FROM _convidado;
  SELECT clinica_a INTO v_a FROM _ctx;
  INSERT INTO public.employee_invitations (funcionario_id, email, token, roles, status, expires_at, clinica_id)
  SELECT (SELECT id FROM _ficha), c.email, '__tok_vencido__', ARRAY['recepcao']::app_role[],
         'pending', now() - interval '1 day', v_a FROM _convidado c;
  v_r := public.accept_employee_invitation('__tok_vencido__', v_u);
  INSERT INTO _res VALUES (7, 'convite vencido', (v_r->>'success')::boolean IS NOT TRUE,
    coalesce(v_r->>'error', 'ACEITOU'));
END $$;

-- 8. Aceite legítimo põe a pessoa na clínica certa, com o papel certo
DO $$
DECLARE v_u uuid; v_a uuid; v_r jsonb; v_clin uuid; v_papeis text;
BEGIN
  SELECT user_id INTO v_u FROM _convidado;
  SELECT clinica_a INTO v_a FROM _ctx;
  v_r := public.accept_employee_invitation('__tok_rpc__', v_u);

  SELECT clinica_id INTO v_clin FROM public.profiles WHERE id = v_u;
  SELECT string_agg(role::text, '+') INTO v_papeis FROM public.user_roles WHERE user_id = v_u;

  INSERT INTO _res VALUES (8, 'aceite põe na clínica certa com o papel certo',
    (v_r->>'success')::boolean IS TRUE AND v_clin = v_a AND v_papeis = 'recepcao',
    'sucesso='||coalesce(v_r->>'success','?')||' clinica='||CASE WHEN v_clin = v_a THEN 'certa' ELSE 'ERRADA' END
      ||' papeis='||coalesce(v_papeis,'NENHUM'));
END $$;

-- 9. O mesmo token não serve duas vezes
DO $$
DECLARE v_u uuid; v_r jsonb;
BEGIN
  SELECT user_id INTO v_u FROM _convidado;
  v_r := public.accept_employee_invitation('__tok_rpc__', v_u);
  INSERT INTO _res VALUES (9, 'reusar token já aceito', (v_r->>'success')::boolean IS NOT TRUE,
    coalesce(v_r->>'error', 'ACEITOU DE NOVO'));
END $$;

-- 10. O convidado enxerga só a clínica dele
DO $$
DECLARE v_u uuid; v_a uuid; v_qtd int;
BEGIN
  SELECT user_id INTO v_u FROM _convidado;
  SELECT clinica_a INTO v_a FROM _ctx;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_u::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_qtd FROM public.pacientes WHERE clinica_id <> v_a;
  RESET ROLE;
  INSERT INTO _res VALUES (10, 'recém-convidado não vê paciente de outra clínica', v_qtd = 0,
    v_qtd||' paciente(s) de fora visíveis');
END $$;

SELECT
  string_agg((CASE WHEN ok THEN 'OK   ' ELSE 'FALHOU ' END) || n || '. ' || caso || ' [' || left(detalhe, 66) || ']',
             E'\n' ORDER BY n) AS resultado,
  count(*) FILTER (WHERE ok) || '/' || count(*) AS placar
FROM _res;

ROLLBACK;
