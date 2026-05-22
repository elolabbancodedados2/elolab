
-- 1) Tabela principal de guias externas
CREATE TABLE public.guias_externas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid REFERENCES public.clinicas(id) ON DELETE CASCADE,

  -- Origem do recebimento
  origem text NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual','portal','email','api')),
  status text NOT NULL DEFAULT 'recebida' CHECK (status IN ('recebida','em_analise','agendada','encaminhada_fila','finalizada','cancelada')),

  -- Paciente (pode estar vinculado ou ser registro avulso)
  paciente_id uuid REFERENCES public.pacientes(id) ON DELETE SET NULL,
  paciente_nome text NOT NULL,
  paciente_cpf text,
  paciente_nascimento date,
  paciente_telefone text,
  paciente_email text,
  paciente_sexo text,

  -- Médico solicitante externo
  medico_externo_nome text,
  medico_externo_crm text,
  medico_externo_uf text,
  medico_externo_especialidade text,
  medico_externo_contato text,

  -- Convênio
  convenio_id uuid REFERENCES public.convenios(id) ON DELETE SET NULL,
  convenio_nome text,
  numero_autorizacao text,
  validade_autorizacao date,

  -- Exames
  exames_solicitados jsonb NOT NULL DEFAULT '[]'::jsonb,
  observacoes text,

  -- Anexo da guia original
  anexo_url text,
  anexo_nome text,

  -- Workflow
  data_recebimento timestamptz NOT NULL DEFAULT now(),
  data_agendamento date,
  hora_agendamento time,
  agendamento_id uuid REFERENCES public.agendamentos(id) ON DELETE SET NULL,

  -- Auditoria
  registrado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_guias_externas_clinica ON public.guias_externas(clinica_id);
CREATE INDEX idx_guias_externas_status ON public.guias_externas(status);
CREATE INDEX idx_guias_externas_paciente ON public.guias_externas(paciente_id);
CREATE INDEX idx_guias_externas_data ON public.guias_externas(data_recebimento DESC);

ALTER TABLE public.guias_externas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "guias_externas_select" ON public.guias_externas
  FOR SELECT USING (public.is_same_clinica(clinica_id));
CREATE POLICY "guias_externas_insert" ON public.guias_externas
  FOR INSERT WITH CHECK (public.is_same_clinica(clinica_id));
CREATE POLICY "guias_externas_update" ON public.guias_externas
  FOR UPDATE USING (public.is_same_clinica(clinica_id));
CREATE POLICY "guias_externas_delete" ON public.guias_externas
  FOR DELETE USING (public.is_same_clinica(clinica_id));

-- Auto preencher clinica_id e updated_at
CREATE TRIGGER trg_guias_externas_clinica
  BEFORE INSERT ON public.guias_externas
  FOR EACH ROW EXECUTE FUNCTION public.fn_fill_clinica_id();

CREATE TRIGGER trg_guias_externas_updated
  BEFORE UPDATE ON public.guias_externas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Tokens do portal público para médicos externos
CREATE TABLE public.portal_guias_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  descricao text,
  ativo boolean NOT NULL DEFAULT true,
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  ultimo_uso timestamptz
);

CREATE INDEX idx_portal_guias_tokens_clinica ON public.portal_guias_tokens(clinica_id);
ALTER TABLE public.portal_guias_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "portal_tokens_select" ON public.portal_guias_tokens
  FOR SELECT USING (public.is_same_clinica(clinica_id));
CREATE POLICY "portal_tokens_insert" ON public.portal_guias_tokens
  FOR INSERT WITH CHECK (public.is_same_clinica(clinica_id));
CREATE POLICY "portal_tokens_update" ON public.portal_guias_tokens
  FOR UPDATE USING (public.is_same_clinica(clinica_id));
CREATE POLICY "portal_tokens_delete" ON public.portal_guias_tokens
  FOR DELETE USING (public.is_same_clinica(clinica_id));

-- 3) Storage bucket privado
INSERT INTO storage.buckets (id, name, public)
VALUES ('guias-externas', 'guias-externas', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "guias_externas_storage_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'guias-externas');

CREATE POLICY "guias_externas_storage_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'guias-externas');

CREATE POLICY "guias_externas_storage_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'guias-externas');
