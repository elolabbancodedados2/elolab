ALTER TABLE public.medicos
  ADD COLUMN IF NOT EXISTS percentual_repasse numeric(5,2) NOT NULL DEFAULT 0
  CHECK (percentual_repasse BETWEEN 0 AND 100);

CREATE TABLE IF NOT EXISTS public.repasses_medicos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE RESTRICT,
  medico_id uuid NOT NULL REFERENCES public.medicos(id) ON DELETE RESTRICT,
  lancamento_id uuid NOT NULL REFERENCES public.lancamentos(id) ON DELETE RESTRICT,
  competencia date NOT NULL,
  valor_base numeric(12,2) NOT NULL CHECK (valor_base >= 0),
  percentual numeric(5,2) NOT NULL CHECK (percentual BETWEEN 0 AND 100),
  valor_repasse numeric(12,2) NOT NULL CHECK (valor_repasse >= 0),
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aprovado','pago','cancelado')),
  aprovado_em timestamptz,
  pago_em timestamptz,
  observacoes text,
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lancamento_id)
);

CREATE INDEX IF NOT EXISTS idx_repasses_clinica_competencia
  ON public.repasses_medicos(clinica_id, competencia DESC);
CREATE INDEX IF NOT EXISTS idx_repasses_medico_status
  ON public.repasses_medicos(medico_id, status);

ALTER TABLE public.repasses_medicos ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.repasses_medicos TO authenticated;
GRANT ALL ON public.repasses_medicos TO service_role;

CREATE POLICY repasses_financeiro_select ON public.repasses_medicos FOR SELECT TO authenticated
  USING (public.can_access_financial(auth.uid()) AND public.is_same_clinica(clinica_id));
CREATE POLICY repasses_financeiro_insert ON public.repasses_medicos FOR INSERT TO authenticated
  WITH CHECK (public.can_access_financial(auth.uid()) AND clinica_id = public.get_my_clinica_id());
CREATE POLICY repasses_financeiro_update ON public.repasses_medicos FOR UPDATE TO authenticated
  USING (public.can_access_financial(auth.uid()) AND public.is_same_clinica(clinica_id))
  WITH CHECK (clinica_id = public.get_my_clinica_id());

DROP TRIGGER IF EXISTS update_repasses_medicos_updated_at ON public.repasses_medicos;
CREATE TRIGGER update_repasses_medicos_updated_at BEFORE UPDATE ON public.repasses_medicos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.gerar_repasses_medicos(p_competencia date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinica uuid := public.get_my_clinica_id();
  v_count integer;
BEGIN
  IF NOT public.can_access_financial(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso financeiro necessário';
  END IF;

  INSERT INTO public.repasses_medicos
    (clinica_id, medico_id, lancamento_id, competencia, valor_base, percentual, valor_repasse)
  SELECT l.clinica_id, a.medico_id, l.id, date_trunc('month', p_competencia)::date,
         COALESCE(l.valor_pago, l.valor), m.percentual_repasse,
         round(COALESCE(l.valor_pago, l.valor) * m.percentual_repasse / 100, 2)
    FROM public.lancamentos l
    JOIN public.agendamentos a ON a.id = l.agendamento_id AND a.clinica_id = l.clinica_id
    JOIN public.medicos m ON m.id = a.medico_id AND m.clinica_id = l.clinica_id
   WHERE l.clinica_id = v_clinica
     AND l.tipo = 'receita' AND l.status = 'pago'
     AND l.data >= date_trunc('month', p_competencia)::date
     AND l.data < (date_trunc('month', p_competencia) + interval '1 month')::date
     AND m.percentual_repasse > 0
  ON CONFLICT (lancamento_id) DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.gerar_repasses_medicos(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gerar_repasses_medicos(date) TO authenticated;

CREATE OR REPLACE FUNCTION public.configurar_percentual_repasse(p_medico_id uuid, p_percentual numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_access_financial(auth.uid()) OR p_percentual < 0 OR p_percentual > 100 THEN
    RAISE EXCEPTION 'Operação inválida';
  END IF;
  UPDATE public.medicos SET percentual_repasse = p_percentual
   WHERE id = p_medico_id AND clinica_id = public.get_my_clinica_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'Médico não encontrado'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.configurar_percentual_repasse(uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.configurar_percentual_repasse(uuid, numeric) TO authenticated;
COMMENT ON TABLE public.repasses_medicos IS 'Repasse médico calculado sobre receitas quitadas, com trilha de aprovação e pagamento.';
