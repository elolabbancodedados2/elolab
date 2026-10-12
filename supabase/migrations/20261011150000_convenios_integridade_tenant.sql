BEGIN;

-- Impede novos INSERT/UPDATE entre o preflight e a instalação do trigger.
LOCK TABLE public.precos_exames_convenio IN SHARE ROW EXCLUSIVE MODE;

-- Não reatribua silenciosamente tabelas antigas. Se houver registros sem
-- clínica ou cruzados, interrompa para que a clínica proprietária seja
-- confirmada antes de instalar a restrição.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.precos_exames_convenio p
      JOIN public.convenios c ON c.id = p.convenio_id
     WHERE c.clinica_id IS NULL
        OR p.clinica_id IS DISTINCT FROM c.clinica_id
  ) THEN
    RAISE EXCEPTION 'Existem preços de exames sem clínica ou associados a convênio de outra clínica. Corrija os vínculos antes de aplicar esta migration.';
  END IF;
END;
$$;

-- A FK simples em convenio_id aceita associar uma linha de preço da clínica A
-- a um convênio da clínica B. Valide a relação no banco para INSERT e UPDATE.
CREATE OR REPLACE FUNCTION public.validar_tenant_preco_exame_convenio()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinica_convenio uuid;
BEGIN
  IF NEW.clinica_id IS NULL THEN
    RAISE EXCEPTION 'O preço do exame precisa pertencer a uma clínica';
  END IF;

  SELECT c.clinica_id INTO v_clinica_convenio
    FROM public.convenios c
   WHERE c.id = NEW.convenio_id
   FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Convênio não encontrado';
  END IF;
  IF v_clinica_convenio IS DISTINCT FROM NEW.clinica_id THEN
    RAISE EXCEPTION 'O convênio e a tabela de preços precisam pertencer à mesma clínica';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_preco_exame_tenant ON public.precos_exames_convenio;
CREATE TRIGGER trg_validar_preco_exame_tenant
  BEFORE INSERT OR UPDATE ON public.precos_exames_convenio
  FOR EACH ROW EXECUTE FUNCTION public.validar_tenant_preco_exame_convenio();

-- O trigger trg_fill_clinica_id preenche o tenant quando a API omite o campo.
-- A policy exige a clínica ativa, inclusive para chamadas diretas ao PostgREST.
DROP POLICY IF EXISTS precos_exames_convenio_insert_scoped ON public.precos_exames_convenio;
CREATE POLICY precos_exames_convenio_insert_scoped ON public.precos_exames_convenio
  FOR INSERT TO authenticated
  WITH CHECK (
    (public.is_admin(auth.uid()) OR public.is_financeiro(auth.uid()))
    AND clinica_id = public.get_my_clinica_id()
  );

COMMIT;
