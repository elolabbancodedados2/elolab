-- Liberação excepcional (pagamento/triagem) só por médico ou administrador.
--
-- A Fila explica a quem está bloqueado qual perfil pode liberar o
-- atendimento. Até aqui só a interface escondia o botão: qualquer perfil com
-- UPDATE em agendamentos podia gravar liberado_sem_pagamento/liberado_sem_triagem.
-- Este trigger torna a explicação verdadeira no banco. Chamadas sem auth.uid()
-- (service role, jobs internos) seguem como antes.

CREATE OR REPLACE FUNCTION public.restringir_liberacao_excepcional()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_liberou_pagamento boolean;
  v_liberou_triagem boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_liberou_pagamento := COALESCE(NEW.liberado_sem_pagamento, false);
    v_liberou_triagem := COALESCE(NEW.liberado_sem_triagem, false);
  ELSE
    v_liberou_pagamento := COALESCE(NEW.liberado_sem_pagamento, false) AND NOT COALESCE(OLD.liberado_sem_pagamento, false);
    v_liberou_triagem := COALESCE(NEW.liberado_sem_triagem, false) AND NOT COALESCE(OLD.liberado_sem_triagem, false);
  END IF;

  IF (v_liberou_pagamento OR v_liberou_triagem)
     AND NOT (public.is_admin(auth.uid()) OR public.is_medico(auth.uid())) THEN
    RAISE EXCEPTION 'Liberação excepcional exige perfil médico ou administrador.' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.restringir_liberacao_excepcional() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS agendamentos_restringir_liberacao_excepcional ON public.agendamentos;
CREATE TRIGGER agendamentos_restringir_liberacao_excepcional
  BEFORE INSERT OR UPDATE OF liberado_sem_pagamento, liberado_sem_triagem ON public.agendamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.restringir_liberacao_excepcional();
