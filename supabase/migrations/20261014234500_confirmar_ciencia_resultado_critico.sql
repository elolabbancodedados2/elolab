CREATE TABLE IF NOT EXISTS public.resultado_critico_confirmacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  resultado_id uuid NOT NULL REFERENCES public.resultados_laboratorio(id) ON DELETE RESTRICT,
  numero_versao integer NOT NULL CHECK (numero_versao > 0),
  conduta text NOT NULL CHECK (length(btrim(conduta)) BETWEEN 10 AND 2000),
  confirmado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  confirmado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resultado_critico_confirmacoes_resultado_versao_key UNIQUE (resultado_id, numero_versao)
);

CREATE INDEX IF NOT EXISTS resultado_critico_confirmacoes_clinica_resultado_idx
  ON public.resultado_critico_confirmacoes (clinica_id, resultado_id, numero_versao DESC);

ALTER TABLE public.resultado_critico_confirmacoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.resultado_critico_confirmacoes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.resultado_critico_confirmacoes TO authenticated;

DROP POLICY IF EXISTS resultado_critico_confirmacoes_select ON public.resultado_critico_confirmacoes;
CREATE POLICY resultado_critico_confirmacoes_select
  ON public.resultado_critico_confirmacoes FOR SELECT TO authenticated
  USING (
    public.is_same_clinica(clinica_id)
    AND public.can_access_clinical(auth.uid())
  );

CREATE OR REPLACE FUNCTION public.confirmar_ciencia_resultado_critico(
  p_resultado_id uuid,
  p_conduta text
)
RETURNS TABLE (
  resultado_id uuid,
  numero_versao integer,
  conduta text,
  confirmado_por uuid,
  confirmado_em timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinica_id uuid;
  v_resultado public.resultados_laboratorio%ROWTYPE;
BEGIN
  v_clinica_id := public.get_my_clinica_id();
  IF auth.uid() IS NULL OR v_clinica_id IS NULL
    OR NOT public.is_same_clinica(v_clinica_id)
    OR NOT (public.is_admin(auth.uid()) OR public.is_medico(auth.uid())) THEN
    RAISE EXCEPTION 'Somente médico ou administrador da clínica pode confirmar resultado crítico.'
      USING ERRCODE = '42501';
  END IF;

  IF p_conduta IS NULL OR length(btrim(p_conduta)) < 10 OR length(btrim(p_conduta)) > 2000 THEN
    RAISE EXCEPTION 'Registre a conduta com 10 a 2000 caracteres.' USING ERRCODE = '23514';
  END IF;

  SELECT r.* INTO v_resultado
    FROM public.resultados_laboratorio r
   WHERE r.id = p_resultado_id AND r.clinica_id = v_clinica_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Resultado não encontrado na clínica atual.' USING ERRCODE = 'P0002';
  END IF;
  IF v_resultado.critico IS NOT TRUE THEN
    RAISE EXCEPTION 'Somente resultados marcados como críticos podem ter ciência registrada.' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.resultado_critico_confirmacoes (
    clinica_id, resultado_id, numero_versao, conduta, confirmado_por
  ) VALUES (
    v_clinica_id, v_resultado.id, v_resultado.numero_versao, btrim(p_conduta), auth.uid()
  ) ON CONFLICT ON CONSTRAINT resultado_critico_confirmacoes_resultado_versao_key DO NOTHING;

  RETURN QUERY
    SELECT c.resultado_id, c.numero_versao, c.conduta, c.confirmado_por, c.confirmado_em
      FROM public.resultado_critico_confirmacoes c
     WHERE c.resultado_id = v_resultado.id AND c.numero_versao = v_resultado.numero_versao;
END;
$$;

REVOKE ALL ON FUNCTION public.confirmar_ciencia_resultado_critico(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirmar_ciencia_resultado_critico(uuid, text) TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
    AND NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'resultado_critico_confirmacoes'
    ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.resultado_critico_confirmacoes;
  END IF;
END;
$$;
