-- A mesma guia não pode ser cobrada em dois lotes TISS.
--
-- pendencias_lote_tiss só conferia a guia dentro do próprio lote (UNIQUE por
-- lote). A mesma guia podia ir em dois lotes do mesmo convênio e ser cobrada
-- duas vezes. Agora é pendência de erro, que bloqueia o envio, quando o número
-- da guia já está em outro lote da clínica para o mesmo convênio que não foi
-- cancelado nem rejeitado (guia de lote rejeitado pode ser reenviada).
-- Definição parte de 20261024130000_guias_e_validacao_lote_tiss.sql.
BEGIN;

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
      (EXISTS (
         SELECT 1 FROM public.lote_tiss_guias o
           JOIN public.lotes_tiss ol ON ol.id = o.lote_id
          WHERE o.clinica_id = g.clinica_id AND o.lote_id <> g.lote_id
            AND btrim(o.numero_guia) = btrim(g.numero_guia)
            AND ol.convenio_id = v_lote.convenio_id
            AND ol.status NOT IN ('cancelado', 'rejeitado')
       ), 'numero_guia', 'Esta guia já está em outro lote do mesmo convênio.', 'erro', 'consistencia'),
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

COMMIT;
