BEGIN;

-- Keep the source model revision on each newly issued certificate without
-- copying clinical template content or consent-sensitive CID values.
ALTER TABLE public.atestados
  ADD COLUMN IF NOT EXISTS modelo_atestado_id uuid,
  ADD COLUMN IF NOT EXISTS modelo_atestado_nome text,
  ADD COLUMN IF NOT EXISTS modelo_atestado_atualizado_em timestamptz;

CREATE OR REPLACE FUNCTION public.registrar_versao_modelo_atestado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nome text;
  v_atualizado_em timestamptz;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.modelo_atestado_id IS DISTINCT FROM OLD.modelo_atestado_id
       OR NEW.modelo_atestado_nome IS DISTINCT FROM OLD.modelo_atestado_nome
       OR NEW.modelo_atestado_atualizado_em IS DISTINCT FROM OLD.modelo_atestado_atualizado_em THEN
      RAISE EXCEPTION 'A origem e a versao do modelo do atestado sao imutaveis.'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.modelo_atestado_id IS NULL THEN
    NEW.modelo_atestado_nome := NULL;
    NEW.modelo_atestado_atualizado_em := NULL;
    RETURN NEW;
  END IF;

  SELECT t.nome, COALESCE(t.updated_at, t.created_at, now())
    INTO v_nome, v_atualizado_em
  FROM public.templates_atestado AS t
  WHERE t.id = NEW.modelo_atestado_id
    AND (t.clinica_id IS NULL OR t.clinica_id = NEW.clinica_id)
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'O modelo de atestado nao existe ou nao pertence a clinica atual.'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  NEW.modelo_atestado_nome := v_nome;
  NEW.modelo_atestado_atualizado_em := v_atualizado_em;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS proteger_versao_modelo_atestado ON public.atestados;
CREATE TRIGGER proteger_versao_modelo_atestado
  BEFORE INSERT OR UPDATE ON public.atestados
  FOR EACH ROW EXECUTE FUNCTION public.registrar_versao_modelo_atestado();

COMMENT ON COLUMN public.atestados.modelo_atestado_id IS
  'ID de origem sem FK para preservar procedencia apos remocao do modelo.';
COMMENT ON COLUMN public.atestados.modelo_atestado_nome IS
  'Nome imutavel do modelo usado na emissao.';
COMMENT ON COLUMN public.atestados.modelo_atestado_atualizado_em IS
  'Revisao do modelo capturada pelo banco no momento da emissao.';

COMMIT;
