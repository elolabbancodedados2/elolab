-- Linhas importadas de extrato bancário (OFX), identificadas pelo FITID do
-- banco. Reimportar o mesmo arquivo não duplica nada: a chave única por
-- clínica + conta + FITID descarta o que já existe. A importação não cria
-- lançamentos; a correspondência com contas é conferida manualmente.
BEGIN;

CREATE TABLE IF NOT EXISTS public.extrato_bancario_transacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE RESTRICT,
  conta text NOT NULL CHECK (length(btrim(conta)) BETWEEN 1 AND 80),
  fitid text NOT NULL CHECK (length(btrim(fitid)) BETWEEN 1 AND 255),
  data date NOT NULL,
  valor numeric(14,2) NOT NULL,
  descricao text CHECK (descricao IS NULL OR length(descricao) <= 255),
  importado_por uuid NOT NULL REFERENCES auth.users(id),
  importado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinica_id, conta, fitid)
);
CREATE INDEX IF NOT EXISTS idx_extrato_bancario_clinica_data ON public.extrato_bancario_transacoes (clinica_id, data);

ALTER TABLE public.extrato_bancario_transacoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.extrato_bancario_transacoes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.extrato_bancario_transacoes TO authenticated;
GRANT ALL ON public.extrato_bancario_transacoes TO service_role;
DROP POLICY IF EXISTS extrato_bancario_transacoes_select ON public.extrato_bancario_transacoes;
CREATE POLICY extrato_bancario_transacoes_select ON public.extrato_bancario_transacoes FOR SELECT TO authenticated
  USING (public.can_access_financial(auth.uid()) AND public.is_same_clinica(clinica_id));

CREATE OR REPLACE FUNCTION public.importar_extrato_bancario(p_conta text, p_transacoes jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinica uuid := public.get_my_clinica_id();
  v_total integer;
  v_importadas integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_access_financial(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso financeiro necessário';
  END IF;
  IF v_clinica IS NULL OR NULLIF(btrim(COALESCE(p_conta, '')), '') IS NULL
     OR jsonb_typeof(p_transacoes) <> 'array' THEN
    RAISE EXCEPTION 'Conta e transações do extrato são obrigatórias';
  END IF;
  v_total := jsonb_array_length(p_transacoes);
  IF v_total = 0 OR v_total > 5000 THEN
    RAISE EXCEPTION 'Envie de 1 a 5000 transações por importação';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_transacoes) t
     WHERE NULLIF(btrim(t->>'fitid'), '') IS NULL
        OR (t->>'data') !~ '^\d{4}-\d{2}-\d{2}$'
        OR (t->>'valor') !~ '^-?\d+(\.\d{1,2})?$'
  ) THEN
    RAISE EXCEPTION 'Transação do extrato com identificador, data ou valor inválido';
  END IF;

  WITH inseridas AS (
    INSERT INTO public.extrato_bancario_transacoes (clinica_id, conta, fitid, data, valor, descricao, importado_por)
    SELECT DISTINCT ON (btrim(t->>'fitid'))
           v_clinica, btrim(p_conta), btrim(t->>'fitid'), (t->>'data')::date, (t->>'valor')::numeric(14,2),
           left(NULLIF(btrim(t->>'descricao'), ''), 255), auth.uid()
      FROM jsonb_array_elements(p_transacoes) t
    ON CONFLICT (clinica_id, conta, fitid) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_importadas FROM inseridas;

  RETURN jsonb_build_object('success', true, 'importadas', v_importadas, 'repetidas', v_total - v_importadas);
END;
$$;

REVOKE ALL ON FUNCTION public.importar_extrato_bancario(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.importar_extrato_bancario(text, jsonb) TO authenticated;

COMMENT ON TABLE public.extrato_bancario_transacoes IS 'Transações de extrato OFX importadas, sem duplicidade por FITID; não geram lançamentos.';

COMMIT;
