-- ============================================================================
-- VERIFICAÇÃO — para onde vai cada cadastro novo
--
-- Três caminhos, três destinos diferentes, e confundi-los é o que enchia a
-- plataforma de clínicas órfãs:
--
--   comprador               → ganha clínica própria e vira admin
--   convidado pelo link     → sem clínica, sem papel (o aceite resolve)
--   convidado que erra o    → MESMA COISA que o de cima, e não uma clínica
--   caminho e se cadastra     fantasma com ele de admin
--
-- Termina em ROLLBACK.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE _res(n int, caso text, ok boolean, detalhe text);

CREATE TEMP TABLE _ctx AS
SELECT (SELECT clinica_id FROM public.profiles WHERE clinica_id IS NOT NULL LIMIT 1) AS clinica,
       (SELECT id FROM public.profiles WHERE clinica_id IS NOT NULL LIMIT 1) AS quem_convida;

CREATE OR REPLACE FUNCTION pg_temp.criar_conta(_email text, _meta jsonb)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at, raw_user_meta_data)
  VALUES (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          _email, '', now(), now(), now(), _meta);
  RETURN v_id;
END $$;

-- ─── 1. Comprador: cadastro direto, sem convite nenhum ───
DO $$
DECLARE v_id uuid; v_clin uuid; v_papeis text;
BEGIN
  v_id := pg_temp.criar_conta('__verif_comprador__@exemplo.test',
                              jsonb_build_object('nome', 'Comprador da Verificação'));
  SELECT clinica_id INTO v_clin FROM public.profiles WHERE id = v_id;
  SELECT string_agg(role::text, '+') INTO v_papeis FROM public.user_roles WHERE user_id = v_id;

  INSERT INTO _res VALUES (1, 'comprador ganha clínica própria e vira admin',
    v_clin IS NOT NULL AND v_papeis = 'admin',
    'clinica='||coalesce(v_clin::text,'NENHUMA')||' papeis='||coalesce(v_papeis,'nenhum'));
END $$;

-- ─── 2. Convidado que usa o link (metadado com invite_token) ───
DO $$
DECLARE v_id uuid; v_clin uuid; v_papeis text; v_clinicas_antes int; v_clinicas_depois int;
BEGIN
  SELECT count(*) INTO v_clinicas_antes FROM public.clinicas;
  v_id := pg_temp.criar_conta('__verif_pelo_link__@exemplo.test',
            jsonb_build_object('nome', 'Convidado pelo Link', 'invite_token', 'abc'));
  SELECT count(*) INTO v_clinicas_depois FROM public.clinicas;
  SELECT clinica_id INTO v_clin FROM public.profiles WHERE id = v_id;
  SELECT string_agg(role::text, '+') INTO v_papeis FROM public.user_roles WHERE user_id = v_id;

  INSERT INTO _res VALUES (2, 'convidado pelo link entra sem clínica e sem papel',
    v_clin IS NULL AND v_papeis IS NULL AND v_clinicas_depois = v_clinicas_antes,
    'clinica='||coalesce(v_clin::text,'nenhuma')||' papeis='||coalesce(v_papeis,'nenhum')
      ||' clinicas criadas='||(v_clinicas_depois - v_clinicas_antes));
END $$;

-- ─── 3. O caso que criava clínica fantasma ───
--   convite aberto no e-mail, mas a pessoa se cadastra pelo site
DO $$
DECLARE v_id uuid; v_clin uuid; v_papeis text; v_antes int; v_depois int;
BEGIN
  INSERT INTO public.convites_funcionario (clinica_id, email, nome, roles, token, expires_at, invited_by)
  SELECT clinica, '__verif_errou_o_caminho__@exemplo.test', 'Recepcionista',
         ARRAY['recepcao']::app_role[], '__tok_verif__', now() + interval '7 days', quem_convida
    FROM _ctx;

  SELECT count(*) INTO v_antes FROM public.clinicas;
  v_id := pg_temp.criar_conta('__verif_errou_o_caminho__@exemplo.test',
                              jsonb_build_object('nome', 'Recepcionista'));
  SELECT count(*) INTO v_depois FROM public.clinicas;
  SELECT clinica_id INTO v_clin FROM public.profiles WHERE id = v_id;
  SELECT string_agg(role::text, '+') INTO v_papeis FROM public.user_roles WHERE user_id = v_id;

  INSERT INTO _res VALUES (3, 'convidado que se cadastra pelo site NÃO cria clínica',
    v_clin IS NULL AND v_papeis IS NULL AND v_depois = v_antes,
    'clinica='||coalesce(v_clin::text,'nenhuma')||' papeis='||coalesce(v_papeis,'nenhum')
      ||' clinicas criadas='||(v_depois - v_antes));
END $$;

-- ─── 4. Convite VENCIDO não pode impedir uma compra ───
DO $$
DECLARE v_id uuid; v_clin uuid; v_papeis text;
BEGIN
  INSERT INTO public.convites_funcionario (clinica_id, email, nome, roles, token, expires_at, invited_by)
  SELECT clinica, '__verif_convite_velho__@exemplo.test', 'Alguém',
         ARRAY['recepcao']::app_role[], '__tok_velho__', now() - interval '30 days', quem_convida
    FROM _ctx;

  v_id := pg_temp.criar_conta('__verif_convite_velho__@exemplo.test',
                              jsonb_build_object('nome', 'Comprador Antigo Convidado'));
  SELECT clinica_id INTO v_clin FROM public.profiles WHERE id = v_id;
  SELECT string_agg(role::text, '+') INTO v_papeis FROM public.user_roles WHERE user_id = v_id;

  -- Convite de seis meses atrás não pode deixar quem hoje quer comprar sem
  -- clínica, sem entender por quê.
  INSERT INTO _res VALUES (4, 'convite vencido não bloqueia quem está comprando',
    v_clin IS NOT NULL AND v_papeis = 'admin',
    'clinica='||coalesce(v_clin::text,'NENHUMA')||' papeis='||coalesce(v_papeis,'nenhum'));
END $$;

SELECT
  string_agg((CASE WHEN ok THEN 'OK   ' ELSE 'FALHOU ' END) || n || '. ' || caso || ' [' || detalhe || ']',
             E'\n' ORDER BY n) AS resultado,
  count(*) FILTER (WHERE ok) || '/' || count(*) AS placar
FROM _res;

ROLLBACK;
