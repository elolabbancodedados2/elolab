-- Alterar a regra de repasse médico passa a exigir confirmação explícita e
-- grava quem alterou, quando, e os valores anterior e novo.
-- A versão antiga (sem confirmação) é desativada: publique a tela junto com
-- esta migration.
BEGIN;

CREATE TABLE IF NOT EXISTS public.repasse_regra_alteracoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE RESTRICT,
  medico_id uuid NOT NULL REFERENCES public.medicos(id) ON DELETE RESTRICT,
  tipo_anterior text NOT NULL,
  valor_anterior numeric(12,2) NOT NULL,
  tipo_novo text NOT NULL CHECK (tipo_novo IN ('percentual', 'fixo')),
  valor_novo numeric(12,2) NOT NULL CHECK (valor_novo >= 0),
  alterado_por uuid NOT NULL REFERENCES auth.users(id),
  alterado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_repasse_regra_alteracoes_medico
  ON public.repasse_regra_alteracoes (clinica_id, medico_id, alterado_em DESC);

ALTER TABLE public.repasse_regra_alteracoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.repasse_regra_alteracoes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.repasse_regra_alteracoes TO authenticated;
GRANT ALL ON public.repasse_regra_alteracoes TO service_role;
DROP POLICY IF EXISTS repasse_regra_alteracoes_select ON public.repasse_regra_alteracoes;
CREATE POLICY repasse_regra_alteracoes_select ON public.repasse_regra_alteracoes FOR SELECT TO authenticated
  USING (public.can_access_financial(auth.uid()) AND public.is_same_clinica(clinica_id));

CREATE OR REPLACE FUNCTION public.configurar_repasse_medico(
  p_medico_id uuid, p_tipo text, p_valor numeric, p_confirmado boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinica uuid := public.get_my_clinica_id();
  v_medico public.medicos%ROWTYPE;
  v_valor_anterior numeric(12,2);
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_access_financial(auth.uid())
     OR p_tipo NOT IN ('percentual', 'fixo') OR p_valor IS NULL OR p_valor < 0
     OR p_valor <> round(p_valor, 2)
     OR (p_tipo = 'percentual' AND p_valor > 100) THEN
    RAISE EXCEPTION 'Configuracao de repasse invalida';
  END IF;
  IF p_confirmado IS NOT TRUE THEN
    RAISE EXCEPTION 'Confirme a alteração da regra de repasse';
  END IF;

  SELECT * INTO v_medico FROM public.medicos
   WHERE id = p_medico_id AND clinica_id = v_clinica
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Medico nao encontrado'; END IF;

  v_valor_anterior := CASE WHEN v_medico.tipo_repasse = 'fixo' THEN v_medico.valor_repasse_fixo ELSE v_medico.percentual_repasse END;
  IF v_medico.tipo_repasse = p_tipo AND v_valor_anterior = p_valor THEN
    RETURN jsonb_build_object('success', true, 'alterado', false);
  END IF;

  UPDATE public.medicos
     SET tipo_repasse = p_tipo,
         percentual_repasse = CASE WHEN p_tipo = 'percentual' THEN p_valor ELSE percentual_repasse END,
         valor_repasse_fixo = CASE WHEN p_tipo = 'fixo' THEN p_valor ELSE valor_repasse_fixo END
   WHERE id = v_medico.id;

  INSERT INTO public.repasse_regra_alteracoes (clinica_id, medico_id, tipo_anterior, valor_anterior, tipo_novo, valor_novo, alterado_por)
  VALUES (v_clinica, v_medico.id, v_medico.tipo_repasse, COALESCE(v_valor_anterior, 0), p_tipo, p_valor, auth.uid());

  RETURN jsonb_build_object('success', true, 'alterado', true);
END;
$$;

-- Versões sem confirmação deixam de alterar a regra.
CREATE OR REPLACE FUNCTION public.configurar_repasse_medico(p_medico_id uuid, p_tipo text, p_valor numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'Confirme a alteração da regra de repasse';
END;
$$;
CREATE OR REPLACE FUNCTION public.configurar_percentual_repasse(p_medico_id uuid, p_percentual numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'Confirme a alteração da regra de repasse';
END;
$$;

CREATE OR REPLACE FUNCTION public.historico_regras_repasse(p_limite integer DEFAULT 50)
RETURNS TABLE (
  id uuid, medico_id uuid, tipo_anterior text, valor_anterior numeric, tipo_novo text, valor_novo numeric,
  alterado_por_nome text, alterado_em timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT h.id, h.medico_id, h.tipo_anterior, h.valor_anterior, h.tipo_novo, h.valor_novo,
         p.nome, h.alterado_em
    FROM public.repasse_regra_alteracoes h
    LEFT JOIN public.profiles p ON p.id = h.alterado_por
   WHERE public.can_access_financial(auth.uid())
     AND h.clinica_id = public.get_my_clinica_id()
   ORDER BY h.alterado_em DESC, h.id
   LIMIT LEAST(GREATEST(COALESCE(p_limite, 50), 1), 500);
$$;

REVOKE ALL ON FUNCTION public.configurar_repasse_medico(uuid, text, numeric, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.configurar_repasse_medico(uuid, text, numeric, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.configurar_repasse_medico(uuid, text, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.configurar_percentual_repasse(uuid, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.historico_regras_repasse(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.historico_regras_repasse(integer) TO authenticated;

COMMIT;
