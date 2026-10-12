BEGIN;

-- Preserve existing data for review while enforcing these rules on every new
-- price row and every price update from this point forward.
ALTER TABLE public.precos_consulta_convenio
  ADD CONSTRAINT precos_consulta_valor_valido
  CHECK (valor >= 0 AND valor = round(valor, 2)) NOT VALID;

ALTER TABLE public.precos_exames_convenio
  ADD CONSTRAINT precos_exames_convenio_valores_validos
  CHECK (
    valor_tabela > 0 AND valor_tabela = round(valor_tabela, 2)
    AND (valor_filme IS NULL OR (valor_filme >= 0 AND valor_filme = round(valor_filme, 2)))
    AND (valor_custo IS NULL OR (valor_custo >= 0 AND valor_custo = round(valor_custo, 2)))
    AND (valor_repasse IS NULL OR (valor_repasse >= 0 AND valor_repasse = round(valor_repasse, 2)))
  ) NOT VALID;

ALTER TABLE public.tipos_consulta
  ADD CONSTRAINT tipos_consulta_valores_validos
  CHECK (
    (valor_particular IS NULL OR (valor_particular >= 0 AND valor_particular = round(valor_particular, 2)))
    AND (duracao_minutos IS NULL OR duracao_minutos > 0)
  ) NOT VALID;

CREATE OR REPLACE FUNCTION public.validar_preco_consulta_clinica()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.clinica_id IS NULL THEN
    RAISE EXCEPTION 'O preço precisa pertencer a uma clínica.'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tipos_consulta t
     WHERE t.id = NEW.tipo_consulta_id AND t.clinica_id = NEW.clinica_id
  ) THEN
    RAISE EXCEPTION 'O tipo de consulta não pertence à clínica do preço.'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.convenios c
     WHERE c.id = NEW.convenio_id AND c.clinica_id = NEW.clinica_id
  ) THEN
    RAISE EXCEPTION 'O convênio não pertence à clínica do preço.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validar_preco_consulta_clinica() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS precos_consulta_validar_referencias ON public.precos_consulta_convenio;
CREATE TRIGGER precos_consulta_validar_referencias
  BEFORE INSERT OR UPDATE OF clinica_id, tipo_consulta_id, convenio_id
  ON public.precos_consulta_convenio
  FOR EACH ROW EXECUTE FUNCTION public.validar_preco_consulta_clinica();

-- The previous policy also accepted a NULL clinic id, which made prices
-- invisible to the tenant-scoped screens and bypassed row ownership.
DROP POLICY IF EXISTS precos_consulta_insert ON public.precos_consulta_convenio;
CREATE POLICY precos_consulta_insert ON public.precos_consulta_convenio
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_access_financial(auth.uid())
    AND clinica_id = public.get_my_clinica_id()
  );

COMMIT;
