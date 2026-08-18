CREATE TABLE IF NOT EXISTS public.interoperability_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE RESTRICT,
  paciente_id uuid NOT NULL REFERENCES public.pacientes(id) ON DELETE RESTRICT,
  formato text NOT NULL CHECK (formato IN ('fhir-r4-json')),
  quantidade_recursos integer NOT NULL CHECK (quantidade_recursos >= 1),
  exportado_por uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_interop_exports_clinica_data ON public.interoperability_exports(clinica_id, created_at DESC);
ALTER TABLE public.interoperability_exports ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.interoperability_exports TO authenticated;
GRANT ALL ON public.interoperability_exports TO service_role;
CREATE POLICY interoperability_exports_select ON public.interoperability_exports FOR SELECT TO authenticated
  USING (public.can_manage_data(auth.uid()) AND public.is_same_clinica(clinica_id));
COMMENT ON TABLE public.interoperability_exports IS 'Metadados de exportações clínicas; o conteúdo FHIR não é persistido nesta tabela.';
