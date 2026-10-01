BEGIN;

CREATE TABLE public.caixa_diario_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caixa_id uuid NOT NULL REFERENCES public.caixa_diario(id) ON DELETE CASCADE,
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('abertura', 'fechamento', 'reabertura')),
  valor_informado numeric(12,2),
  valor_apurado numeric(12,2),
  motivo text,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  user_nome text,
  fechamento_anterior_valor numeric(12,2),
  fechamento_anterior_operador text,
  fechamento_anterior_em timestamptz,
  fechamento_anterior_observacoes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_caixa_diario_eventos_caixa_data
  ON public.caixa_diario_eventos(caixa_id, created_at DESC);
CREATE INDEX idx_caixa_diario_eventos_clinica_data
  ON public.caixa_diario_eventos(clinica_id, created_at DESC);

ALTER TABLE public.caixa_diario_eventos ENABLE ROW LEVEL SECURITY;
CREATE POLICY caixa_diario_eventos_select_scoped
  ON public.caixa_diario_eventos FOR SELECT TO authenticated
  USING (
    public.is_same_clinica(clinica_id)
    AND (
      public.is_admin(auth.uid())
      OR public.is_financeiro(auth.uid())
      OR public.is_recepcao(auth.uid())
    )
  );
REVOKE ALL ON public.caixa_diario_eventos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.caixa_diario_eventos TO authenticated;

-- All cash state transitions go through transactional RPCs. This makes the
-- close/reopen lock coordinate with registrar_pagamento's FOR SHARE lock.
REVOKE INSERT, UPDATE, DELETE ON public.caixa_diario FROM authenticated;

-- The cash screen and close RPC use the same movement definition. Payments
-- belong to the day they were received, not the date of their original bill.
CREATE OR REPLACE FUNCTION public.movimentos_caixa_diario(p_data date)
RETURNS TABLE (
  id uuid,
  tipo text,
  descricao text,
  valor numeric,
  forma_pagamento text,
  categoria text,
  data date,
  created_at timestamptz,
  paciente_id uuid,
  paciente_nome text,
  origem_pagamento boolean
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT
    p.id,
    l.tipo::text,
    CASE WHEN p.estornado_em IS NULL
      THEN COALESCE(NULLIF(p.observacoes, ''), 'Pagamento: ' || l.descricao)
      ELSE 'Estorno: ' || l.descricao
    END,
    CASE WHEN p.estornado_em IS NULL THEN p.valor ELSE -p.valor END,
    p.forma_pagamento,
    l.categoria,
    (COALESCE(p.estornado_em, p.data_pagamento) AT TIME ZONE 'America/Sao_Paulo')::date,
    COALESCE(p.estornado_em, p.data_pagamento),
    l.paciente_id,
    pa.nome,
    true
  FROM public.pagamentos p
  JOIN public.lancamentos l ON l.id = p.lancamento_id
  LEFT JOIN public.pacientes pa ON pa.id = l.paciente_id
  WHERE COALESCE(p.clinica_id, l.clinica_id) = public.get_my_clinica_id()
    AND p_data IS NOT NULL
    AND (COALESCE(p.estornado_em, p.data_pagamento) AT TIME ZONE 'America/Sao_Paulo')::date = p_data
    AND p.forma_pagamento <> 'credito_paciente'
    AND (
      public.is_admin(auth.uid()) OR public.is_financeiro(auth.uid())
      OR public.is_recepcao(auth.uid())
    )

  UNION ALL

  SELECT
    l.id,
    l.tipo::text,
    l.descricao,
    COALESCE(l.valor_pago, l.valor),
    l.forma_pagamento,
    l.categoria,
    COALESCE(l.data_pagamento, l.data),
    CASE WHEN l.data_pagamento IS NOT NULL THEN l.updated_at ELSE l.created_at END,
    l.paciente_id,
    pa.nome,
    false
  FROM public.lancamentos l
  LEFT JOIN public.pacientes pa ON pa.id = l.paciente_id
  WHERE l.clinica_id = public.get_my_clinica_id()
    AND COALESCE(l.data_pagamento, l.data) = p_data
    AND l.status = 'pago'
    AND l.tipo IN ('receita', 'despesa', 'sangria', 'suprimento')
    AND NOT EXISTS (
      SELECT 1 FROM public.pagamentos p WHERE p.lancamento_id = l.id
    )
    AND (
      public.is_admin(auth.uid()) OR public.is_financeiro(auth.uid())
      OR public.is_recepcao(auth.uid())
    )
  ORDER BY 8 DESC;
$$;

REVOKE ALL ON FUNCTION public.movimentos_caixa_diario(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.movimentos_caixa_diario(date) TO authenticated;

-- The universal audit trigger originally emitted "insert", which the
-- audit_log check constraint rejects. Map trigger operations to its contract.
CREATE OR REPLACE FUNCTION public.fn_audit_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
  v_record_id uuid;
  v_row jsonb;
  v_prev jsonb;
  v_record_name text;
  v_changes jsonb;
  v_clinica_id uuid;
  v_user_id uuid := auth.uid();
  v_user_name text;
BEGIN
  v_action := CASE TG_OP WHEN 'INSERT' THEN 'create' WHEN 'UPDATE' THEN 'update' WHEN 'DELETE' THEN 'delete' END;

  IF TG_OP = 'DELETE' THEN
    v_row := to_jsonb(OLD);
    v_record_id := (v_row->>'id')::uuid;
  ELSE
    v_row := to_jsonb(NEW);
    v_prev := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END;
    v_record_id := (v_row->>'id')::uuid;
  END IF;

  v_record_name := COALESCE(v_row->>'nome', v_row->>'descricao', v_row->>'titulo', v_row->>'assunto');
  IF TG_TABLE_NAME = 'clinicas' THEN
    v_clinica_id := v_record_id;
  ELSE
    v_clinica_id := NULLIF(v_row->>'clinica_id', '')::uuid;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT jsonb_object_agg(key, jsonb_build_object('de', v_prev->key, 'para', v_row->key))
      INTO v_changes
      FROM jsonb_each(v_row)
     WHERE key <> 'updated_at' AND v_prev->key IS DISTINCT FROM v_row->key;
    IF v_changes IS NULL THEN RETURN NULL; END IF;
  END IF;

  IF v_user_id IS NOT NULL THEN
    SELECT nome INTO v_user_name FROM public.profiles WHERE id = v_user_id;
  END IF;

  BEGIN
    INSERT INTO public.audit_log(action, collection, record_id, record_name, changes, user_id, user_name, clinica_id)
    VALUES (v_action, TG_TABLE_NAME, v_record_id, v_record_name, v_changes, v_user_id, v_user_name, v_clinica_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[fn_audit_row] falha ao gravar auditoria de %.%: %', TG_TABLE_NAME, v_record_id, SQLERRM;
  END;
  RETURN NULL;
END;
$$;

-- Serialize physical cash transactions with a close. Online card,
-- PIX, boleto and bank settlement webhooks must not depend on a drawer being
-- open. Old cash movements still lock their own register, protecting closed
-- history against edits and deletions.
CREATE OR REPLACE FUNCTION public.exigir_caixa_aberto_para_lancamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old_movimento boolean := false;
  v_new_movimento boolean := false;
  v_old_data date;
  v_new_data date;
  v_old_clinica uuid;
  v_new_clinica uuid;
  v_alvo record;
  v_aberto boolean;
BEGIN
  -- Preserve descriptive edits on old rows; only financial/accounting changes
  -- need to lock the associated register.
  IF TG_OP = 'UPDATE'
     AND OLD.status IS NOT DISTINCT FROM NEW.status
     AND OLD.tipo IS NOT DISTINCT FROM NEW.tipo
     AND OLD.categoria IS NOT DISTINCT FROM NEW.categoria
     AND OLD.forma_pagamento IS NOT DISTINCT FROM NEW.forma_pagamento
     AND OLD.valor IS NOT DISTINCT FROM NEW.valor
     AND OLD.valor_pago IS NOT DISTINCT FROM NEW.valor_pago
     AND OLD.desconto IS NOT DISTINCT FROM NEW.desconto
     AND OLD.acrescimo IS NOT DISTINCT FROM NEW.acrescimo
     AND OLD.data IS NOT DISTINCT FROM NEW.data
     AND OLD.data_pagamento IS NOT DISTINCT FROM NEW.data_pagamento
     AND OLD.clinica_id IS NOT DISTINCT FROM NEW.clinica_id THEN
    RETURN NEW;
  END IF;

  IF TG_OP <> 'INSERT' THEN
    v_old_movimento := OLD.status = 'pago'
      AND OLD.tipo IN ('receita', 'despesa', 'sangria', 'suprimento')
      AND (OLD.categoria = 'receita_caixa' OR OLD.tipo IN ('sangria', 'suprimento') OR OLD.forma_pagamento = 'dinheiro');
    IF v_old_movimento THEN
      v_old_data := COALESCE(OLD.data_pagamento, OLD.data);
      v_old_clinica := OLD.clinica_id;
    END IF;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    v_new_movimento := NEW.status = 'pago'
      AND NEW.tipo IN ('receita', 'despesa', 'sangria', 'suprimento')
      AND (NEW.categoria = 'receita_caixa' OR NEW.tipo IN ('sangria', 'suprimento') OR NEW.forma_pagamento = 'dinheiro');
    IF v_new_movimento THEN
      v_new_data := COALESCE(NEW.data_pagamento, NEW.data);
      v_new_clinica := NEW.clinica_id;
    END IF;
  END IF;
  IF NOT v_old_movimento AND NOT v_new_movimento THEN RETURN COALESCE(NEW, OLD); END IF;

  FOR v_alvo IN
    SELECT alvo.data, alvo.clinica_id
      FROM (
        SELECT v_old_data AS data, v_old_clinica AS clinica_id WHERE v_old_movimento
        UNION
        SELECT v_new_data AS data, v_new_clinica AS clinica_id WHERE v_new_movimento
      ) alvo
     ORDER BY alvo.data, alvo.clinica_id
  LOOP
    IF auth.uid() IS NOT NULL AND v_alvo.clinica_id IS DISTINCT FROM public.get_my_clinica_id() THEN
      RAISE EXCEPTION 'Lançamento fora da clínica do usuário.' USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT c.aberto INTO v_aberto
      FROM public.caixa_diario c
     WHERE c.clinica_id = v_alvo.clinica_id AND c.data = v_alvo.data
     FOR SHARE;
    IF NOT FOUND OR NOT v_aberto THEN
      RAISE EXCEPTION 'Caixa de % fechado ou inexistente.', v_alvo.data USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_lancamento_exige_caixa_aberto ON public.lancamentos;
CREATE TRIGGER trg_lancamento_exige_caixa_aberto
  BEFORE INSERT OR UPDATE OR DELETE ON public.lancamentos
  FOR EACH ROW EXECUTE FUNCTION public.exigir_caixa_aberto_para_lancamento();

-- registrar_pagamento already takes this lock, and the trigger also protects
-- authenticated direct writes allowed by the existing pagamentos RLS policy.
CREATE OR REPLACE FUNCTION public.exigir_caixa_aberto_para_pagamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_clinica uuid;
  v_movimento boolean := false;
  v_aberto boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_movimento := NEW.forma_pagamento <> 'credito_paciente';
    v_clinica := NEW.clinica_id;
    IF v_movimento AND (NEW.data_pagamento AT TIME ZONE 'America/Sao_Paulo')::date <> v_hoje THEN
      RAISE EXCEPTION 'O pagamento deve usar a data atual de Brasília.' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    v_movimento := OLD.forma_pagamento <> 'credito_paciente'
      AND (COALESCE(OLD.estornado_em, OLD.data_pagamento) AT TIME ZONE 'America/Sao_Paulo')::date = v_hoje
      AND (OLD.estornado_em IS DISTINCT FROM NEW.estornado_em
        OR OLD.valor IS DISTINCT FROM NEW.valor
        OR OLD.forma_pagamento IS DISTINCT FROM NEW.forma_pagamento
        OR OLD.data_pagamento IS DISTINCT FROM NEW.data_pagamento);
    v_movimento := v_movimento OR (
      NEW.forma_pagamento <> 'credito_paciente'
      AND (COALESCE(NEW.estornado_em, NEW.data_pagamento) AT TIME ZONE 'America/Sao_Paulo')::date = v_hoje
      AND (OLD.estornado_em IS DISTINCT FROM NEW.estornado_em
        OR OLD.valor IS DISTINCT FROM NEW.valor
        OR OLD.forma_pagamento IS DISTINCT FROM NEW.forma_pagamento
        OR OLD.data_pagamento IS DISTINCT FROM NEW.data_pagamento)
    );
    v_clinica := NEW.clinica_id;
  ELSE
    v_movimento := OLD.forma_pagamento <> 'credito_paciente'
      AND (COALESCE(OLD.estornado_em, OLD.data_pagamento) AT TIME ZONE 'America/Sao_Paulo')::date = v_hoje;
    v_clinica := OLD.clinica_id;
  END IF;
  IF NOT v_movimento THEN RETURN COALESCE(NEW, OLD); END IF;
  IF auth.uid() IS NOT NULL AND v_clinica IS DISTINCT FROM public.get_my_clinica_id() THEN
    RAISE EXCEPTION 'Pagamento fora da clínica do usuário.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT c.aberto INTO v_aberto
    FROM public.caixa_diario c
   WHERE c.clinica_id = v_clinica AND c.data = v_hoje
   FOR SHARE;
  IF NOT FOUND OR NOT v_aberto THEN
    RAISE EXCEPTION 'Caixa fechado. Abra o caixa do dia antes de registrar pagamentos.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_pagamento_exige_caixa_aberto ON public.pagamentos;
CREATE TRIGGER trg_pagamento_exige_caixa_aberto
  BEFORE INSERT OR UPDATE OR DELETE ON public.pagamentos
  FOR EACH ROW EXECUTE FUNCTION public.exigir_caixa_aberto_para_pagamento();

CREATE OR REPLACE FUNCTION public.abrir_caixa_diario(p_valor_abertura numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_clinica uuid;
  v_nome text;
  v_data date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_caixa public.caixa_diario%ROWTYPE;
BEGIN
  IF v_user IS NULL OR NOT (
    public.is_admin(v_user) OR public.is_financeiro(v_user) OR public.is_recepcao(v_user)
  ) THEN
    RETURN jsonb_build_object('code', 'sem_permissao');
  END IF;

  v_clinica := public.get_my_clinica_id();
  IF v_clinica IS NULL OR NOT public.is_same_clinica(v_clinica) THEN
    RETURN jsonb_build_object('code', 'sem_permissao');
  END IF;
  IF p_valor_abertura IS NULL OR p_valor_abertura < 0
     OR p_valor_abertura <> round(p_valor_abertura, 2) THEN
    RETURN jsonb_build_object('code', 'valor_invalido');
  END IF;
  SELECT nome INTO v_nome FROM public.profiles WHERE id = v_user;

  INSERT INTO public.caixa_diario(
    data, aberto, valor_abertura, operador_abertura, clinica_id
  ) VALUES (
    v_data, true, p_valor_abertura, v_nome, v_clinica
  ) ON CONFLICT (data, clinica_id) DO NOTHING
  RETURNING * INTO v_caixa;

  IF v_caixa.id IS NULL THEN
    RETURN jsonb_build_object('code', 'caixa_existente');
  END IF;

  INSERT INTO public.caixa_diario_eventos(
    caixa_id, clinica_id, tipo, valor_informado, user_id, user_nome
  ) VALUES (
    v_caixa.id, v_clinica, 'abertura', p_valor_abertura, v_user, v_nome
  );

  RETURN jsonb_build_object('code', 'aberto', 'caixa_id', v_caixa.id, 'data', v_data);
END;
$$;

CREATE OR REPLACE FUNCTION public.fechar_caixa_diario(
  p_caixa_id uuid,
  p_valor_contado numeric,
  p_observacoes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_clinica uuid;
  v_nome text;
  v_data date;
  v_caixa public.caixa_diario%ROWTYPE;
  v_esperado numeric(12,2);
BEGIN
  IF v_user IS NULL OR NOT (
    public.is_admin(v_user) OR public.is_financeiro(v_user) OR public.is_recepcao(v_user)
  ) THEN
    RETURN jsonb_build_object('code', 'sem_permissao');
  END IF;
  v_clinica := public.get_my_clinica_id();
  IF v_clinica IS NULL OR NOT public.is_same_clinica(v_clinica) THEN
    RETURN jsonb_build_object('code', 'sem_permissao');
  END IF;
  IF p_valor_contado IS NULL OR p_valor_contado < 0
     OR p_valor_contado <> round(p_valor_contado, 2) THEN
    RETURN jsonb_build_object('code', 'valor_invalido');
  END IF;

  SELECT * INTO v_caixa
    FROM public.caixa_diario
   WHERE id = p_caixa_id AND clinica_id = v_clinica
   FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('code', 'caixa_inexistente'); END IF;
  IF NOT v_caixa.aberto THEN RETURN jsonb_build_object('code', 'ja_fechado'); END IF;
  v_data := v_caixa.data;

  SELECT round(v_caixa.valor_abertura + coalesce(sum(
    CASE WHEN tipo IN ('receita', 'suprimento') THEN valor ELSE -valor END
  ), 0), 2)
    INTO v_esperado
    FROM public.movimentos_caixa_diario(v_data)
   WHERE forma_pagamento = 'dinheiro';

  IF round(p_valor_contado, 2) <> v_esperado
     AND length(trim(coalesce(p_observacoes, ''))) < 5 THEN
    RETURN jsonb_build_object('code', 'motivo_divergencia_obrigatorio', 'valor_apurado', v_esperado);
  END IF;

  SELECT nome INTO v_nome FROM public.profiles WHERE id = v_user;
  UPDATE public.caixa_diario
     SET aberto = false,
         valor_fechamento = p_valor_contado,
         operador_fechamento = v_nome,
         observacoes = nullif(trim(p_observacoes), ''),
         updated_at = now()
   WHERE id = v_caixa.id AND aberto = true;

  INSERT INTO public.caixa_diario_eventos(
    caixa_id, clinica_id, tipo, valor_informado, valor_apurado,
    motivo, user_id, user_nome
  ) VALUES (
    v_caixa.id, v_clinica, 'fechamento', p_valor_contado, v_esperado,
    nullif(trim(p_observacoes), ''), v_user, v_nome
  );

  RETURN jsonb_build_object('code', 'fechado', 'valor_apurado', v_esperado);
END;
$$;

CREATE OR REPLACE FUNCTION public.reabrir_caixa_diario(p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_clinica uuid;
  v_nome text;
  v_data date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_caixa public.caixa_diario%ROWTYPE;
BEGIN
  -- Reopening changes cash control: keep it to the clinic admin/finance role.
  IF v_user IS NULL OR NOT (
    public.is_admin(v_user) OR public.is_financeiro(v_user)
  ) THEN
    RETURN jsonb_build_object('code', 'sem_permissao');
  END IF;
  v_clinica := public.get_my_clinica_id();
  IF v_clinica IS NULL OR NOT public.is_same_clinica(v_clinica) THEN
    RETURN jsonb_build_object('code', 'sem_permissao');
  END IF;
  IF length(trim(coalesce(p_motivo, ''))) < 10 THEN
    RETURN jsonb_build_object('code', 'motivo_invalido');
  END IF;

  SELECT * INTO v_caixa
    FROM public.caixa_diario
   WHERE clinica_id = v_clinica AND data = v_data
   FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('code', 'caixa_inexistente'); END IF;
  IF v_caixa.aberto THEN RETURN jsonb_build_object('code', 'ja_aberto'); END IF;

  SELECT nome INTO v_nome FROM public.profiles WHERE id = v_user;
  INSERT INTO public.caixa_diario_eventos(
    caixa_id, clinica_id, tipo, motivo, user_id, user_nome,
    fechamento_anterior_valor, fechamento_anterior_operador,
    fechamento_anterior_em, fechamento_anterior_observacoes
  ) VALUES (
    v_caixa.id, v_clinica, 'reabertura', trim(p_motivo), v_user, v_nome,
    v_caixa.valor_fechamento, v_caixa.operador_fechamento,
    v_caixa.updated_at, v_caixa.observacoes
  );

  INSERT INTO public.audit_log(
    action, collection, record_id, record_name, changes,
    user_id, user_name, clinica_id
  ) VALUES (
    'update', 'caixa_diario', v_caixa.id::text, 'Cash register',
    jsonb_build_object(
      'evento', 'reabertura',
      'motivo', trim(p_motivo),
      'fechamento_anterior', jsonb_build_object(
        'valor', v_caixa.valor_fechamento,
        'operador', v_caixa.operador_fechamento,
        'em', v_caixa.updated_at,
        'observacoes', v_caixa.observacoes
      )
    ),
    v_user, v_nome, v_clinica
  );

  UPDATE public.caixa_diario
     SET aberto = true,
         valor_fechamento = NULL,
         operador_fechamento = NULL,
         observacoes = NULL,
         updated_at = now()
   WHERE id = v_caixa.id AND aberto = false;

  RETURN jsonb_build_object('code', 'reaberto', 'caixa_id', v_caixa.id, 'data', v_data);
END;
$$;

REVOKE ALL ON FUNCTION public.abrir_caixa_diario(numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fechar_caixa_diario(uuid, numeric, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reabrir_caixa_diario(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.abrir_caixa_diario(numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fechar_caixa_diario(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reabrir_caixa_diario(text) TO authenticated;

COMMIT;
