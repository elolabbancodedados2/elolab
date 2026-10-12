-- Tarefas devem sempre nascer na clÃ­nica do usuÃ¡rio e com autoria verdadeira.
DROP POLICY IF EXISTS "tarefas_insert_v2" ON public.tarefas;
DROP POLICY IF EXISTS "tarefas_insert_tenant" ON public.tarefas;

CREATE POLICY "tarefas_insert_tenant" ON public.tarefas
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_any_role(auth.uid())
    AND clinica_id = public.get_my_clinica_id()
    AND criado_por = auth.uid()
  );

-- A autoria Ã© usada para limitar exclusÃ£o. Sem este guard, um usuÃ¡rio da
-- clÃ­nica poderia alterar criado_por de uma tarefa alheia e depois excluÃ­-la.
CREATE OR REPLACE FUNCTION public.impedir_alteracao_autoria_tarefa()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NEW.criado_por IS DISTINCT FROM OLD.criado_por THEN
    RAISE EXCEPTION 'A autoria da tarefa nÃ£o pode ser alterada.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tarefas_autoria_imutavel ON public.tarefas;
CREATE TRIGGER tarefas_autoria_imutavel
  BEFORE UPDATE OF criado_por ON public.tarefas
  FOR EACH ROW EXECUTE FUNCTION public.impedir_alteracao_autoria_tarefa();
