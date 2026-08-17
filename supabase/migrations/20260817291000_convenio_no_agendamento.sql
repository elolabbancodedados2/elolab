BEGIN;

ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS convenio_id uuid REFERENCES public.convenios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agendamentos_convenio_id ON public.agendamentos(convenio_id);

UPDATE public.agendamentos a SET convenio_id = p.convenio_id
  FROM public.pacientes p
 WHERE p.id = a.paciente_id AND a.convenio_id IS NULL AND p.convenio_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.preencher_convenio_agendamento()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.convenio_id IS NULL THEN
    SELECT convenio_id INTO NEW.convenio_id FROM public.pacientes WHERE id = NEW.paciente_id;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_preencher_convenio_agendamento ON public.agendamentos;
CREATE TRIGGER trg_preencher_convenio_agendamento
BEFORE INSERT OR UPDATE OF paciente_id, convenio_id ON public.agendamentos
FOR EACH ROW EXECUTE FUNCTION public.preencher_convenio_agendamento();

COMMENT ON COLUMN public.agendamentos.convenio_id IS
  'Convênio usado para resolver o preço da consulta/exame dentro da finalização transacional.';

COMMIT;
