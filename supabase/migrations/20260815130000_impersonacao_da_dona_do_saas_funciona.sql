-- ============================================================================
-- A dona do SaaS entrava na clínica e via o sistema vazio
--
-- Reproduzido assumindo a identidade de `contato@elolab.com.br` (nível `owner`
-- em `platform_admins`) numa transação com ROLLBACK:
--
--   antes           -> 0 pacientes
--   platform_start_impersonation(Monte Sinai) -> {"success": true}
--   dentro          -> 0 pacientes / 0 agendamentos / 0 lançamentos
--   depois          -> 0 pacientes
--
-- A impersonação faz o certo: troca `profiles.clinica_id` para a clínica alvo,
-- e `is_same_clinica()` passa a apontar para lá. O que faltava é que as
-- policies de dado clínico pedem DUAS coisas:
--
--   pacientes_select: has_any_role(auth.uid()) AND is_same_clinica(clinica_id)
--                     ^^^^^^^^^^^^^^^^^^^^^^^^
--
-- e `has_any_role` é `EXISTS (SELECT 1 FROM user_roles WHERE user_id = ...)`.
-- A dona do SaaS não é funcionária de clínica nenhuma — não tem linha em
-- `user_roles`, e nunca vai ter. Resultado: entra na clínica e vê um sistema
-- vazio, sem mensagem de erro nenhuma.
--
-- São 57 policies em 36 tabelas com essa condição: praticamente todo o dado
-- clínico e financeiro do produto.
--
-- ─── A CORREÇÃO ────────────────────────────────────────────────────────────
--
-- `has_any_role` passa a aceitar também o platform admin que está com uma
-- impersonação ABERTA. Deliberadamente estreito:
--
--   • fora da impersonação (`impersonating_clinica_id IS NULL`) nada muda —
--     ela continua vendo zero, como hoje;
--   • dentro, `is_same_clinica()` ainda limita à UMA clínica em que ela entrou;
--   • `ativo = false` não ganha nada;
--   • quem não é platform admin não é tocado.
--
-- Ou seja: não existe momento em que ela leia o banco inteiro de uma vez.
--
-- ─── O SEGUNDO FURO: A AUDITORIA NUNCA FOI LIGADA ──────────────────────────
--
-- `platform_impersonation_log` existe, com `motivo` NOT NULL — alguém desenhou
-- o rastro. Mas NENHUMA função escreve nela: 0 linhas desde que o sistema
-- existe. Entrar no prontuário de paciente de um cliente sem deixar registro
-- é problema de LGPD antes de ser problema de produto.
--
-- Agora `start` abre a linha e `stop` fecha. O `motivo` é parâmetro opcional
-- para não quebrar a chamada da tela, que hoje manda só o id.
-- ============================================================================

BEGIN;

-- ─── 1. Impersonação passa a valer para as policies ─────────────────────────
CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id
  )
  OR EXISTS (
    -- Administrador da plataforma com impersonação aberta. Vale só enquanto
    -- ela durar: `is_same_clinica()` continua limitando à clínica escolhida.
    SELECT 1 FROM public.platform_admins
     WHERE user_id = _user_id
       AND ativo
       AND impersonating_clinica_id IS NOT NULL
  )
$$;

COMMENT ON FUNCTION public.has_any_role(uuid) IS
  'Se o usuário pode enxergar dado de clínica. Verdadeiro para quem tem papel em user_roles, e para o administrador da plataforma DURANTE uma impersonação — sem isso ele entra na clínica e vê o sistema vazio. Fora da impersonação não ganha nada.';

-- ─── 2. Abrir a impersonação deixa rastro ───────────────────────────────────
--
-- A versão antiga é de UM argumento. Criar a de dois com DEFAULT sem derrubar
-- a antiga deixaria as duas no catálogo, e a chamada da tela — que manda só o
-- id — passaria a falhar com "function is not unique".
DROP FUNCTION IF EXISTS public.platform_start_impersonation(uuid);

CREATE OR REPLACE FUNCTION public.platform_start_impersonation(
  _target_clinica_id uuid,
  _motivo            text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_current_clinica uuid;
  v_exists          boolean;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Acesso negado: somente administradores da plataforma.';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.clinicas WHERE id = _target_clinica_id) INTO v_exists;
  IF NOT v_exists THEN
    RETURN jsonb_build_object('success', false, 'error', 'Clínica não encontrada.');
  END IF;

  SELECT clinica_id INTO v_current_clinica FROM public.profiles WHERE id = auth.uid();

  -- Fecha sessão anterior esquecida em aberto, para o log não acumular linha
  -- sem fim quando alguém pula de uma clínica para outra sem sair.
  UPDATE public.platform_impersonation_log
     SET encerrado_em = now()
   WHERE platform_admin_id = auth.uid() AND encerrado_em IS NULL;

  UPDATE public.platform_admins
     SET impersonating_clinica_id = _target_clinica_id,
         original_clinica_id = COALESCE(original_clinica_id, v_current_clinica)
   WHERE user_id = auth.uid();

  UPDATE public.profiles
     SET clinica_id = _target_clinica_id
   WHERE id = auth.uid();

  INSERT INTO public.platform_impersonation_log (
    platform_admin_id, clinica_id, motivo, iniciado_em, acoes
  ) VALUES (
    auth.uid(), _target_clinica_id,
    COALESCE(NULLIF(btrim(_motivo), ''), 'Suporte à clínica (motivo não informado)'),
    now(), '[]'::jsonb
  );

  RETURN jsonb_build_object('success', true, 'clinica_id', _target_clinica_id);
END;
$$;

-- ─── 3. Sair fecha o rastro ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.platform_stop_impersonation()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_original uuid;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Acesso negado: somente administradores da plataforma.';
  END IF;

  SELECT original_clinica_id INTO v_original
    FROM public.platform_admins WHERE user_id = auth.uid();

  UPDATE public.platform_impersonation_log
     SET encerrado_em = now()
   WHERE platform_admin_id = auth.uid() AND encerrado_em IS NULL;

  UPDATE public.profiles
     SET clinica_id = v_original
   WHERE id = auth.uid();

  UPDATE public.platform_admins
     SET impersonating_clinica_id = NULL,
         original_clinica_id = NULL
   WHERE user_id = auth.uid();

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.platform_start_impersonation(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_start_impersonation(uuid, text) TO authenticated;

COMMIT;
