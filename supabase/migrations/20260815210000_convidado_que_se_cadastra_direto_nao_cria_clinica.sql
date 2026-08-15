-- ============================================================================
-- Quem foi convidado e se cadastra pelo caminho errado não vira dono de uma
-- clínica fantasma
--
-- `handle_new_user` decide o destino de todo cadastro novo:
--
--   COM `invite_token` no metadado  → só cria o perfil; o convite faz o resto
--   SEM                            → CRIA UMA CLÍNICA e concede `admin`
--
-- O ramo de baixo existe para o comprador: ele se cadastra, ganha a clínica
-- dele e é o administrador. Está certo.
--
-- O problema é quem foi convidado e não usa o link. A recepcionista recebe o
-- convite por e-mail, mas vai pelo site e clica em "criar conta" — e o sistema
-- cria uma CLÍNICA NOVA para ela, com ela como admin. Resultado:
--
--   • ela entra e não vê paciente nenhum, porque está na clínica errada;
--   • o admin que a convidou não a encontra na equipe;
--   • sobra uma clínica órfã na base.
--
-- É a origem das clínicas "Clínica de Fulano" que enchiam a lista da
-- plataforma — havia nove delas.
--
-- ─── A CORREÇÃO ────────────────────────────────────────────────────────────
--
-- Antes de criar clínica, olha se existe convite ABERTO para aquele e-mail. Se
-- existe, trata como convidado: cria só o perfil, sem clínica e sem admin. A
-- pessoa então abre o link do e-mail e cai no lugar certo.
--
-- Convite vencido NÃO conta: senão alguém que recebeu convite há seis meses e
-- hoje quer comprar o sistema ficaria sem clínica, sem entender por quê.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _clinica_id uuid;
  _is_invite  boolean;
  _tem_convite boolean;
  _nome       text;
BEGIN
  _nome := COALESCE(
    NEW.raw_user_meta_data->>'nome',
    NEW.raw_user_meta_data->>'full_name',
    split_part(NEW.email, '@', 1)
  );
  _is_invite := (NEW.raw_user_meta_data->>'invite_token') IS NOT NULL;

  -- Convite aberto para este e-mail, em qualquer um dos dois fluxos.
  SELECT EXISTS (
    SELECT 1 FROM public.convites_funcionario c
     WHERE lower(c.email) = lower(NEW.email)
       AND c.accepted_at IS NULL
       AND c.expires_at > now()
    UNION ALL
    SELECT 1 FROM public.employee_invitations e
     WHERE lower(e.email) = lower(NEW.email)
       AND e.status = 'pending'
       AND e.expires_at > now()
  ) INTO _tem_convite;

  IF _is_invite OR _tem_convite THEN
    -- Convidado: só o perfil. Sem clínica e sem papel — quem dá os dois é o
    -- aceite do convite, com a clínica e os papéis que o admin escolheu.
    INSERT INTO public.profiles (id, nome, email, telefone, cpf_cnpj)
    VALUES (
      NEW.id, _nome, NEW.email,
      NEW.raw_user_meta_data->>'telefone',
      NEW.raw_user_meta_data->>'cpf_cnpj'
    );
  ELSE
    -- Comprador: ganha a própria clínica e é o administrador dela.
    INSERT INTO public.clinicas (id, nome, owner_id)
    VALUES (gen_random_uuid(), 'Clínica de ' || _nome, NEW.id)
    RETURNING id INTO _clinica_id;

    INSERT INTO public.profiles (id, nome, email, telefone, cpf_cnpj, clinica_id)
    VALUES (
      NEW.id, _nome, NEW.email,
      NEW.raw_user_meta_data->>'telefone',
      NEW.raw_user_meta_data->>'cpf_cnpj',
      _clinica_id
    );

    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS
  'Destino de todo cadastro novo. Quem tem convite aberto (pelo metadado ou pelo e-mail) entra sem clínica e sem papel, para o aceite do convite colocá-lo no lugar certo. Só o comprador ganha clínica própria e admin.';

COMMIT;
