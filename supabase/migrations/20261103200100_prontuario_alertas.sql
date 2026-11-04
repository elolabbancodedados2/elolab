BEGIN;

ALTER TABLE public.prontuarios
  ADD COLUMN IF NOT EXISTS alertas_seguranca jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS justificativa_alerta text,
  ADD COLUMN IF NOT EXISTS tipo_receita text NOT NULL DEFAULT 'simples'
    CHECK (tipo_receita IN ('simples', 'controle_especial', 'antimicrobiano'));

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
    WHERE (COALESCE(alerta->>'id', '') LIKE 'allergy-%' OR alerta->>'severity' IN ('critical', 'warning'))
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
      RAISE EXCEPTION 'Uma justificativa clinica de pelo menos 20 caracteres e obrigatoria para prosseguir diante dos alertas.'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    NEW.justificativa_alerta := NULL;
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
