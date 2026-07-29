-- ============================================================================
-- Cria o que o app já usa e o banco não tinha
--
-- Comparando o código com o schema REAL de produção (e não com os arquivos de
-- migration, que divergem), o app referencia tabelas e colunas inexistentes.
-- Como o supabase-js não lança em erro de API, nada disso aparecia como falha:
-- as telas simplesmente vinham vazias.
--
-- ── 1. Segurança da prescrição: três checagens cegas ────────────────────────
-- src/pages/Prescricoes.tsx monta os alertas clínicos com cinco entradas:
-- alergias, idade, gestante, amamentando e comorbidades. Só as duas primeiras
-- existiam no banco. As outras três eram sempre falsas/vazias, então os
-- alertas de contraindicação em gestação, amamentação e comorbidade NUNCA
-- dispararam — o diálogo aparecia funcionando, cego em três dos cinco pontos.
--
-- ── 2. especialidades_destino ──────────────────────────────────────────────
-- Lida por ConfiguracoesAvancadas. clinica_id nulo = catálogo compartilhado
-- (as 15 especialidades semeadas aqui); preenchido = especialidade criada pela
-- clínica. Mesma convenção adotada em notification_templates.
--
-- ── 3. autorizacoes_convenio ───────────────────────────────────────────────
-- Usada por AutorizacaoConvenioModal, aberto pela tela de Pacientes.
-- ============================================================================

BEGIN;

-- ─── 1. Campos de segurança clínica ─────────────────────────────────────────
ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS gestante    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS amamentando boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.pacientes.gestante IS
  'Alimenta o alerta de contraindicação em gestação (src/lib/clinicalAlerts.ts).';
COMMENT ON COLUMN public.pacientes.amamentando IS
  'Alimenta o alerta de contraindicação em amamentação (src/lib/clinicalAlerts.ts).';

CREATE TABLE IF NOT EXISTS public.paciente_comorbidades (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id       uuid NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,
  clinica_id        uuid REFERENCES public.clinicas(id) ON DELETE CASCADE,
  codigo_cid        text,
  descricao         text NOT NULL,
  data_diagnostico  date,
  ativo             boolean NOT NULL DEFAULT true,
  observacoes       text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_paciente_comorbidades_paciente_id ON public.paciente_comorbidades (paciente_id);
CREATE INDEX IF NOT EXISTS idx_paciente_comorbidades_clinica_id  ON public.paciente_comorbidades (clinica_id);

DROP TRIGGER IF EXISTS trg_fill_clinica_id ON public.paciente_comorbidades;
CREATE TRIGGER trg_fill_clinica_id BEFORE INSERT ON public.paciente_comorbidades
  FOR EACH ROW EXECUTE FUNCTION public.fn_fill_clinica_id();

ALTER TABLE public.paciente_comorbidades ENABLE ROW LEVEL SECURITY;

CREATE POLICY paciente_comorbidades_select ON public.paciente_comorbidades
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid()) AND public.is_same_clinica(clinica_id));

CREATE POLICY paciente_comorbidades_insert ON public.paciente_comorbidades
  FOR INSERT TO authenticated
  WITH CHECK (
    (public.can_access_clinical(auth.uid()) OR public.is_admin(auth.uid()))
    AND (clinica_id IS NULL OR clinica_id = public.get_my_clinica_id())
  );

CREATE POLICY paciente_comorbidades_update ON public.paciente_comorbidades
  FOR UPDATE TO authenticated
  USING (public.can_access_clinical(auth.uid()) AND public.is_same_clinica(clinica_id))
  WITH CHECK (public.can_access_clinical(auth.uid()) AND public.is_same_clinica(clinica_id));

CREATE POLICY paciente_comorbidades_delete ON public.paciente_comorbidades
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()) AND public.is_same_clinica(clinica_id));

-- ─── 2. Especialidades de destino ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.especialidades_destino (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid REFERENCES public.clinicas(id) ON DELETE CASCADE,
  codigo     text NOT NULL,
  nome       text NOT NULL,
  descricao  text,
  ativo      boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- O código é único dentro da clínica; os globais (clinica_id nulo) formam um
-- conjunto à parte. Dois índices parciais porque NULL não colide em UNIQUE.
CREATE UNIQUE INDEX IF NOT EXISTS uq_especialidades_destino_codigo_clinica
  ON public.especialidades_destino (clinica_id, codigo) WHERE clinica_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_especialidades_destino_codigo_global
  ON public.especialidades_destino (codigo) WHERE clinica_id IS NULL;

ALTER TABLE public.especialidades_destino ENABLE ROW LEVEL SECURITY;

CREATE POLICY especialidades_destino_select ON public.especialidades_destino
  FOR SELECT TO authenticated
  USING (
    public.has_any_role(auth.uid())
    AND (clinica_id IS NULL OR public.is_same_clinica(clinica_id))
  );

-- Escrita só na própria clínica: o catálogo global é compartilhado, e deixar
-- uma clínica editá-lo mudaria a lista de todas as outras.
CREATE POLICY especialidades_destino_insert ON public.especialidades_destino
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id());

CREATE POLICY especialidades_destino_update ON public.especialidades_destino
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()) AND public.is_same_clinica(clinica_id))
  WITH CHECK (public.is_admin(auth.uid()) AND public.is_same_clinica(clinica_id));

CREATE POLICY especialidades_destino_delete ON public.especialidades_destino
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()) AND public.is_same_clinica(clinica_id));

INSERT INTO public.especialidades_destino (clinica_id, codigo, nome, descricao) VALUES
  (NULL, 'cardio',         'Cardiologia',           'Doenças do coração e circulatório'),
  (NULL, 'oftalmo',        'Oftalmologia',          'Doenças dos olhos'),
  (NULL, 'neuro',          'Neurologia',            'Doenças do sistema nervoso'),
  (NULL, 'ortopedia',      'Ortopedia',             'Doenças dos ossos e articulações'),
  (NULL, 'psiquiatria',    'Psiquiatria',           'Transtornos mentais'),
  (NULL, 'reumatologia',   'Reumatologia',          'Doenças articulares e inflamatórias'),
  (NULL, 'endocrinologia', 'Endocrinologia',        'Doenças hormonais e metabólicas'),
  (NULL, 'gastro',         'Gastroenterologia',     'Doenças do aparelho digestivo'),
  (NULL, 'pneumo',         'Pneumologia',           'Doenças dos pulmões'),
  (NULL, 'urologia',       'Urologia',              'Doenças do sistema urinário'),
  (NULL, 'oncologia',      'Oncologia',             'Câncer e tumores'),
  (NULL, 'geriatria',      'Geriatria',             'Saúde do idoso'),
  (NULL, 'pediatria',      'Pediatria',             'Saúde infantil'),
  (NULL, 'dermatologia',   'Dermatologia',          'Doenças da pele'),
  (NULL, 'otorrino',       'Otorrinolaringologia',  'Doenças do ouvido, nariz e garganta')
ON CONFLICT DO NOTHING;

-- ─── 3. Autorizações de convênio ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.autorizacoes_convenio (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id         uuid NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,
  convenio_id         uuid NOT NULL REFERENCES public.convenios(id) ON DELETE CASCADE,
  clinica_id          uuid REFERENCES public.clinicas(id) ON DELETE CASCADE,
  tipo_servico        text NOT NULL,
  descricao           text,
  status              text NOT NULL DEFAULT 'pendente'
                        CHECK (status IN ('pendente', 'autorizada', 'negada', 'expirada')),
  numero_autorizacao  text,
  data_solicitacao    timestamptz NOT NULL DEFAULT now(),
  data_autorizacao    timestamptz,
  data_expiracao      date,
  observacoes         text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_autorizacoes_convenio_paciente_id ON public.autorizacoes_convenio (paciente_id);
CREATE INDEX IF NOT EXISTS idx_autorizacoes_convenio_convenio_id ON public.autorizacoes_convenio (convenio_id);
CREATE INDEX IF NOT EXISTS idx_autorizacoes_convenio_clinica_id  ON public.autorizacoes_convenio (clinica_id);
CREATE INDEX IF NOT EXISTS idx_autorizacoes_convenio_status      ON public.autorizacoes_convenio (status);

DROP TRIGGER IF EXISTS trg_fill_clinica_id ON public.autorizacoes_convenio;
CREATE TRIGGER trg_fill_clinica_id BEFORE INSERT ON public.autorizacoes_convenio
  FOR EACH ROW EXECUTE FUNCTION public.fn_fill_clinica_id();

ALTER TABLE public.autorizacoes_convenio ENABLE ROW LEVEL SECURITY;

CREATE POLICY autorizacoes_convenio_select ON public.autorizacoes_convenio
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid()) AND public.is_same_clinica(clinica_id));

CREATE POLICY autorizacoes_convenio_insert ON public.autorizacoes_convenio
  FOR INSERT TO authenticated
  WITH CHECK (
    (public.can_manage_data(auth.uid()) OR public.is_medico(auth.uid()))
    AND (clinica_id IS NULL OR clinica_id = public.get_my_clinica_id())
  );

CREATE POLICY autorizacoes_convenio_update ON public.autorizacoes_convenio
  FOR UPDATE TO authenticated
  USING (public.can_manage_data(auth.uid()) AND public.is_same_clinica(clinica_id))
  WITH CHECK (public.can_manage_data(auth.uid()) AND public.is_same_clinica(clinica_id));

CREATE POLICY autorizacoes_convenio_delete ON public.autorizacoes_convenio
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()) AND public.is_same_clinica(clinica_id));

COMMIT;

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================
-- SELECT count(*) AS especialidades_globais FROM public.especialidades_destino
--  WHERE clinica_id IS NULL;   -- deve ser 15
--
-- SELECT column_name FROM information_schema.columns
--  WHERE table_schema='public' AND table_name='pacientes'
--    AND column_name IN ('gestante','amamentando');   -- deve trazer as duas
