-- Recursos contratados e uso do plano decididos no servidor.
--
-- 1. plano_vigente_clinica(): assinatura do dono da clínica que está ativa ou
--    em teste, dentro da vigência e sem fatura recorrente vencida há 72 horas.
-- 2. clinica_recurso_plano_liberado(): usado pelas Edge Functions (service
--    role) antes de liberar um recurso do plano, como o Agente de IA.
-- 3. uso_plano_clinica(): limites da equipe e uso atual para a própria
--    clínica, com o mesmo plano usado por validarLimitesDeEquipe e o horário
--    em que o servidor fez a contagem.
-- Aditiva e idempotente: só cria ou substitui funções.

CREATE OR REPLACE FUNCTION public.plano_vigente_clinica(p_clinica_id uuid)
RETURNS TABLE (plano_id uuid, plano_slug text, plano_nome text, status text, features jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT pl.id, pl.slug, pl.nome, ap.status, COALESCE(pl.features, '[]'::jsonb)
    FROM public.clinicas c
    JOIN public.assinaturas_plano ap ON ap.user_id = c.owner_id
    JOIN public.planos pl ON pl.id = ap.plano_id
   WHERE c.id = p_clinica_id
     AND ap.status IN ('ativa', 'trial')
     AND COALESCE(CASE WHEN ap.status = 'trial' THEN ap.trial_fim ELSE ap.data_fim END, 'infinity'::timestamptz) > now()
     AND NOT public.platform_plan_recurring_payment_overdue(c.owner_id)
   ORDER BY ap.created_at DESC
   LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.plano_vigente_clinica(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.plano_vigente_clinica(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.clinica_recurso_plano_liberado(p_clinica_id uuid, p_recurso text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.plano_vigente_clinica(p_clinica_id) v
     WHERE jsonb_typeof(v.features) = 'array'
       AND v.features ? p_recurso
  );
$function$;

COMMENT ON FUNCTION public.clinica_recurso_plano_liberado(uuid, text) IS
  'Verdadeiro só quando o dono da clínica tem assinatura ativa/teste vigente, sem fatura recorrente vencida, cujo plano inclui o recurso.';

REVOKE ALL ON FUNCTION public.clinica_recurso_plano_liberado(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clinica_recurso_plano_liberado(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.uso_plano_clinica()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_clinica uuid := public.get_my_clinica_id();
  v_plano public.planos%ROWTYPE;
  v_funcionarios bigint;
  v_medicos bigint;
  v_recepcao bigint;
BEGIN
  IF v_clinica IS NULL OR NOT public.has_any_role(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso restrito à equipe da clínica' USING ERRCODE = '42501';
  END IF;

  -- Mesma ordem de validarLimitesDeEquipe: plano vinculado à clínica, senão o
  -- plano da assinatura vigente do dono.
  SELECT pl.* INTO v_plano
    FROM public.planos pl
   WHERE pl.id = COALESCE(
     (SELECT c.plano_id FROM public.clinicas c WHERE c.id = v_clinica),
     (SELECT v.plano_id FROM public.plano_vigente_clinica(v_clinica) v)
   );

  SELECT count(*) INTO v_funcionarios FROM public.funcionarios f WHERE f.clinica_id = v_clinica AND f.ativo IS TRUE;
  SELECT count(*) INTO v_medicos FROM public.medicos m WHERE m.clinica_id = v_clinica AND m.ativo IS TRUE;
  SELECT count(DISTINCT p.id) INTO v_recepcao
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'recepcao'
   WHERE p.clinica_id = v_clinica AND p.ativo IS TRUE;

  RETURN jsonb_build_object(
    'verificado_em', now(),
    'plano_nome', v_plano.nome,
    'recursos', jsonb_build_array(
      jsonb_build_object('chave', 'funcionarios', 'rotulo', 'Funcionários ativos', 'usado', v_funcionarios, 'limite', v_plano.max_funcionarios_total),
      jsonb_build_object('chave', 'medicos', 'rotulo', 'Médicos ativos', 'usado', v_medicos, 'limite', v_plano.max_medicos),
      jsonb_build_object('chave', 'recepcao', 'rotulo', 'Recepção', 'usado', v_recepcao, 'limite', v_plano.max_recepcao)
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.uso_plano_clinica() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.uso_plano_clinica() TO authenticated;
