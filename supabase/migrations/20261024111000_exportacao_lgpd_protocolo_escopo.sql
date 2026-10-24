-- Exportação LGPD por paciente com protocolo, escopo e confirmação de conclusão.
--
-- Cada pedido recebe um protocolo legível e imutável e guarda as categorias
-- escolhidas. A conclusão (entrega ao titular) só acontece por RPC de admin da
-- clínica, com evidência textual e evento em audit_log; a troca direta de
-- status pela API passa a ser recusada.
BEGIN;

ALTER TABLE public.lgpd_access_request_log
  ADD COLUMN IF NOT EXISTS protocolo text,
  ADD COLUMN IF NOT EXISTS escopo text[];

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'lgpd_access_request_log_escopo_valido'
       AND conrelid = 'public.lgpd_access_request_log'::regclass
  ) THEN
    ALTER TABLE public.lgpd_access_request_log
      ADD CONSTRAINT lgpd_access_request_log_escopo_valido CHECK (
        escopo IS NULL OR escopo <@ ARRAY['cadastro', 'agenda', 'clinico', 'anexos', 'financeiro', 'comunicacao', 'auditoria']::text[]
      );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.protocolo_lgpd(p_id uuid, p_em timestamptz)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT 'LGPD-' || to_char(p_em AT TIME ZONE 'America/Sao_Paulo', 'YYYYMMDD')
    || '-' || upper(substr(replace(p_id::text, '-', ''), 1, 8));
$$;
REVOKE ALL ON FUNCTION public.protocolo_lgpd(uuid, timestamptz) FROM PUBLIC, anon, authenticated;

UPDATE public.lgpd_access_request_log
   SET protocolo = public.protocolo_lgpd(id, requested_at)
 WHERE protocolo IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS lgpd_access_request_log_protocolo_unico
  ON public.lgpd_access_request_log (protocolo)
  WHERE protocolo IS NOT NULL;

CREATE OR REPLACE FUNCTION public.proteger_pedido_lgpd()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.protocolo := public.protocolo_lgpd(NEW.id, NEW.requested_at);
    RETURN NEW;
  END IF;

  NEW.protocolo := OLD.protocolo;
  NEW.escopo := OLD.escopo;
  IF NEW.status IS DISTINCT FROM OLD.status
     AND current_setting('app.lgpd_request_decision', true) IS DISTINCT FROM 'on'
     AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Conclua o pedido pela confirmação de entrega.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.proteger_pedido_lgpd() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS lgpd_access_request_log_proteger ON public.lgpd_access_request_log;
CREATE TRIGGER lgpd_access_request_log_proteger
  BEFORE INSERT OR UPDATE ON public.lgpd_access_request_log
  FOR EACH ROW EXECUTE FUNCTION public.proteger_pedido_lgpd();

CREATE OR REPLACE FUNCTION public.concluir_exportacao_lgpd_paciente(p_id uuid, p_evidencia text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_evidencia text := btrim(COALESCE(p_evidencia, ''));
  v_pedido public.lgpd_access_request_log%ROWTYPE;
  v_concluido_em timestamptz := now();
BEGIN
  IF v_user_id IS NULL OR NOT public.is_admin(v_user_id) THEN
    RAISE EXCEPTION 'Somente administradores confirmam a entrega ao titular.' USING ERRCODE = '42501';
  END IF;
  IF char_length(v_evidencia) < 20 OR char_length(v_evidencia) > 1000 THEN
    RAISE EXCEPTION 'Descreva como a entrega foi feita (20 a 1.000 caracteres).' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_pedido FROM public.lgpd_access_request_log WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_same_clinica(v_pedido.clinica_id) THEN
    RAISE EXCEPTION 'Pedido não encontrado nesta clínica.' USING ERRCODE = '42501';
  END IF;
  IF v_pedido.request_type <> 'export' THEN
    RAISE EXCEPTION 'Este pedido não é uma exportação.' USING ERRCODE = '22023';
  END IF;
  IF v_pedido.status <> 'pending' THEN
    RAISE EXCEPTION 'Este pedido já foi concluído.' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.lgpd_request_decision', 'on', true);
  UPDATE public.lgpd_access_request_log
     SET status = 'fulfilled',
         fulfillment_date = v_concluido_em,
         responsavel_id = v_user_id,
         evidencia = v_evidencia,
         updated_at = v_concluido_em
   WHERE id = p_id;
  PERFORM set_config('app.lgpd_request_decision', 'off', true);

  INSERT INTO public.audit_log (user_id, action, collection, record_id, record_name, changes)
  VALUES (
    v_user_id, 'update', 'lgpd_access_request_log', p_id::text,
    'Exportação LGPD ' || v_pedido.protocolo,
    jsonb_build_object('status', 'fulfilled', 'protocolo', v_pedido.protocolo, 'escopo', v_pedido.escopo)
  );

  RETURN jsonb_build_object('protocolo', v_pedido.protocolo, 'status', 'fulfilled', 'fulfillment_date', v_concluido_em);
END;
$$;

REVOKE ALL ON FUNCTION public.concluir_exportacao_lgpd_paciente(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.concluir_exportacao_lgpd_paciente(uuid, text) TO authenticated;

COMMIT;
