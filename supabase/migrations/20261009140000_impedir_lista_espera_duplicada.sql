-- Prevent simultaneous active wait-list requests with the same clinic,
-- patient, specialty, and optional doctor. Existing duplicate rows are kept.
CREATE OR REPLACE FUNCTION public.impedir_pedido_ativo_duplicado_lista_espera()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chave text;
BEGIN
  IF NEW.status IS NULL OR NEW.status NOT IN ('aguardando', 'notificado', 'confirmado') THEN
    RETURN NEW;
  END IF;

  -- Let legacy duplicates progress through active statuses unless their
  -- identifying fields change. New requests and reactivations are checked.
  IF TG_OP = 'UPDATE'
    AND OLD.status IN ('aguardando', 'notificado', 'confirmado')
    AND OLD.clinica_id = NEW.clinica_id
    AND OLD.paciente_id = NEW.paciente_id
    AND OLD.medico_id IS NOT DISTINCT FROM NEW.medico_id
    AND OLD.especialidade = NEW.especialidade THEN
    RETURN NEW;
  END IF;

  v_chave := concat_ws(
    '|',
    NEW.clinica_id::text,
    NEW.paciente_id::text,
    coalesce(NEW.medico_id::text, '<sem-medico>'),
    NEW.especialidade
  );

  -- Serialize writes for this logical request while retaining legacy rows.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_chave, 179202612));

  IF EXISTS (
    SELECT 1
    FROM public.lista_espera AS le
    WHERE le.clinica_id = NEW.clinica_id
      AND le.paciente_id = NEW.paciente_id
      AND le.medico_id IS NOT DISTINCT FROM NEW.medico_id
      AND le.especialidade = NEW.especialidade
      AND le.status IN ('aguardando', 'notificado', 'confirmado')
      AND le.id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'Este pedido já está na lista de espera.'
      USING ERRCODE = '23505',
            CONSTRAINT = 'lista_espera_pedido_ativo_unico';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.impedir_pedido_ativo_duplicado_lista_espera() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_impedir_pedido_ativo_duplicado_lista_espera
  ON public.lista_espera;

CREATE TRIGGER trg_impedir_pedido_ativo_duplicado_lista_espera
  BEFORE INSERT OR UPDATE OF clinica_id, paciente_id, medico_id, especialidade, status
  ON public.lista_espera
  FOR EACH ROW
  EXECUTE FUNCTION public.impedir_pedido_ativo_duplicado_lista_espera();

COMMENT ON FUNCTION public.impedir_pedido_ativo_duplicado_lista_espera() IS
  'Impede novas solicitações ativas duplicadas na lista de espera sem remover dados históricos.';
