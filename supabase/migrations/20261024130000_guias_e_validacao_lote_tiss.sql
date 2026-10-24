-- Guias detalhadas do lote TISS, validação de consistência e divergência
-- entre o autorizado e o faturado antes de registrar o envio.
--
-- Lotes antigos continuam agregados (sem guias): nesse caso a validação só
-- confere o cabeçalho e o envio segue permitido. Quando o lote tem guias, o
-- envio é recusado enquanto houver pendência de gravidade "erro".
-- As regras espelham src/lib/tissLoteValidacao.ts.
BEGIN;

CREATE TABLE IF NOT EXISTS public.lote_tiss_guias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE RESTRICT,
  lote_id uuid NOT NULL REFERENCES public.lotes_tiss(id) ON DELETE RESTRICT,
  numero_guia text NOT NULL CHECK (length(btrim(numero_guia)) BETWEEN 1 AND 20),
  numero_carteira text CHECK (numero_carteira IS NULL OR length(numero_carteira) <= 40),
  paciente_id uuid REFERENCES public.pacientes(id) ON DELETE RESTRICT,
  autorizacao_id uuid REFERENCES public.autorizacoes_convenio(id) ON DELETE RESTRICT,
  data_atendimento date NOT NULL,
  codigo_procedimento text NOT NULL CHECK (length(codigo_procedimento) <= 20),
  tipo_servico text NOT NULL CHECK (tipo_servico IN ('consulta', 'exame', 'procedimento', 'terapia', 'internacao')),
  quantidade integer NOT NULL CHECK (quantidade BETWEEN 1 AND 9999),
  valor_total numeric(14,2) NOT NULL CHECK (valor_total > 0),
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lote_id, numero_guia)
);
CREATE INDEX IF NOT EXISTS idx_lote_tiss_guias_clinica_lote ON public.lote_tiss_guias (clinica_id, lote_id);
CREATE INDEX IF NOT EXISTS idx_lote_tiss_guias_autorizacao ON public.lote_tiss_guias (autorizacao_id) WHERE autorizacao_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lote_tiss_guias_paciente ON public.lote_tiss_guias (paciente_id) WHERE paciente_id IS NOT NULL;

ALTER TABLE public.lote_tiss_guias ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lote_tiss_guias FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.lote_tiss_guias TO authenticated;
GRANT ALL ON public.lote_tiss_guias TO service_role;

DROP POLICY IF EXISTS lote_tiss_guias_financeiro_select ON public.lote_tiss_guias;
CREATE POLICY lote_tiss_guias_financeiro_select ON public.lote_tiss_guias FOR SELECT TO authenticated
  USING (public.can_access_financial(auth.uid()) AND public.is_same_clinica(clinica_id));

-- Gravações somente pelas funções abaixo, e apenas com o lote em rascunho.
CREATE OR REPLACE FUNCTION public.adicionar_guia_lote_tiss(
  p_lote_id uuid,
  p_numero_guia text,
  p_numero_carteira text,
  p_paciente_id uuid,
  p_autorizacao_id uuid,
  p_data_atendimento date,
  p_codigo_procedimento text,
  p_tipo_servico text,
  p_quantidade integer,
  p_valor_total numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinica uuid := public.get_my_clinica_id();
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_access_financial(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso financeiro necessário';
  END IF;
  IF p_valor_total IS NULL OR p_valor_total <= 0 OR p_valor_total <> round(p_valor_total, 2) THEN
    RAISE EXCEPTION 'O valor da guia deve ser maior que zero e ter no máximo duas casas decimais';
  END IF;
  PERFORM 1 FROM public.lotes_tiss
   WHERE id = p_lote_id AND clinica_id = v_clinica AND status = 'rascunho'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Guias só podem ser incluídas em lote em rascunho desta clínica';
  END IF;
  IF p_paciente_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.pacientes WHERE id = p_paciente_id AND clinica_id = v_clinica) THEN
    RAISE EXCEPTION 'Paciente não encontrado nesta clínica';
  END IF;
  IF p_autorizacao_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.autorizacoes_convenio WHERE id = p_autorizacao_id AND clinica_id = v_clinica) THEN
    RAISE EXCEPTION 'Autorização não encontrada nesta clínica';
  END IF;

  INSERT INTO public.lote_tiss_guias (
    clinica_id, lote_id, numero_guia, numero_carteira, paciente_id, autorizacao_id,
    data_atendimento, codigo_procedimento, tipo_servico, quantidade, valor_total, criado_por
  ) VALUES (
    v_clinica, p_lote_id, btrim(p_numero_guia), NULLIF(btrim(COALESCE(p_numero_carteira, '')), ''),
    p_paciente_id, p_autorizacao_id, p_data_atendimento, btrim(p_codigo_procedimento),
    p_tipo_servico, p_quantidade, p_valor_total, auth.uid()
  ) RETURNING id INTO v_id;
  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.remover_guia_lote_tiss(p_guia_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinica uuid := public.get_my_clinica_id();
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_access_financial(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso financeiro necessário';
  END IF;
  DELETE FROM public.lote_tiss_guias g
   USING public.lotes_tiss l
   WHERE g.id = p_guia_id AND g.clinica_id = v_clinica
     AND l.id = g.lote_id AND l.status = 'rascunho';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Guia não encontrada ou o lote já foi enviado';
  END IF;
  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.pendencias_lote_tiss(p_lote_id uuid)
RETURNS TABLE (guia_id uuid, numero_guia text, campo text, mensagem text, gravidade text, tipo text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinica uuid := public.get_my_clinica_id();
  v_lote public.lotes_tiss%ROWTYPE;
  v_ans text;
  v_qtd integer;
  v_soma numeric(14,2);
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_limite date;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_access_financial(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso financeiro necessário';
  END IF;
  SELECT * INTO v_lote FROM public.lotes_tiss WHERE id = p_lote_id AND clinica_id = v_clinica;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote não encontrado nesta clínica';
  END IF;
  SELECT c.registro_ans INTO v_ans FROM public.convenios c WHERE c.id = v_lote.convenio_id;
  v_limite := (date_trunc('month', v_lote.competencia) + interval '1 month - 1 day')::date;

  IF COALESCE(btrim(v_ans), '') !~ '^\d{6}$' THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, 'registro_ans'::text, 'Registro ANS do convênio deve ter 6 dígitos.'::text, 'erro'::text, 'consistencia'::text;
  END IF;
  IF COALESCE(btrim(v_lote.versao_tiss), '') !~ '^\d{2}\.\d{2}\.\d{2}$' THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, 'versao_tiss'::text, 'Versão TISS deve seguir o formato 00.00.00.'::text, 'erro'::text, 'consistencia'::text;
  END IF;
  IF length(btrim(v_lote.numero_lote)) NOT BETWEEN 1 AND 12 THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, 'numero_lote'::text, 'Número do lote deve ter de 1 a 12 caracteres.'::text, 'erro'::text, 'consistencia'::text;
  END IF;

  SELECT count(*), COALESCE(sum(g.valor_total), 0) INTO v_qtd, v_soma
    FROM public.lote_tiss_guias g WHERE g.lote_id = v_lote.id;
  IF v_qtd = 0 THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, 'guias'::text, 'Lote sem guias detalhadas.'::text, 'aviso'::text, 'consistencia'::text;
    RETURN;
  END IF;
  IF v_qtd <> v_lote.quantidade_guias THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, 'quantidade_guias'::text, 'Quantidade informada difere das guias cadastradas.'::text, 'erro'::text, 'consistencia'::text;
  END IF;
  IF v_soma <> v_lote.valor_apresentado THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, 'valor_apresentado'::text, 'Valor apresentado difere da soma das guias.'::text, 'erro'::text, 'consistencia'::text;
  END IF;

  RETURN QUERY
  SELECT g.id, g.numero_guia, x.campo, x.mensagem, x.gravidade, x.tipo
    FROM public.lote_tiss_guias g
    LEFT JOIN public.autorizacoes_convenio a ON a.id = g.autorizacao_id AND a.clinica_id = g.clinica_id
    CROSS JOIN LATERAL (VALUES
      (COALESCE(btrim(g.numero_carteira), '') = '', 'numero_carteira', 'Informe a carteira do beneficiário.', 'erro', 'consistencia'),
      (btrim(g.codigo_procedimento) !~ '^\d{8}$', 'codigo_procedimento', 'Código do procedimento deve ter 8 dígitos (TUSS).', 'erro', 'consistencia'),
      (g.data_atendimento > v_limite OR g.data_atendimento > v_hoje, 'data_atendimento', 'Data do atendimento é posterior à competência do lote ou futura.', 'erro', 'consistencia'),
      (g.autorizacao_id IS NULL AND g.tipo_servico <> 'consulta', 'autorizacao_id', 'Guia sem autorização vinculada.', 'aviso', 'autorizacao'),
      (g.autorizacao_id IS NOT NULL AND a.id IS NULL, 'autorizacao_id', 'Autorização vinculada não foi encontrada nesta clínica.', 'erro', 'autorizacao'),
      (a.id IS NOT NULL AND a.status <> 'autorizada', 'autorizacao_status', 'Autorização não está autorizada.', 'erro', 'autorizacao'),
      (a.id IS NOT NULL AND a.convenio_id <> v_lote.convenio_id, 'autorizacao_convenio', 'Autorização pertence a outro convênio.', 'erro', 'autorizacao'),
      (a.id IS NOT NULL AND g.paciente_id IS NOT NULL AND a.paciente_id <> g.paciente_id, 'paciente_id', 'Autorização é de outro paciente.', 'erro', 'autorizacao'),
      (a.id IS NOT NULL AND lower(btrim(a.tipo_servico)) <> lower(btrim(g.tipo_servico)), 'tipo_servico', 'Serviço faturado difere do autorizado.', 'erro', 'autorizacao'),
      (a.id IS NOT NULL AND a.data_expiracao IS NOT NULL AND a.data_expiracao::date < g.data_atendimento, 'data_atendimento', 'Atendimento após a validade da autorização.', 'erro', 'autorizacao')
    ) AS x(falha, campo, mensagem, gravidade, tipo)
   WHERE g.lote_id = v_lote.id AND x.falha
   ORDER BY g.created_at, g.id;
END;
$$;

-- O envio passa a recusar lote com guias pendentes de correção.
CREATE OR REPLACE FUNCTION public.registrar_envio_lote_tiss(p_lote_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinica uuid := public.get_my_clinica_id();
  v_id uuid;
  v_erros integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_access_financial(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso financeiro necessário';
  END IF;
  IF v_clinica IS NULL OR p_lote_id IS NULL THEN
    RAISE EXCEPTION 'Lote inválido';
  END IF;

  PERFORM 1 FROM public.lotes_tiss WHERE id = p_lote_id AND clinica_id = v_clinica FOR UPDATE;
  SELECT count(*) INTO v_erros FROM public.pendencias_lote_tiss(p_lote_id) p WHERE p.gravidade = 'erro'
    AND EXISTS (SELECT 1 FROM public.lote_tiss_guias g WHERE g.lote_id = p_lote_id);
  IF v_erros > 0 THEN
    RAISE EXCEPTION 'O lote tem % pendência(s) a corrigir antes do envio', v_erros;
  END IF;

  UPDATE public.lotes_tiss
     SET status = 'enviado', enviado_em = now()
   WHERE id = p_lote_id AND clinica_id = v_clinica AND status = 'rascunho'
  RETURNING id INTO v_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote não encontrado ou não está mais como rascunho';
  END IF;

  RETURN jsonb_build_object('success', true, 'id', v_id, 'status', 'enviado');
END;
$$;

REVOKE ALL ON FUNCTION public.adicionar_guia_lote_tiss(uuid, text, text, uuid, uuid, date, text, text, integer, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adicionar_guia_lote_tiss(uuid, text, text, uuid, uuid, date, text, text, integer, numeric) TO authenticated;
REVOKE ALL ON FUNCTION public.remover_guia_lote_tiss(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remover_guia_lote_tiss(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.pendencias_lote_tiss(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pendencias_lote_tiss(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.registrar_envio_lote_tiss(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_envio_lote_tiss(uuid) TO authenticated;

COMMENT ON TABLE public.lote_tiss_guias IS 'Guias que compõem um lote TISS; gravadas só por RPC enquanto o lote está em rascunho.';
COMMENT ON FUNCTION public.pendencias_lote_tiss(uuid) IS 'Pendências de consistência e divergências autorizado x faturado do lote, por guia e campo.';

COMMIT;
