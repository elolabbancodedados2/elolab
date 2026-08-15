-- ============================================================================
-- Governança de clínicas: arquivar as inativas, excluir só as vazias
--
-- Hoje o painel do SaaS lista 12 clínicas e não oferece jeito nenhum de limpar.
-- Das 12, 3 têm operação e 9 são resto de teste ou de cadastro que nunca andou.
-- Sem tela, a única saída é mexer no banco — que foi o que aconteceu.
--
-- ─── POR QUE ARQUIVAR, E NÃO APAGAR ────────────────────────────────────────
--
-- Clínica com paciente tem prontuário, e prontuário não se apaga por
-- conveniência: a Resolução CFM 1.821/07 manda guardar por 20 anos. Uma tela
-- de "excluir clínica" que apaga prontuário é uma tela que cria problema
-- jurídico com dois cliques.
--
-- Então são dois verbos diferentes:
--
--   ARQUIVAR  — some da lista, guarda quem arquivou, quando e por quê, e
--               volta a qualquer momento. Serve para cliente que saiu.
--   EXCLUIR   — só quando a clínica está VAZIA (zero paciente, agendamento,
--               prontuário, lançamento e funcionário). A checagem é do banco,
--               não da tela. É o caso das 9 de teste.
--
-- Arquivar NÃO derruba o acesso de quem usa a clínica. Suspender cliente é
-- outra decisão, com outra conversa, e misturar as duas faria a limpeza da
-- lista tirar uma clínica do ar sem ninguém perceber.
-- ============================================================================

BEGIN;

ALTER TABLE public.clinicas
  ADD COLUMN IF NOT EXISTS arquivada        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS arquivada_em     timestamptz,
  ADD COLUMN IF NOT EXISTS arquivada_por    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS arquivada_motivo text;

COMMENT ON COLUMN public.clinicas.arquivada IS
  'Fora da lista do painel da plataforma. Não bloqueia acesso — suspender cliente é outra coisa.';

-- ─── Arquivar ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.platform_arquivar_clinica(
  _clinica_id uuid,
  _motivo     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nome text;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Acesso negado: somente administradores da plataforma.';
  END IF;

  SELECT nome INTO v_nome FROM public.clinicas WHERE id = _clinica_id;
  IF v_nome IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Clínica não encontrada.');
  END IF;

  UPDATE public.clinicas
     SET arquivada = true,
         arquivada_em = now(),
         arquivada_por = auth.uid(),
         arquivada_motivo = NULLIF(btrim(_motivo), '')
   WHERE id = _clinica_id;

  RETURN jsonb_build_object('success', true, 'nome', v_nome);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_desarquivar_clinica(_clinica_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Acesso negado: somente administradores da plataforma.';
  END IF;

  UPDATE public.clinicas
     SET arquivada = false, arquivada_em = NULL, arquivada_por = NULL, arquivada_motivo = NULL
   WHERE id = _clinica_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ─── O que existe pendurado numa clínica ───────────────────────────────────
--
-- Alimenta a confirmação da tela: antes de oferecer "excluir", mostrar o que
-- há dentro. E é a mesma contagem que a exclusão usa para decidir — a tela e o
-- banco não podem discordar sobre o que está vazio.
CREATE OR REPLACE FUNCTION public.platform_conteudo_da_clinica(_clinica_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v jsonb;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Acesso negado: somente administradores da plataforma.';
  END IF;

  SELECT jsonb_build_object(
    'pacientes',    (SELECT count(*) FROM public.pacientes    WHERE clinica_id = _clinica_id),
    'agendamentos', (SELECT count(*) FROM public.agendamentos WHERE clinica_id = _clinica_id),
    'prontuarios',  (SELECT count(*) FROM public.prontuarios  WHERE clinica_id = _clinica_id),
    'lancamentos',  (SELECT count(*) FROM public.lancamentos  WHERE clinica_id = _clinica_id),
    'funcionarios', (SELECT count(*) FROM public.funcionarios WHERE clinica_id = _clinica_id),
    'medicos',      (SELECT count(*) FROM public.medicos      WHERE clinica_id = _clinica_id),
    'usuarios',     (SELECT count(*) FROM public.profiles     WHERE clinica_id = _clinica_id)
  ) INTO v;

  RETURN v || jsonb_build_object(
    'vazia',
    (v->>'pacientes')::int = 0 AND (v->>'agendamentos')::int = 0 AND (v->>'prontuarios')::int = 0
      AND (v->>'lancamentos')::int = 0 AND (v->>'funcionarios')::int = 0 AND (v->>'medicos')::int = 0
      AND (v->>'usuarios')::int = 0
  );
END;
$$;

-- ─── Excluir, e só se estiver vazia ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.platform_excluir_clinica_vazia(
  _clinica_id  uuid,
  _confirmacao text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nome  text;
  v_dados jsonb;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Acesso negado: somente administradores da plataforma.';
  END IF;

  SELECT nome INTO v_nome FROM public.clinicas WHERE id = _clinica_id;
  IF v_nome IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Clínica não encontrada.');
  END IF;

  -- Digitar o nome é o freio de mão: exclusão é irreversível e a lista tem
  -- nomes parecidos ("Clínica Admin Teste" aparece duas vezes).
  IF btrim(_confirmacao) IS DISTINCT FROM btrim(v_nome) THEN
    RETURN jsonb_build_object('success', false,
      'error', 'Para excluir, digite o nome exato da clínica.');
  END IF;

  v_dados := public.platform_conteudo_da_clinica(_clinica_id);

  IF NOT (v_dados->>'vazia')::boolean THEN
    RETURN jsonb_build_object('success', false,
      'error', 'Esta clínica tem dados. Arquive em vez de excluir.',
      'conteudo', v_dados);
  END IF;

  -- Só sobra a máquina que a própria clínica gerou (configurações de
  -- automação, fila de notificação). Sai junto.
  DELETE FROM public.notification_queue  WHERE clinica_id = _clinica_id;
  DELETE FROM public.automation_settings WHERE clinica_id = _clinica_id;
  DELETE FROM public.clinicas            WHERE id = _clinica_id;

  RETURN jsonb_build_object('success', true, 'nome', v_nome);
END;
$$;

-- ─── A lista do painel passa a dizer se está arquivada ─────────────────────
DROP FUNCTION IF EXISTS public.platform_get_clinicas_overview();
CREATE OR REPLACE FUNCTION public.platform_get_clinicas_overview()
RETURNS TABLE(
  clinica_id uuid, clinica_nome text, owner_id uuid, owner_nome text, owner_email text,
  created_at timestamptz, plano_slug text, plano_nome text, assinatura_status text,
  em_trial boolean, trial_fim timestamptz,
  total_medicos bigint, total_funcionarios bigint, total_pacientes bigint, total_agendamentos bigint,
  arquivada boolean, arquivada_em timestamptz, arquivada_motivo text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Acesso negado: somente administradores da plataforma.';
  END IF;

  RETURN QUERY
  SELECT
    c.id, c.nome, c.owner_id, p.nome, p.email, c.created_at,
    ap.plano_slug, pl.nome, ap.status, ap.em_trial, ap.trial_fim,
    (SELECT COUNT(*) FROM public.medicos m WHERE m.clinica_id = c.id AND m.ativo = true),
    (SELECT COUNT(*) FROM public.funcionarios f WHERE f.clinica_id = c.id),
    (SELECT COUNT(*) FROM public.pacientes pa WHERE pa.clinica_id = c.id),
    (SELECT COUNT(*) FROM public.agendamentos ag WHERE ag.clinica_id = c.id),
    c.arquivada, c.arquivada_em, c.arquivada_motivo
  FROM public.clinicas c
  LEFT JOIN public.profiles p ON p.id = c.owner_id
  LEFT JOIN public.assinaturas_plano ap ON ap.user_id = c.owner_id AND ap.status IN ('ativa','trial')
  LEFT JOIN public.planos pl ON pl.id = ap.plano_id
  ORDER BY c.arquivada, c.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_arquivar_clinica(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_desarquivar_clinica(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_conteudo_da_clinica(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_excluir_clinica_vazia(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_arquivar_clinica(uuid, text)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_desarquivar_clinica(uuid)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_conteudo_da_clinica(uuid)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_excluir_clinica_vazia(uuid, text)  TO authenticated;

-- ─── A dona do SaaS passa a enxergar a lista de clínicas ───────────────────
--
-- `clinicas_select` era só `id = profiles.clinica_id`, e o administrador da
-- plataforma não tem clínica: ele via ZERO clínicas na tabela. Foi por isso que
-- `platform_get_clinicas_overview` nasceu SECURITY DEFINER — a RPC existia para
-- contornar a própria política.
--
-- O contorno vaza: qualquer tela nova que leia `clinicas` direto volta vazia
-- para ele, sem erro, e ninguém entende. `clinicas` guarda nome, CNPJ e plano —
-- não guarda paciente. Ler a lista de clientes é literalmente o trabalho dele.
DROP POLICY IF EXISTS clinicas_select ON public.clinicas;
CREATE POLICY clinicas_select ON public.clinicas
  FOR SELECT USING (
    is_platform_admin()
    OR id = (SELECT p.clinica_id FROM public.profiles p WHERE p.id = auth.uid())
  );

COMMIT;
