CREATE TABLE public.relatorios_salvos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  user_id uuid NOT NULL,
  nome text NOT NULL,
  descricao text,
  dataset text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  frequencia text,
  dia_semana int,
  dia_mes int,
  hora time,
  destinatarios text[] DEFAULT '{}',
  formato text DEFAULT 'pdf',
  ativo boolean DEFAULT true,
  proxima_execucao timestamptz,
  ultima_execucao timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_relatorios_salvos_clinica ON public.relatorios_salvos(clinica_id);
CREATE INDEX idx_relatorios_salvos_proxima ON public.relatorios_salvos(proxima_execucao) WHERE ativo = true;

ALTER TABLE public.relatorios_salvos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rel_salvos_select" ON public.relatorios_salvos
  FOR SELECT TO authenticated
  USING (public.is_same_clinica(clinica_id));

CREATE POLICY "rel_salvos_insert" ON public.relatorios_salvos
  FOR INSERT TO authenticated
  WITH CHECK (public.is_same_clinica(clinica_id));

CREATE POLICY "rel_salvos_update" ON public.relatorios_salvos
  FOR UPDATE TO authenticated
  USING (public.is_same_clinica(clinica_id));

CREATE POLICY "rel_salvos_delete" ON public.relatorios_salvos
  FOR DELETE TO authenticated
  USING (public.is_same_clinica(clinica_id));

CREATE TRIGGER set_clinica_id_relatorios_salvos
  BEFORE INSERT ON public.relatorios_salvos
  FOR EACH ROW EXECUTE FUNCTION public.fn_fill_clinica_id();

CREATE TRIGGER update_relatorios_salvos_updated_at
  BEFORE UPDATE ON public.relatorios_salvos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();