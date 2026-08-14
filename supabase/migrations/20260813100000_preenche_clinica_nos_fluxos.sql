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

-- Subquery por origem em vez de UPDATE..FROM com JOIN.
--
-- A versão anterior fazia `FROM pacientes p LEFT JOIN exames e ON e.id =
-- c.exame_id`, e o Postgres recusa: a tabela ALVO do UPDATE (`c`) não pode ser
-- referenciada na condição de JOIN do FROM —
-- "invalid reference to FROM-clause entry for table c" (42P01).
-- A migration inteira abortava, então nada deste arquivo era aplicado.
UPDATE public.coletas_laboratorio c
   SET clinica_id = COALESCE(
         (SELECT e.clinica_id FROM public.exames   e WHERE e.id = c.exame_id),
         (SELECT p.clinica_id FROM public.pacientes p WHERE p.id = c.paciente_id),
         (SELECT m.clinica_id FROM public.medicos  m WHERE m.id = c.medico_solicitante_id)
       )
 WHERE c.clinica_id IS NULL
   AND COALESCE(
         (SELECT e.clinica_id FROM public.exames   e WHERE e.id = c.exame_id),
         (SELECT p.clinica_id FROM public.pacientes p WHERE p.id = c.paciente_id),
         (SELECT m.clinica_id FROM public.medicos  m WHERE m.id = c.medico_solicitante_id)
       ) IS NOT NULL;

COMMIT;
