BEGIN;

ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS recepcao_cadastro_ok boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recepcao_documento_ok boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recepcao_convenio_ok boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recepcao_checklist_em timestamptz,
  ADD COLUMN IF NOT EXISTS recepcao_checklist_por uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS agendamentos_recepcao_checklist_por_idx
  ON public.agendamentos (recepcao_checklist_por)
  WHERE recepcao_checklist_por IS NOT NULL;

CREATE OR REPLACE FUNCTION public.auditar_checklist_recepcao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  checklist_changed boolean;
  audit_changed boolean;
BEGIN
  checklist_changed := ROW(NEW.recepcao_cadastro_ok, NEW.recepcao_documento_ok, NEW.recepcao_convenio_ok)
    IS DISTINCT FROM ROW(OLD.recepcao_cadastro_ok, OLD.recepcao_documento_ok, OLD.recepcao_convenio_ok);
  audit_changed := ROW(NEW.recepcao_checklist_em, NEW.recepcao_checklist_por)
    IS DISTINCT FROM ROW(OLD.recepcao_checklist_em, OLD.recepcao_checklist_por);

  IF audit_changed AND NOT checklist_changed THEN
    RAISE EXCEPTION 'Os dados de auditoria da recepcao nao podem ser alterados diretamente.'
      USING ERRCODE = '42501';
  END IF;

  IF checklist_changed THEN
    IF auth.uid() IS NULL
       OR NOT (public.is_admin(auth.uid()) OR public.is_recepcao(auth.uid())) THEN
      RAISE EXCEPTION 'Sem permissao para atualizar a conferencia da recepcao.'
        USING ERRCODE = '42501';
    END IF;

    NEW.recepcao_checklist_em := now();
    NEW.recepcao_checklist_por := auth.uid();
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.auditar_checklist_recepcao() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS agendamentos_auditar_checklist_recepcao ON public.agendamentos;
CREATE TRIGGER agendamentos_auditar_checklist_recepcao
  BEFORE UPDATE OF recepcao_cadastro_ok, recepcao_documento_ok, recepcao_convenio_ok,
    recepcao_checklist_em, recepcao_checklist_por
  ON public.agendamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.auditar_checklist_recepcao();

COMMIT;
