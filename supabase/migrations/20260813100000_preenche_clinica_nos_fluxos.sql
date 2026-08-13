BEGIN;

-- A fila e as coletas podem ser criadas por automações que recebem apenas o
-- id do agendamento/exame. Sem este preenchimento, a política de INSERT aceita
-- clinica_id nulo, mas a política de SELECT da própria clínica não enxerga a
-- linha depois. O paciente fica preso num estado que só aparece para o banco.
CREATE OR REPLACE FUNCTION public.preencher_clinica_nos_fluxos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.clinica_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'fila_atendimento' THEN
    SELECT a.clinica_id
      INTO NEW.clinica_id
      FROM public.agendamentos a
     WHERE a.id = NEW.agendamento_id;
  ELSIF TG_TABLE_NAME = 'coletas_laboratorio' THEN
    SELECT COALESCE(e.clinica_id, p.clinica_id, m.clinica_id)
      INTO NEW.clinica_id
      FROM public.pacientes p
      LEFT JOIN public.exames e ON e.id = NEW.exame_id
      LEFT JOIN public.medicos m ON m.id = NEW.medico_solicitante_id
     WHERE p.id = NEW.paciente_id;
  END IF;

  -- Fallback para registros sem relacionamento completo, sempre limitado ao
  -- usuário autenticado que disparou a automação.
  IF NEW.clinica_id IS NULL THEN
    SELECT p.clinica_id
      INTO NEW.clinica_id
      FROM public.profiles p
     WHERE p.id = auth.uid();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS preencher_clinica_fila ON public.fila_atendimento;
CREATE TRIGGER preencher_clinica_fila
  BEFORE INSERT ON public.fila_atendimento
  FOR EACH ROW
  EXECUTE FUNCTION public.preencher_clinica_nos_fluxos();

DROP TRIGGER IF EXISTS preencher_clinica_coleta ON public.coletas_laboratorio;
CREATE TRIGGER preencher_clinica_coleta
  BEFORE INSERT ON public.coletas_laboratorio
  FOR EACH ROW
  EXECUTE FUNCTION public.preencher_clinica_nos_fluxos();

-- Recupera registros antigos que foram gravados sem o vínculo da clínica.
UPDATE public.fila_atendimento f
   SET clinica_id = a.clinica_id
  FROM public.agendamentos a
 WHERE f.agendamento_id = a.id
   AND f.clinica_id IS NULL
   AND a.clinica_id IS NOT NULL;

UPDATE public.coletas_laboratorio c
   SET clinica_id = COALESCE(e.clinica_id, p.clinica_id, m.clinica_id)
  FROM public.pacientes p
  LEFT JOIN public.exames e ON e.id = c.exame_id
  LEFT JOIN public.medicos m ON m.id = c.medico_solicitante_id
 WHERE c.paciente_id = p.id
   AND c.clinica_id IS NULL
   AND COALESCE(e.clinica_id, p.clinica_id, m.clinica_id) IS NOT NULL;

COMMIT;
