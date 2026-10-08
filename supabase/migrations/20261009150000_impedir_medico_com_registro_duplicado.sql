-- Prevent new duplicate professional registrations inside a clinic while
-- leaving any existing duplicate records available for review and correction.
CREATE OR REPLACE FUNCTION public.impedir_medico_com_registro_duplicado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tipo text;
  v_registro text;
  v_uf text;
  v_chave text;
BEGIN
  v_tipo := upper(btrim(coalesce(NEW.tipo_registro, 'CRM')));
  v_registro := upper(regexp_replace(btrim(coalesce(NEW.crm, '')), '\s+', '', 'g'));
  v_uf := upper(btrim(coalesce(NEW.crm_uf, '')));

  IF NEW.clinica_id IS NULL OR v_registro = '' THEN
    RETURN NEW;
  END IF;

  -- Allow ordinary edits to legacy duplicate rows. Reassigning the
  -- registration identity still runs through the duplicate check below.
  IF TG_OP = 'UPDATE'
    AND OLD.clinica_id IS NOT DISTINCT FROM NEW.clinica_id
    AND upper(btrim(coalesce(OLD.tipo_registro, 'CRM'))) = v_tipo
    AND upper(regexp_replace(btrim(coalesce(OLD.crm, '')), '\s+', '', 'g')) = v_registro
    AND upper(btrim(coalesce(OLD.crm_uf, ''))) = v_uf THEN
    RETURN NEW;
  END IF;

  v_chave := concat_ws('|', NEW.clinica_id::text, v_tipo, v_registro, v_uf);
  PERFORM pg_advisory_xact_lock(hashtextextended(v_chave, 179202613));

  IF EXISTS (
    SELECT 1
    FROM public.medicos AS m
    WHERE m.clinica_id = NEW.clinica_id
      AND upper(btrim(coalesce(m.tipo_registro, 'CRM'))) = v_tipo
      AND upper(regexp_replace(btrim(coalesce(m.crm, '')), '\s+', '', 'g')) = v_registro
      AND upper(btrim(coalesce(m.crm_uf, ''))) = v_uf
      AND m.id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'Já existe um profissional com esse registro nesta clínica.'
      USING ERRCODE = '23505',
            CONSTRAINT = 'medicos_registro_clinica_unico';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.impedir_medico_com_registro_duplicado() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_impedir_medico_com_registro_duplicado ON public.medicos;
CREATE TRIGGER trg_impedir_medico_com_registro_duplicado
  BEFORE INSERT OR UPDATE OF clinica_id, tipo_registro, crm, crm_uf
  ON public.medicos
  FOR EACH ROW
  EXECUTE FUNCTION public.impedir_medico_com_registro_duplicado();

COMMENT ON FUNCTION public.impedir_medico_com_registro_duplicado() IS
  'Evita novos cadastros com o mesmo registro profissional na clínica, preservando duplicidades históricas.';
