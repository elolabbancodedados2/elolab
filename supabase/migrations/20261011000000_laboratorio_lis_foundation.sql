BEGIN;

-- Agrupa exames da tabela existente sem duplicar o cadastro clínico.
CREATE TABLE IF NOT EXISTS public.pedidos_laboratorio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  codigo text NOT NULL DEFAULT ('LAB-' || upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 10))),
  paciente_id uuid NOT NULL REFERENCES public.pacientes(id) ON DELETE RESTRICT,
  medico_solicitante_id uuid REFERENCES public.medicos(id) ON DELETE SET NULL,
  convenio_id uuid REFERENCES public.convenios(id) ON DELETE SET NULL,
  prioridade text NOT NULL DEFAULT 'rotina' CHECK (prioridade IN ('rotina', 'urgente', 'stat')),
  status text NOT NULL DEFAULT 'solicitado' CHECK (status IN ('solicitado', 'agendado', 'em_processamento', 'parcialmente_liberado', 'liberado', 'cancelado')),
  origem text NOT NULL DEFAULT 'clinica' CHECK (origem IN ('clinica', 'portal', 'importacao')),
  indicacao_clinica text,
  numero_autorizacao text,
  solicitado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  solicitado_em timestamptz NOT NULL DEFAULT now(),
  prazo_previsto timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinica_id, codigo)
);

CREATE TABLE IF NOT EXISTS public.laboratorio_setores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  nome text NOT NULL,
  descricao text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinica_id, nome)
);

ALTER TABLE public.exames
  ADD COLUMN IF NOT EXISTS pedido_laboratorio_id uuid REFERENCES public.pedidos_laboratorio(id) ON DELETE SET NULL;
ALTER TABLE public.exames
  ADD COLUMN IF NOT EXISTS tipo_exame_catalog_id uuid REFERENCES public.tipo_exames_catalog(id) ON DELETE SET NULL;
ALTER TABLE public.coletas_laboratorio
  ADD COLUMN IF NOT EXISTS setor_id uuid REFERENCES public.laboratorio_setores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS local_atual text,
  ADD COLUMN IF NOT EXISTS rejeicao_motivo text,
  ADD COLUMN IF NOT EXISTS recoleta_de_id uuid REFERENCES public.coletas_laboratorio(id) ON DELETE RESTRICT;
ALTER TABLE public.tipo_exames_catalog
  ADD COLUMN IF NOT EXISTS setor_id uuid REFERENCES public.laboratorio_setores(id) ON DELETE SET NULL;
ALTER TABLE public.tipo_exames_catalog
  ADD COLUMN IF NOT EXISTS unidade_padrao text,
  ADD COLUMN IF NOT EXISTS referencia_min numeric(16,6),
  ADD COLUMN IF NOT EXISTS referencia_max numeric(16,6),
  ADD COLUMN IF NOT EXISTS referencia_texto text,
  ADD COLUMN IF NOT EXISTS metodo_padrao text,
  ADD COLUMN IF NOT EXISTS preparo text,
  ADD COLUMN IF NOT EXISTS tubo_padrao text,
  ADD COLUMN IF NOT EXISTS tempo_estimado_horas integer CHECK (tempo_estimado_horas IS NULL OR tempo_estimado_horas > 0),
  ADD CONSTRAINT tipo_exame_lab_referencia_valida CHECK (referencia_min IS NULL OR referencia_max IS NULL OR referencia_min <= referencia_max);

ALTER TABLE public.guias_externas
  ADD COLUMN IF NOT EXISTS laboratorio_id uuid REFERENCES public.laboratorios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status_terceirizacao text NOT NULL DEFAULT 'nao_enviado' CHECK (status_terceirizacao IN ('nao_enviado', 'enviado', 'em_processamento', 'concluido', 'atrasado')),
  ADD COLUMN IF NOT EXISTS data_envio_laboratorio timestamptz,
  ADD COLUMN IF NOT EXISTS prazo_laboratorio date,
  ADD COLUMN IF NOT EXISTS data_retorno_laboratorio timestamptz,
  ADD COLUMN IF NOT EXISTS custo_laboratorio numeric(12,2) CHECK (custo_laboratorio IS NULL OR custo_laboratorio >= 0),
  ADD COLUMN IF NOT EXISTS laudo_externo_url text,
  ADD COLUMN IF NOT EXISTS laudo_externo_nome text;

CREATE INDEX IF NOT EXISTS idx_pedidos_lab_clinica_status_data
  ON public.pedidos_laboratorio (clinica_id, status, solicitado_em DESC);
CREATE INDEX IF NOT EXISTS idx_pedidos_lab_paciente
  ON public.pedidos_laboratorio (paciente_id, solicitado_em DESC);
CREATE INDEX IF NOT EXISTS idx_exames_pedido_lab
  ON public.exames (pedido_laboratorio_id) WHERE pedido_laboratorio_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_coletas_setor_status
  ON public.coletas_laboratorio (setor_id, status);
CREATE INDEX IF NOT EXISTS idx_guias_lab_parceiro_prazo
  ON public.guias_externas (clinica_id, laboratorio_id, prazo_laboratorio)
  WHERE laboratorio_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.pedido_laboratorio_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  pedido_id uuid NOT NULL REFERENCES public.pedidos_laboratorio(id) ON DELETE RESTRICT,
  tipo text NOT NULL,
  status_anterior text,
  status_novo text,
  detalhes jsonb NOT NULL DEFAULT '{}'::jsonb,
  ator_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.laboratorio_eventos_amostra (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  coleta_id uuid NOT NULL REFERENCES public.coletas_laboratorio(id) ON DELETE RESTRICT,
  tipo text NOT NULL CHECK (tipo IN ('criada', 'status', 'recebida', 'transporte', 'armazenamento', 'rejeicao', 'rejeitada', 'recoleta', 'observacao')),
  status_anterior text,
  status_novo text,
  local text,
  detalhes jsonb NOT NULL DEFAULT '{}'::jsonb,
  ator_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.resultados_laboratorio_versoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  resultado_id uuid NOT NULL REFERENCES public.resultados_laboratorio(id) ON DELETE RESTRICT,
  numero_versao integer NOT NULL,
  registro_anterior jsonb NOT NULL,
  motivo text,
  alterado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  alterado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (resultado_id, numero_versao)
);

CREATE TABLE IF NOT EXISTS public.guias_externas_eventos_lab (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  guia_id uuid NOT NULL REFERENCES public.guias_externas(id) ON DELETE RESTRICT,
  tipo text NOT NULL,
  detalhes jsonb NOT NULL DEFAULT '{}'::jsonb,
  ator_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.resultados_laboratorio
  ADD COLUMN IF NOT EXISTS critico boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS numero_versao integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS revisado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revisado_em timestamptz,
  ADD COLUMN IF NOT EXISTS observacao_revisao text;

CREATE TABLE IF NOT EXISTS public.laboratorio_equipamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  setor_id uuid REFERENCES public.laboratorio_setores(id) ON DELETE SET NULL,
  nome text NOT NULL,
  fabricante text,
  modelo text,
  numero_serie text,
  identificador_interno text,
  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'manutencao', 'inativo')),
  calibrado_em date,
  calibracao_vencimento date,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.laboratorio_lotes_insumos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  estoque_id uuid REFERENCES public.estoque(id) ON DELETE SET NULL,
  nome text NOT NULL,
  tipo text NOT NULL DEFAULT 'reagente',
  fabricante text,
  lote text NOT NULL,
  quantidade numeric(12,3) NOT NULL DEFAULT 0 CHECK (quantidade >= 0),
  unidade text,
  recebido_em date,
  validade date,
  status text NOT NULL DEFAULT 'disponivel' CHECK (status IN ('disponivel', 'quarentena', 'esgotado', 'vencido')),
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinica_id, lote, nome)
);

CREATE TABLE IF NOT EXISTS public.laboratorio_controles_qualidade (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  setor_id uuid REFERENCES public.laboratorio_setores(id) ON DELETE SET NULL,
  equipamento_id uuid REFERENCES public.laboratorio_equipamentos(id) ON DELETE SET NULL,
  lote_insumo_id uuid REFERENCES public.laboratorio_lotes_insumos(id) ON DELETE SET NULL,
  analito text NOT NULL,
  nivel text,
  resultado numeric(16,6) NOT NULL,
  unidade text,
  limite_inferior numeric(16,6),
  limite_superior numeric(16,6),
  CHECK (limite_inferior IS NULL OR limite_superior IS NULL OR limite_inferior <= limite_superior),
  aprovado boolean GENERATED ALWAYS AS (
    (limite_inferior IS NULL OR resultado >= limite_inferior)
    AND (limite_superior IS NULL OR resultado <= limite_superior)
  ) STORED,
  realizado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  realizado_em timestamptz NOT NULL DEFAULT now(),
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lab_eventos_pedido ON public.pedido_laboratorio_eventos (pedido_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lab_eventos_amostra ON public.laboratorio_eventos_amostra (coleta_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lab_versoes_resultado ON public.resultados_laboratorio_versoes (resultado_id, numero_versao DESC);
CREATE INDEX IF NOT EXISTS idx_lab_equipamentos_calibracao ON public.laboratorio_equipamentos (clinica_id, calibracao_vencimento);
CREATE INDEX IF NOT EXISTS idx_lab_lotes_validade ON public.laboratorio_lotes_insumos (clinica_id, validade);
CREATE INDEX IF NOT EXISTS idx_lab_controle_qualidade_data ON public.laboratorio_controles_qualidade (clinica_id, realizado_em DESC);
CREATE INDEX IF NOT EXISTS idx_guias_lab_eventos_data ON public.guias_externas_eventos_lab (guia_id, created_at DESC);

-- Toda linha laboratorial nova fica isolada por clínica e perfil autorizado.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'pedidos_laboratorio', 'laboratorio_setores', 'pedido_laboratorio_eventos',
    'laboratorio_eventos_amostra', 'resultados_laboratorio_versoes',
    'laboratorio_equipamentos', 'laboratorio_lotes_insumos', 'laboratorio_controles_qualidade',
    'guias_externas_eventos_lab'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

CREATE POLICY pedidos_lab_select ON public.pedidos_laboratorio FOR SELECT TO authenticated
  USING (public.is_same_clinica(clinica_id) AND (public.is_admin(auth.uid()) OR public.is_medico(auth.uid()) OR public.is_enfermagem(auth.uid()) OR public.is_recepcao(auth.uid())));
CREATE POLICY pedidos_lab_insert ON public.pedidos_laboratorio FOR INSERT TO authenticated
  WITH CHECK (public.is_same_clinica(clinica_id) AND (public.is_admin(auth.uid()) OR public.is_medico(auth.uid()) OR public.is_enfermagem(auth.uid()) OR public.is_recepcao(auth.uid())));
CREATE POLICY pedidos_lab_update ON public.pedidos_laboratorio FOR UPDATE TO authenticated
  USING (public.is_same_clinica(clinica_id) AND (public.is_admin(auth.uid()) OR public.is_medico(auth.uid()) OR public.is_enfermagem(auth.uid()) OR public.is_recepcao(auth.uid())))
  WITH CHECK (public.is_same_clinica(clinica_id) AND (public.is_admin(auth.uid()) OR public.is_medico(auth.uid()) OR public.is_enfermagem(auth.uid()) OR public.is_recepcao(auth.uid())));

CREATE POLICY setores_lab_select ON public.laboratorio_setores FOR SELECT TO authenticated
  USING (public.is_same_clinica(clinica_id) AND (public.is_admin(auth.uid()) OR public.is_medico(auth.uid()) OR public.is_enfermagem(auth.uid())));
CREATE POLICY setores_lab_manage ON public.laboratorio_setores FOR ALL TO authenticated
  USING (public.is_same_clinica(clinica_id) AND public.is_admin(auth.uid()))
  WITH CHECK (public.is_same_clinica(clinica_id) AND public.is_admin(auth.uid()));

CREATE POLICY pedido_lab_eventos_select ON public.pedido_laboratorio_eventos FOR SELECT TO authenticated
  USING (public.is_same_clinica(clinica_id) AND (public.is_admin(auth.uid()) OR public.is_medico(auth.uid()) OR public.is_enfermagem(auth.uid()) OR public.is_recepcao(auth.uid())));
CREATE POLICY amostra_eventos_select ON public.laboratorio_eventos_amostra FOR SELECT TO authenticated
  USING (public.is_same_clinica(clinica_id) AND (public.is_admin(auth.uid()) OR public.is_medico(auth.uid()) OR public.is_enfermagem(auth.uid())));
CREATE POLICY resultado_versoes_select ON public.resultados_laboratorio_versoes FOR SELECT TO authenticated
  USING (public.is_same_clinica(clinica_id) AND public.can_access_clinical(auth.uid()));
CREATE POLICY guias_externas_eventos_lab_select ON public.guias_externas_eventos_lab FOR SELECT TO authenticated
  USING (public.is_same_clinica(clinica_id) AND (public.can_manage_data(auth.uid()) OR public.is_enfermagem(auth.uid())));

CREATE POLICY equipamentos_lab_select ON public.laboratorio_equipamentos FOR SELECT TO authenticated
  USING (public.is_same_clinica(clinica_id) AND public.can_access_clinical(auth.uid()));
CREATE POLICY equipamentos_lab_manage ON public.laboratorio_equipamentos FOR ALL TO authenticated
  USING (public.is_same_clinica(clinica_id) AND (public.is_admin(auth.uid()) OR public.is_enfermagem(auth.uid())))
  WITH CHECK (public.is_same_clinica(clinica_id) AND (public.is_admin(auth.uid()) OR public.is_enfermagem(auth.uid())));
CREATE POLICY lotes_lab_select ON public.laboratorio_lotes_insumos FOR SELECT TO authenticated
  USING (public.is_same_clinica(clinica_id) AND public.can_access_clinical(auth.uid()));
CREATE POLICY lotes_lab_manage ON public.laboratorio_lotes_insumos FOR ALL TO authenticated
  USING (public.is_same_clinica(clinica_id) AND (public.is_admin(auth.uid()) OR public.is_enfermagem(auth.uid())))
  WITH CHECK (public.is_same_clinica(clinica_id) AND (public.is_admin(auth.uid()) OR public.is_enfermagem(auth.uid())));
CREATE POLICY controle_qualidade_select ON public.laboratorio_controles_qualidade FOR SELECT TO authenticated
  USING (public.is_same_clinica(clinica_id) AND public.can_access_clinical(auth.uid()));
CREATE POLICY controle_qualidade_insert ON public.laboratorio_controles_qualidade FOR INSERT TO authenticated
  WITH CHECK (public.is_same_clinica(clinica_id) AND (public.is_admin(auth.uid()) OR public.is_enfermagem(auth.uid())));

-- Reforça o tenant scope nas tabelas laboratoriais legadas consumidas por estas telas.
DROP POLICY IF EXISTS "coletas_select" ON public.coletas_laboratorio;
CREATE POLICY coletas_select ON public.coletas_laboratorio FOR SELECT TO authenticated
  USING (public.is_same_clinica(clinica_id) AND public.can_access_clinical(auth.uid()));
DROP POLICY IF EXISTS "coletas_insert" ON public.coletas_laboratorio;
CREATE POLICY coletas_insert ON public.coletas_laboratorio FOR INSERT TO authenticated
  WITH CHECK (public.is_same_clinica(clinica_id) AND public.can_access_clinical(auth.uid()));
DROP POLICY IF EXISTS "coletas_update" ON public.coletas_laboratorio;
CREATE POLICY coletas_update ON public.coletas_laboratorio FOR UPDATE TO authenticated
  USING (public.is_same_clinica(clinica_id) AND public.can_access_clinical(auth.uid()))
  WITH CHECK (public.is_same_clinica(clinica_id) AND public.can_access_clinical(auth.uid()));
DROP POLICY IF EXISTS "coletas_delete" ON public.coletas_laboratorio;
CREATE POLICY coletas_delete ON public.coletas_laboratorio FOR DELETE TO authenticated
  USING (public.is_same_clinica(clinica_id) AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "resultados_select" ON public.resultados_laboratorio;
CREATE POLICY resultados_select ON public.resultados_laboratorio FOR SELECT TO authenticated
  USING (public.is_same_clinica(clinica_id) AND public.can_access_clinical(auth.uid()));
DROP POLICY IF EXISTS "resultados_insert" ON public.resultados_laboratorio;
CREATE POLICY resultados_insert ON public.resultados_laboratorio FOR INSERT TO authenticated
  WITH CHECK (public.is_same_clinica(clinica_id) AND public.can_access_clinical(auth.uid()));
DROP POLICY IF EXISTS "resultados_update" ON public.resultados_laboratorio;
CREATE POLICY resultados_update ON public.resultados_laboratorio FOR UPDATE TO authenticated
  USING (public.is_same_clinica(clinica_id) AND public.can_access_clinical(auth.uid()))
  WITH CHECK (public.is_same_clinica(clinica_id) AND public.can_access_clinical(auth.uid()));
DROP POLICY IF EXISTS "resultados_delete" ON public.resultados_laboratorio;
CREATE POLICY resultados_delete ON public.resultados_laboratorio FOR DELETE TO authenticated
  USING (public.is_same_clinica(clinica_id) AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Clinica acessa seus laboratorios" ON public.laboratorios;
CREATE POLICY laboratorios_select ON public.laboratorios FOR SELECT TO authenticated
  USING (public.is_same_clinica(clinica_id) AND public.can_access_clinical(auth.uid()));
CREATE POLICY laboratorios_insert ON public.laboratorios FOR INSERT TO authenticated
  WITH CHECK (public.is_same_clinica(clinica_id) AND (public.is_admin(auth.uid()) OR public.is_enfermagem(auth.uid())));
CREATE POLICY laboratorios_update ON public.laboratorios FOR UPDATE TO authenticated
  USING (public.is_same_clinica(clinica_id) AND (public.is_admin(auth.uid()) OR public.is_enfermagem(auth.uid())))
  WITH CHECK (public.is_same_clinica(clinica_id) AND (public.is_admin(auth.uid()) OR public.is_enfermagem(auth.uid())));
CREATE POLICY laboratorios_delete ON public.laboratorios FOR DELETE TO authenticated
  USING (public.is_same_clinica(clinica_id) AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Clinica acessa seu catalogo" ON public.tipo_exames_catalog;
CREATE POLICY tipo_exames_catalog_select ON public.tipo_exames_catalog FOR SELECT TO authenticated
  USING (public.is_same_clinica(clinica_id) AND (public.can_access_clinical(auth.uid()) OR public.is_recepcao(auth.uid())));
CREATE POLICY tipo_exames_catalog_insert ON public.tipo_exames_catalog FOR INSERT TO authenticated
  WITH CHECK (public.is_same_clinica(clinica_id) AND (public.is_admin(auth.uid()) OR public.is_enfermagem(auth.uid())));
CREATE POLICY tipo_exames_catalog_update ON public.tipo_exames_catalog FOR UPDATE TO authenticated
  USING (public.is_same_clinica(clinica_id) AND (public.is_admin(auth.uid()) OR public.is_enfermagem(auth.uid())))
  WITH CHECK (public.is_same_clinica(clinica_id) AND (public.is_admin(auth.uid()) OR public.is_enfermagem(auth.uid())));
CREATE POLICY tipo_exames_catalog_delete ON public.tipo_exames_catalog FOR DELETE TO authenticated
  USING (public.is_same_clinica(clinica_id) AND public.is_admin(auth.uid()));

-- Anexos privados de guias usam o primeiro segmento do path como clinica_id.
DROP POLICY IF EXISTS guias_externas_storage_read ON storage.objects;
CREATE POLICY guias_externas_storage_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'guias-externas' AND (storage.foldername(name))[1] = public.get_my_clinica_id()::text);
DROP POLICY IF EXISTS guias_externas_storage_insert ON storage.objects;
CREATE POLICY guias_externas_storage_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'guias-externas' AND (storage.foldername(name))[1] = public.get_my_clinica_id()::text);
DROP POLICY IF EXISTS guias_externas_storage_delete ON storage.objects;
CREATE POLICY guias_externas_storage_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'guias-externas' AND (storage.foldername(name))[1] = public.get_my_clinica_id()::text);

GRANT SELECT, INSERT, UPDATE ON public.pedidos_laboratorio TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.laboratorio_setores,
  public.laboratorio_equipamentos, public.laboratorio_lotes_insumos,
  public.laboratorio_controles_qualidade TO authenticated;
GRANT SELECT ON public.pedido_laboratorio_eventos, public.laboratorio_eventos_amostra,
  public.resultados_laboratorio_versoes, public.guias_externas_eventos_lab TO authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON public.pedido_laboratorio_eventos,
  public.laboratorio_eventos_amostra, public.resultados_laboratorio_versoes,
  public.guias_externas_eventos_lab FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.laboratorio_registrar_evento_pedido()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.pedido_laboratorio_eventos (clinica_id, pedido_id, tipo, status_novo, ator_id)
    VALUES (NEW.clinica_id, NEW.id, 'pedido_criado', NEW.status, auth.uid());
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.pedido_laboratorio_eventos (clinica_id, pedido_id, tipo, status_anterior, status_novo, ator_id)
    VALUES (NEW.clinica_id, NEW.id, 'status_alterado', OLD.status, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.laboratorio_recalcular_pedido()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pedido_id uuid; v_total integer; v_liberados integer; v_cancelados integer; v_em_processo integer; v_agendados integer; v_status text;
BEGIN
  v_pedido_id := COALESCE(NEW.pedido_laboratorio_id, OLD.pedido_laboratorio_id);
  IF v_pedido_id IS NULL THEN RETURN NEW; END IF;
  SELECT count(*), count(*) FILTER (WHERE status::text = 'laudo_disponivel'),
         count(*) FILTER (WHERE status::text = 'cancelado'),
         count(*) FILTER (WHERE status::text = 'realizado'),
         count(*) FILTER (WHERE status::text = 'agendado')
    INTO v_total, v_liberados, v_cancelados, v_em_processo, v_agendados
    FROM public.exames WHERE pedido_laboratorio_id = v_pedido_id;
  v_status := CASE
    WHEN v_total = 0 THEN 'solicitado'
    WHEN v_liberados = v_total THEN 'liberado'
    WHEN v_liberados > 0 THEN 'parcialmente_liberado'
    WHEN v_cancelados = v_total THEN 'cancelado'
    WHEN v_em_processo > 0 THEN 'em_processamento'
    WHEN v_agendados > 0 THEN 'agendado'
    ELSE 'solicitado'
  END;
  UPDATE public.pedidos_laboratorio SET status = v_status, updated_at = now() WHERE id = v_pedido_id AND status IS DISTINCT FROM v_status;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.laboratorio_auditar_status_amostra()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.laboratorio_eventos_amostra (clinica_id, coleta_id, tipo, status_novo, detalhes, ator_id)
    VALUES (NEW.clinica_id, NEW.id, 'criada', NEW.status, jsonb_build_object('codigo_amostra', NEW.codigo_amostra), auth.uid());
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.laboratorio_eventos_amostra (clinica_id, coleta_id, tipo, status_anterior, status_novo, detalhes, ator_id)
    VALUES (NEW.clinica_id, NEW.id,
      CASE WHEN NEW.status IN ('rejeitada', 'recoleta') THEN NEW.status ELSE 'status' END,
      OLD.status, NEW.status, '{}'::jsonb, auth.uid());
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.laboratorio_versionar_resultado()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF to_jsonb(NEW) - 'updated_at' IS DISTINCT FROM to_jsonb(OLD) - 'updated_at' THEN
    INSERT INTO public.resultados_laboratorio_versoes (clinica_id, resultado_id, numero_versao, registro_anterior, motivo, alterado_por)
    VALUES (OLD.clinica_id, OLD.id, OLD.numero_versao, to_jsonb(OLD), nullif(btrim(NEW.observacao_revisao), ''), auth.uid());
    NEW.numero_versao := OLD.numero_versao + 1;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.retificar_resultado_laboratorio(
  p_resultado_id uuid,
  p_resultado text,
  p_unidade text,
  p_referencia_min numeric,
  p_referencia_max numeric,
  p_referencia_texto text,
  p_metodo text,
  p_critico boolean,
  p_motivo text
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_resultado public.resultados_laboratorio%ROWTYPE; v_clinica_id uuid;
BEGIN
  v_clinica_id := public.get_my_clinica_id();
  IF auth.uid() IS NULL OR v_clinica_id IS NULL OR NOT public.can_access_clinical(auth.uid()) THEN
    RAISE EXCEPTION 'Profile is not authorized to review results';
  END IF;
  IF nullif(btrim(p_resultado), '') IS NULL THEN RAISE EXCEPTION 'Informe o resultado'; END IF;
  IF p_referencia_min IS NOT NULL AND p_referencia_max IS NOT NULL AND p_referencia_min > p_referencia_max THEN
    RAISE EXCEPTION 'Reference minimum cannot exceed reference maximum';
  END IF;
  SELECT * INTO v_resultado FROM public.resultados_laboratorio
    WHERE id = p_resultado_id AND clinica_id = v_clinica_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Result not found in the current clinic'; END IF;
  IF v_resultado.liberado IS TRUE THEN
    IF length(btrim(coalesce(p_motivo, ''))) < 10 THEN
      RAISE EXCEPTION 'A released result correction requires a reason of at least 10 characters';
    END IF;
    IF NOT (public.is_admin(auth.uid()) OR public.is_enfermagem(auth.uid())) THEN
      RAISE EXCEPTION 'Only authorized technical leads can correct a released result';
    END IF;
  END IF;
  UPDATE public.resultados_laboratorio SET
    resultado = btrim(p_resultado), unidade = nullif(btrim(p_unidade), ''),
    valor_referencia_min = p_referencia_min, valor_referencia_max = p_referencia_max,
    valor_referencia_texto = nullif(btrim(p_referencia_texto), ''), metodo = nullif(btrim(p_metodo), ''),
    critico = coalesce(p_critico, false), observacao_revisao = nullif(btrim(p_motivo), ''),
    revisado_por = auth.uid(), revisado_em = now(),
    data_liberacao = CASE WHEN v_resultado.liberado IS TRUE THEN now() ELSE data_liberacao END,
    liberado_por = CASE WHEN v_resultado.liberado IS TRUE THEN auth.uid() ELSE liberado_por END
  WHERE id = p_resultado_id AND clinica_id = v_clinica_id;
  RETURN v_resultado.numero_versao + 1;
END $$;
REVOKE ALL ON FUNCTION public.retificar_resultado_laboratorio(uuid, text, text, numeric, numeric, text, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retificar_resultado_laboratorio(uuid, text, text, numeric, numeric, text, text, boolean, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.laboratorio_validar_guia_terceirizada()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.laboratorio_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.laboratorios l WHERE l.id = NEW.laboratorio_id AND l.clinica_id = NEW.clinica_id AND l.ativo IS DISTINCT FROM false
  ) THEN RAISE EXCEPTION 'Partner laboratory is not active in this clinic'; END IF;
  IF NEW.custo_laboratorio IS NOT NULL AND NEW.custo_laboratorio < 0 THEN RAISE EXCEPTION 'Cost cannot be negative'; END IF;
  IF NEW.status_terceirizacao = 'enviado' AND NEW.data_envio_laboratorio IS NULL THEN NEW.data_envio_laboratorio := now(); END IF;
  IF NEW.status_terceirizacao = 'concluido' AND NEW.data_retorno_laboratorio IS NULL THEN NEW.data_retorno_laboratorio := now(); END IF;
  IF NEW.laudo_externo_url IS NOT NULL AND (storage.foldername(NEW.laudo_externo_url))[1] <> NEW.clinica_id::text THEN
    RAISE EXCEPTION 'Partner result file must be stored under the clinic private folder';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.laboratorio_auditar_guia_terceirizada()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_antes jsonb; v_depois jsonb;
BEGIN
  v_depois := jsonb_build_object('laboratorio_id', NEW.laboratorio_id, 'status_terceirizacao', NEW.status_terceirizacao,
    'data_envio_laboratorio', NEW.data_envio_laboratorio, 'prazo_laboratorio', NEW.prazo_laboratorio,
    'data_retorno_laboratorio', NEW.data_retorno_laboratorio, 'custo_laboratorio', NEW.custo_laboratorio,
    'laudo_externo_url', NEW.laudo_externo_url, 'laudo_externo_nome', NEW.laudo_externo_nome);
  IF TG_OP = 'UPDATE' THEN
    v_antes := jsonb_build_object('laboratorio_id', OLD.laboratorio_id, 'status_terceirizacao', OLD.status_terceirizacao,
      'data_envio_laboratorio', OLD.data_envio_laboratorio, 'prazo_laboratorio', OLD.prazo_laboratorio,
      'data_retorno_laboratorio', OLD.data_retorno_laboratorio, 'custo_laboratorio', OLD.custo_laboratorio,
      'laudo_externo_url', OLD.laudo_externo_url, 'laudo_externo_nome', OLD.laudo_externo_nome);
    IF v_antes = v_depois THEN RETURN NEW; END IF;
  END IF;
  INSERT INTO public.guias_externas_eventos_lab (clinica_id, guia_id, tipo, detalhes, ator_id)
  VALUES (NEW.clinica_id, NEW.id, CASE WHEN TG_OP = 'INSERT' THEN 'parceiro_registrado' ELSE 'acompanhamento_atualizado' END,
    jsonb_build_object('antes', v_antes, 'depois', v_depois), auth.uid());
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_lab_pedido_evento ON public.pedidos_laboratorio;
CREATE TRIGGER trg_lab_pedido_evento AFTER INSERT OR UPDATE OF status ON public.pedidos_laboratorio
  FOR EACH ROW EXECUTE FUNCTION public.laboratorio_registrar_evento_pedido();
DROP TRIGGER IF EXISTS trg_lab_pedido_status_exame ON public.exames;
CREATE TRIGGER trg_lab_pedido_status_exame AFTER INSERT OR UPDATE OF status, pedido_laboratorio_id ON public.exames
  FOR EACH ROW WHEN (NEW.pedido_laboratorio_id IS NOT NULL)
  EXECUTE FUNCTION public.laboratorio_recalcular_pedido();
DROP TRIGGER IF EXISTS trg_lab_amostra_historico ON public.coletas_laboratorio;
CREATE TRIGGER trg_lab_amostra_historico AFTER INSERT OR UPDATE OF status ON public.coletas_laboratorio
  FOR EACH ROW EXECUTE FUNCTION public.laboratorio_auditar_status_amostra();
DROP TRIGGER IF EXISTS trg_lab_resultado_versao ON public.resultados_laboratorio;
CREATE TRIGGER trg_lab_resultado_versao BEFORE UPDATE ON public.resultados_laboratorio
  FOR EACH ROW EXECUTE FUNCTION public.laboratorio_versionar_resultado();
DROP TRIGGER IF EXISTS trg_lab_guia_terceirizada_validar ON public.guias_externas;
CREATE TRIGGER trg_lab_guia_terceirizada_validar BEFORE INSERT OR UPDATE OF laboratorio_id, status_terceirizacao, laudo_externo_url, custo_laboratorio ON public.guias_externas
  FOR EACH ROW EXECUTE FUNCTION public.laboratorio_validar_guia_terceirizada();
DROP TRIGGER IF EXISTS trg_lab_guia_terceirizada_auditar ON public.guias_externas;
CREATE TRIGGER trg_lab_guia_terceirizada_auditar AFTER INSERT OR UPDATE OF laboratorio_id, status_terceirizacao, data_envio_laboratorio, prazo_laboratorio, data_retorno_laboratorio, custo_laboratorio, laudo_externo_url, laudo_externo_nome ON public.guias_externas
  FOR EACH ROW EXECUTE FUNCTION public.laboratorio_auditar_guia_terceirizada();

-- Criação agrupada e transacional do pedido e das linhas em public.exames.
CREATE OR REPLACE FUNCTION public.criar_pedido_laboratorio(
  p_paciente_id uuid,
  p_medico_solicitante_id uuid,
  p_convenio_id uuid,
  p_prioridade text,
  p_indicacao_clinica text,
  p_exames jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_clinica_id uuid; v_pedido_id uuid; v_item jsonb; v_nome text; v_catalogo_id uuid; v_preco_custo numeric;
BEGIN
  v_clinica_id := public.get_my_clinica_id();
  IF auth.uid() IS NULL OR v_clinica_id IS NULL THEN RAISE EXCEPTION 'Sessão ou clínica não identificada'; END IF;
  IF NOT (public.is_admin(auth.uid()) OR public.is_medico(auth.uid()) OR public.is_enfermagem(auth.uid()) OR public.is_recepcao(auth.uid())) THEN
    RAISE EXCEPTION 'Perfil sem permissão para criar pedido laboratorial';
  END IF;
  IF p_prioridade NOT IN ('rotina', 'urgente', 'stat') THEN RAISE EXCEPTION 'Prioridade inválida'; END IF;
  IF p_exames IS NULL OR jsonb_typeof(p_exames) <> 'array'
      OR jsonb_array_length(p_exames) = 0 OR jsonb_array_length(p_exames) > 40 THEN
    RAISE EXCEPTION 'O pedido precisa conter de 1 a 40 exames';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pacientes WHERE id = p_paciente_id AND clinica_id = v_clinica_id) THEN
    RAISE EXCEPTION 'Paciente não pertence à clínica atual';
  END IF;
  IF p_medico_solicitante_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.medicos WHERE id = p_medico_solicitante_id AND clinica_id = v_clinica_id
  ) THEN RAISE EXCEPTION 'Médico solicitante não pertence à clínica atual'; END IF;
  IF p_convenio_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.convenios WHERE id = p_convenio_id AND clinica_id = v_clinica_id
  ) THEN RAISE EXCEPTION 'Convênio não pertence à clínica atual'; END IF;
  INSERT INTO public.pedidos_laboratorio (clinica_id, paciente_id, medico_solicitante_id, convenio_id,
      prioridade, indicacao_clinica, solicitado_por)
    VALUES (v_clinica_id, p_paciente_id, p_medico_solicitante_id, p_convenio_id,
      p_prioridade, nullif(btrim(p_indicacao_clinica), ''), auth.uid())
    RETURNING id INTO v_pedido_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_exames) LOOP
    v_catalogo_id := nullif(v_item->>'catalog_id', '')::uuid;
    v_preco_custo := NULL;
    IF v_catalogo_id IS NOT NULL THEN
      SELECT nome, preco_custo INTO v_nome, v_preco_custo FROM public.tipo_exames_catalog
        WHERE id = v_catalogo_id AND clinica_id = v_clinica_id AND ativo = true;
      IF NOT FOUND THEN RAISE EXCEPTION 'Exame do catálogo não pertence à clínica atual ou está inativo'; END IF;
    ELSE
      v_nome := nullif(btrim(v_item->>'nome'), '');
      IF v_nome IS NULL THEN RAISE EXCEPTION 'O nome de cada exame é obrigatório'; END IF;
    END IF;
    INSERT INTO public.exames (paciente_id, medico_solicitante_id, tipo_exame_catalog_id, tipo_exame, descricao, preco_custo, status,
        clinica_id, pedido_laboratorio_id)
      VALUES (p_paciente_id, p_medico_solicitante_id, v_catalogo_id, v_nome, nullif(btrim(p_indicacao_clinica), ''), v_preco_custo,
        'solicitado'::public.status_exame, v_clinica_id, v_pedido_id);
  END LOOP;
  RETURN v_pedido_id;
END $$;

REVOKE ALL ON FUNCTION public.criar_pedido_laboratorio(uuid, uuid, uuid, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_pedido_laboratorio(uuid, uuid, uuid, text, text, jsonb) TO authenticated;

-- Eventos de movimentação são escritos no servidor; recoleta cria uma nova amostra
-- e mantém a anterior rejeitada, ligada pelo campo recoleta_de_id.
CREATE OR REPLACE FUNCTION public.laboratorio_registrar_evento_amostra(
  p_coleta_id uuid,
  p_tipo text,
  p_local text DEFAULT NULL,
  p_detalhes jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_clinica_id uuid; v_coleta public.coletas_laboratorio%ROWTYPE; v_nova_coleta_id uuid;
BEGIN
  v_clinica_id := public.get_my_clinica_id();
  IF auth.uid() IS NULL OR v_clinica_id IS NULL OR NOT public.can_access_clinical(auth.uid()) THEN
    RAISE EXCEPTION 'Perfil sem permissão para movimentar amostras';
  END IF;
  IF p_tipo IS NULL OR p_tipo NOT IN ('recebida', 'transporte', 'armazenamento', 'rejeicao', 'recoleta', 'observacao') THEN
    RAISE EXCEPTION 'Tipo de movimentação inválido';
  END IF;
  SELECT * INTO v_coleta FROM public.coletas_laboratorio
    WHERE id = p_coleta_id AND clinica_id = v_clinica_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Amostra não encontrada na clínica atual'; END IF;

  IF p_tipo = 'transporte' OR p_tipo = 'armazenamento' THEN
    IF nullif(btrim(p_local), '') IS NULL THEN RAISE EXCEPTION 'Informe o local da movimentação'; END IF;
    UPDATE public.coletas_laboratorio SET local_atual = btrim(p_local), updated_at = now()
      WHERE id = p_coleta_id;
  ELSIF p_tipo = 'rejeicao' THEN
    IF v_coleta.status NOT IN ('coletado', 'em_analise') THEN RAISE EXCEPTION 'Só é possível rejeitar amostra recebida e ainda não liberada'; END IF;
    IF length(btrim(coalesce(p_detalhes->>'motivo', ''))) < 5 THEN RAISE EXCEPTION 'Informe o motivo da rejeição'; END IF;
    UPDATE public.coletas_laboratorio SET status = 'rejeitada', rejeicao_motivo = btrim(p_detalhes->>'motivo'), updated_at = now()
      WHERE id = p_coleta_id;
  ELSIF p_tipo = 'recoleta' THEN
    IF v_coleta.status <> 'rejeitada' THEN RAISE EXCEPTION 'A nova coleta só pode ser aberta após rejeição da amostra anterior'; END IF;
    IF length(btrim(coalesce(p_detalhes->>'motivo', ''))) < 5 THEN RAISE EXCEPTION 'Informe o motivo da recoleta'; END IF;
    INSERT INTO public.coletas_laboratorio (
      paciente_id, exame_id, medico_solicitante_id, clinica_id, tipo_amostra, tubo, status,
      observacoes, jejum_necessario, jejum_horas, urgente, convenio_id, setor_id, recoleta_de_id
    ) VALUES (
      v_coleta.paciente_id, v_coleta.exame_id, v_coleta.medico_solicitante_id, v_clinica_id,
      v_coleta.tipo_amostra, v_coleta.tubo, 'pendente',
      concat_ws(E'\n', v_coleta.observacoes, 'Recoleta: ' || nullif(btrim(p_detalhes->>'motivo'), '')),
      v_coleta.jejum_necessario, v_coleta.jejum_horas, v_coleta.urgente,
      v_coleta.convenio_id, v_coleta.setor_id, v_coleta.id
    ) RETURNING id INTO v_nova_coleta_id;
    INSERT INTO public.laboratorio_eventos_amostra (clinica_id, coleta_id, tipo, status_anterior, status_novo, detalhes, ator_id)
      VALUES (v_clinica_id, v_coleta.id, 'recoleta', v_coleta.status, v_coleta.status,
        jsonb_build_object('nova_coleta_id', v_nova_coleta_id, 'motivo', nullif(btrim(p_detalhes->>'motivo'), '')), auth.uid());
    RETURN v_nova_coleta_id;
  END IF;

  INSERT INTO public.laboratorio_eventos_amostra (clinica_id, coleta_id, tipo, status_anterior, status_novo, local, detalhes, ator_id)
    VALUES (v_clinica_id, v_coleta.id, p_tipo, v_coleta.status,
      CASE WHEN p_tipo = 'rejeicao' THEN 'rejeitada' ELSE v_coleta.status END,
      nullif(btrim(p_local), ''), coalesce(p_detalhes, '{}'::jsonb), auth.uid())
    RETURNING id INTO v_nova_coleta_id;
  RETURN v_nova_coleta_id;
END $$;

REVOKE ALL ON FUNCTION public.laboratorio_registrar_evento_amostra(uuid, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.laboratorio_registrar_evento_amostra(uuid, text, text, jsonb) TO authenticated;

-- Auditoria universal já existente no EloLab; anexada também às configurações.
DROP TRIGGER IF EXISTS trg_audit ON public.pedidos_laboratorio;
CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON public.pedidos_laboratorio FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();
DROP TRIGGER IF EXISTS trg_audit ON public.laboratorio_setores;
CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON public.laboratorio_setores FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();
DROP TRIGGER IF EXISTS trg_audit ON public.laboratorio_equipamentos;
CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON public.laboratorio_equipamentos FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();
DROP TRIGGER IF EXISTS trg_audit ON public.laboratorio_lotes_insumos;
CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON public.laboratorio_lotes_insumos FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();

COMMIT;
