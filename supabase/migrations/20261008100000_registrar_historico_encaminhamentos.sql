-- Preserva o histórico de status dos encaminhamentos e permite consulta
-- somente por profissionais da mesma clínica.
BEGIN;

ALTER TABLE public.encaminhamento_status_history
  ADD COLUMN IF NOT EXISTS usuario_nome text;

ALTER TABLE public.encaminhamento_status_history ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.encaminhamento_status_history FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON public.encaminhamento_status_history FROM authenticated;
GRANT SELECT ON public.encaminhamento_status_history TO authenticated;

DROP POLICY IF EXISTS encaminhamento_status_history_select_scoped
  ON public.encaminhamento_status_history;
CREATE POLICY encaminhamento_status_history_select_scoped
  ON public.encaminhamento_status_history
  FOR SELECT TO authenticated
  USING (
    can_access_clinical(auth.uid())
    AND EXISTS (
      SELECT 1
        FROM public.encaminhamentos AS e
       WHERE e.id = encaminhamento_id
         AND is_same_clinica(e.clinica_id)
    )
  );

CREATE OR REPLACE FUNCTION public.registrar_historico_status_encaminhamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usuario_nome text;
  v_status_anterior text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
      RETURN NEW;
    END IF;
    v_status_anterior := OLD.status;
  END IF;

  SELECT p.nome
    INTO v_usuario_nome
    FROM public.profiles AS p
   WHERE p.id = auth.uid()
     AND p.clinica_id = NEW.clinica_id;

  INSERT INTO public.encaminhamento_status_history (
    encaminhamento_id,
    status_anterior,
    status_novo,
    usuario_id,
    usuario_nome,
    comentario
  ) VALUES (
    NEW.id,
    v_status_anterior,
    COALESCE(NEW.status, 'pendente'),
    auth.uid(),
    v_usuario_nome,
    CASE WHEN TG_OP = 'INSERT' THEN 'Encaminhamento criado' ELSE NULL END
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_historico_status_encaminhamento() FROM PUBLIC;

DROP TRIGGER IF EXISTS registrar_historico_status_encaminhamento
  ON public.encaminhamentos;
CREATE TRIGGER registrar_historico_status_encaminhamento
  AFTER INSERT OR UPDATE ON public.encaminhamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.registrar_historico_status_encaminhamento();

COMMENT ON TABLE public.encaminhamento_status_history IS
  'Histórico imutável de criação e mudanças de status dos encaminhamentos, consultável pela clínica responsável.';

COMMIT;
