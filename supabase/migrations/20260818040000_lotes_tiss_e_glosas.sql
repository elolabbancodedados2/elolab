CREATE TABLE IF NOT EXISTS public.lotes_tiss (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE RESTRICT,
  convenio_id uuid NOT NULL REFERENCES public.convenios(id) ON DELETE RESTRICT,
  competencia date NOT NULL,
  numero_lote text NOT NULL,
  versao_tiss text NOT NULL,
  quantidade_guias integer NOT NULL DEFAULT 0 CHECK (quantidade_guias >= 0),
  valor_apresentado numeric(14,2) NOT NULL DEFAULT 0 CHECK (valor_apresentado >= 0),
  valor_pago numeric(14,2) NOT NULL DEFAULT 0 CHECK (valor_pago >= 0),
  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','enviado','processando','pago','pago_parcial','rejeitado','cancelado')),
  protocolo_operadora text,
  enviado_em timestamptz,
  retorno_em timestamptz,
  observacoes text,
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinica_id, convenio_id, numero_lote)
);

CREATE TABLE IF NOT EXISTS public.glosas_convenio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE RESTRICT,
  lote_id uuid NOT NULL REFERENCES public.lotes_tiss(id) ON DELETE RESTRICT,
  codigo_glosa text NOT NULL,
  motivo text NOT NULL,
  guia_referencia text,
  valor_glosado numeric(14,2) NOT NULL CHECK (valor_glosado > 0),
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','recurso_preparacao','recurso_enviado','aceita','mantida','cancelada')),
  recurso_justificativa text,
  recurso_enviado_em timestamptz,
  valor_recuperado numeric(14,2) NOT NULL DEFAULT 0 CHECK (valor_recuperado >= 0),
  resolvido_em timestamptz,
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lotes_tiss_clinica_competencia ON public.lotes_tiss(clinica_id, competencia DESC);
CREATE INDEX IF NOT EXISTS idx_glosas_lote_status ON public.glosas_convenio(lote_id, status);

ALTER TABLE public.lotes_tiss ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.glosas_convenio ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.lotes_tiss, public.glosas_convenio TO authenticated;
GRANT ALL ON public.lotes_tiss, public.glosas_convenio TO service_role;

CREATE POLICY lotes_tiss_financeiro_select ON public.lotes_tiss FOR SELECT TO authenticated
  USING (public.can_access_financial(auth.uid()) AND public.is_same_clinica(clinica_id));
CREATE POLICY lotes_tiss_financeiro_insert ON public.lotes_tiss FOR INSERT TO authenticated
  WITH CHECK (public.can_access_financial(auth.uid()) AND clinica_id = public.get_my_clinica_id()
    AND EXISTS (SELECT 1 FROM public.convenios c WHERE c.id = convenio_id AND c.clinica_id = public.get_my_clinica_id()));
CREATE POLICY lotes_tiss_financeiro_update ON public.lotes_tiss FOR UPDATE TO authenticated
  USING (public.can_access_financial(auth.uid()) AND public.is_same_clinica(clinica_id))
  WITH CHECK (clinica_id = public.get_my_clinica_id()
    AND EXISTS (SELECT 1 FROM public.convenios c WHERE c.id = convenio_id AND c.clinica_id = public.get_my_clinica_id()));

CREATE POLICY glosas_financeiro_select ON public.glosas_convenio FOR SELECT TO authenticated
  USING (public.can_access_financial(auth.uid()) AND public.is_same_clinica(clinica_id));
CREATE POLICY glosas_financeiro_insert ON public.glosas_convenio FOR INSERT TO authenticated
  WITH CHECK (public.can_access_financial(auth.uid()) AND clinica_id = public.get_my_clinica_id()
    AND EXISTS (SELECT 1 FROM public.lotes_tiss l WHERE l.id = lote_id AND l.clinica_id = public.get_my_clinica_id()));
CREATE POLICY glosas_financeiro_update ON public.glosas_convenio FOR UPDATE TO authenticated
  USING (public.can_access_financial(auth.uid()) AND public.is_same_clinica(clinica_id))
  WITH CHECK (clinica_id = public.get_my_clinica_id()
    AND EXISTS (SELECT 1 FROM public.lotes_tiss l WHERE l.id = lote_id AND l.clinica_id = public.get_my_clinica_id()));

DROP TRIGGER IF EXISTS update_lotes_tiss_updated_at ON public.lotes_tiss;
CREATE TRIGGER update_lotes_tiss_updated_at BEFORE UPDATE ON public.lotes_tiss
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_glosas_convenio_updated_at ON public.glosas_convenio;
CREATE TRIGGER update_glosas_convenio_updated_at BEFORE UPDATE ON public.glosas_convenio
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.lotes_tiss IS 'Controle operacional de lotes enviados às operadoras. Não substitui validação XSD oficial da versão TISS.';
COMMENT ON TABLE public.glosas_convenio IS 'Glosas vinculadas a lotes TISS, incluindo recurso, decisão e valor recuperado.';
