BEGIN;

ALTER TABLE public.prescricoes
  ADD COLUMN IF NOT EXISTS alertas_seguranca jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS justificativa_alerta text,
  ADD COLUMN IF NOT EXISTS alerta_confirmado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS alerta_confirmado_em timestamptz;

CREATE OR REPLACE FUNCTION public.validar_auditoria_alerta_prescricao()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_tem_alertas boolean;
  v_override_alergia boolean;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.alertas_seguranca IS DISTINCT FROM OLD.alertas_seguranca
       OR NEW.justificativa_alerta IS DISTINCT FROM OLD.justificativa_alerta
       OR NEW.alerta_confirmado_por IS DISTINCT FROM OLD.alerta_confirmado_por
       OR NEW.alerta_confirmado_em IS DISTINCT FROM OLD.alerta_confirmado_em THEN
      RAISE EXCEPTION 'O registro de alertas e justificativa da prescricao e imutavel.'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF jsonb_typeof(NEW.alertas_seguranca) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Os alertas de seguranca devem ser uma lista.'
      USING ERRCODE = 'check_violation';
  END IF;

  v_tem_alertas := jsonb_array_length(NEW.alertas_seguranca) > 0;
  IF length(COALESCE(NEW.justificativa_alerta, '')) > 1000 THEN
    RAISE EXCEPTION 'A justificativa da prescricao excede o limite de 1.000 caracteres.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(NEW.alertas_seguranca) AS alerta
    WHERE COALESCE(alerta->>'id', '') LIKE 'allergy-%'
      AND alerta->'canIgnore' = 'true'::jsonb
  ) INTO v_override_alergia;

  IF v_tem_alertas THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'A confirmacao de alertas exige um profissional autenticado.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    NEW.alerta_confirmado_por := auth.uid();
    NEW.alerta_confirmado_em := now();
  ELSE
    NEW.alerta_confirmado_por := NULL;
    NEW.alerta_confirmado_em := NULL;
  END IF;

  IF v_override_alergia THEN
    IF length(btrim(COALESCE(NEW.justificativa_alerta, ''))) < 20 THEN
      RAISE EXCEPTION 'Uma justificativa clinica de pelo menos 20 caracteres e obrigatoria para prosseguir diante de alerta de alergia.'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    NEW.justificativa_alerta := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_auditoria_alerta_prescricao ON public.prescricoes;
DROP TRIGGER IF EXISTS trg_validar_auditoria_alerta_prescricao ON public.prescricoes;
CREATE TRIGGER trg_validar_auditoria_alerta_prescricao
  BEFORE INSERT OR UPDATE ON public.prescricoes
  FOR EACH ROW EXECUTE FUNCTION public.validar_auditoria_alerta_prescricao();

COMMENT ON COLUMN public.prescricoes.alertas_seguranca IS
  'Snapshot dos alertas confirmados no momento da emissao.';
COMMENT ON COLUMN public.prescricoes.justificativa_alerta IS
  'Justificativa clinica imutavel para prosseguir diante de alerta de alergia ignoravel.';
COMMENT ON COLUMN public.prescricoes.alerta_confirmado_por IS
  'Usuario autenticado que confirmou os alertas da prescricao.';
COMMENT ON COLUMN public.prescricoes.alerta_confirmado_em IS
  'Instante em que os alertas da prescricao foram confirmados.';

COMMIT;
