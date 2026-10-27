-- O formulário oferecia os tipos de consulta da clínica ("Clínico geral",
-- "Pediatra"), mas agendamentos.tipo só aceita valores genéricos e a cobrança
-- procura o preço pelo nome — então consulta nunca achava preço e o check-in
-- falhava. O agendamento passa a guardar qual tipo da clínica foi escolhido;
-- `tipo` continua genérico ("consulta"/"retorno") para os fluxos existentes.

ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS tipo_consulta_id uuid
  REFERENCES public.tipos_consulta(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agendamentos_tipo_consulta_id
  ON public.agendamentos (tipo_consulta_id)
  WHERE tipo_consulta_id IS NOT NULL;

-- O tipo escolhido precisa ser da mesma clínica do agendamento.
CREATE OR REPLACE FUNCTION public.validar_tipo_consulta_agendamento()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.tipo_consulta_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.tipo_consulta_id IS NOT DISTINCT FROM OLD.tipo_consulta_id
     AND NEW.clinica_id IS NOT DISTINCT FROM OLD.clinica_id THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.tipos_consulta t
     WHERE t.id = NEW.tipo_consulta_id
       AND t.clinica_id IS NOT DISTINCT FROM NEW.clinica_id
  ) THEN
    RAISE EXCEPTION 'O tipo de consulta escolhido não pertence a esta clínica.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS zz_agendamentos_validar_tipo_consulta ON public.agendamentos;
-- Nome começa com "z" para rodar depois de trg_fill_clinica_id, que preenche clinica_id.
CREATE TRIGGER zz_agendamentos_validar_tipo_consulta
  BEFORE INSERT OR UPDATE OF tipo_consulta_id, clinica_id ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.validar_tipo_consulta_agendamento();
