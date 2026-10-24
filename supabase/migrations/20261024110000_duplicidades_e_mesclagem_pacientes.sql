-- Revisão de cadastros duplicados e mesclagem campo a campo.
--
-- Detecção: pontua pares de pacientes ativos da mesma clínica por CPF (100),
-- nome + nascimento (70), telefone (40) e nome igual sem nascimento coincidente
-- (20); a tela escolhe o limiar. Nada é mesclado automaticamente.
--
-- Mesclagem: só administradores. Registros clínicos (prontuários, atestados,
-- prescrições, exames, encaminhamentos) têm triggers que impedem trocar o
-- paciente vinculado; por isso continuam na ficha de origem, com autoria e
-- assinatura intactas, e a origem fica inativada apontando para o destino.
-- Somente compromissos futuros ativos e pedidos ativos da lista de espera migram
-- para o destino. Nada é apagado.
BEGIN;

ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS mesclado_em_paciente_id uuid REFERENCES public.pacientes(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.pacientes.mesclado_em_paciente_id IS
  'Ficha que recebeu este cadastro numa mesclagem. O histórico clínico continua nesta ficha.';

CREATE OR REPLACE FUNCTION public.proteger_mesclagem_paciente()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.mesclado_em_paciente_id IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.mesclado_em_paciente_id END)
     AND current_setting('app.allow_patient_status_rpc', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'A mesclagem de cadastros só pode ser feita pela operação administrativa.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.proteger_mesclagem_paciente() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS pacientes_proteger_mesclagem ON public.pacientes;
CREATE TRIGGER pacientes_proteger_mesclagem
  BEFORE INSERT OR UPDATE OF mesclado_em_paciente_id ON public.pacientes
  FOR EACH ROW EXECUTE FUNCTION public.proteger_mesclagem_paciente();

CREATE TABLE IF NOT EXISTS public.pacientes_duplicidade_descartes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  paciente_a uuid NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,
  paciente_b uuid NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,
  decidido_por uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  decidido_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pacientes_duplicidade_descartes_ordem CHECK (paciente_a < paciente_b),
  CONSTRAINT pacientes_duplicidade_descartes_unico UNIQUE (clinica_id, paciente_a, paciente_b)
);

CREATE TABLE IF NOT EXISTS public.pacientes_mesclagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  origem_id uuid NOT NULL REFERENCES public.pacientes(id) ON DELETE RESTRICT,
  destino_id uuid NOT NULL REFERENCES public.pacientes(id) ON DELETE RESTRICT,
  campos_copiados text[] NOT NULL DEFAULT '{}',
  destino_antes jsonb NOT NULL,
  origem_snapshot jsonb NOT NULL,
  referencias_movidas jsonb NOT NULL DEFAULT '{}'::jsonb,
  referencias_preservadas jsonb NOT NULL DEFAULT '{}'::jsonb,
  motivo text NOT NULL CHECK (char_length(btrim(motivo)) BETWEEN 10 AND 500),
  mesclado_por uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  mesclado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pacientes_mesclagens_origem_unica UNIQUE (origem_id),
  CONSTRAINT pacientes_mesclagens_distintos CHECK (origem_id <> destino_id)
);

CREATE INDEX IF NOT EXISTS pacientes_mesclagens_destino_idx
  ON public.pacientes_mesclagens (clinica_id, destino_id);

ALTER TABLE public.pacientes_duplicidade_descartes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pacientes_mesclagens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pacientes_duplicidade_descartes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.pacientes_mesclagens FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.pacientes_duplicidade_descartes TO authenticated;
GRANT SELECT ON public.pacientes_mesclagens TO authenticated;

DROP POLICY IF EXISTS pacientes_duplicidade_descartes_select ON public.pacientes_duplicidade_descartes;
CREATE POLICY pacientes_duplicidade_descartes_select ON public.pacientes_duplicidade_descartes
  FOR SELECT TO authenticated
  USING (public.can_manage_data(auth.uid()) AND public.is_same_clinica(clinica_id));

DROP POLICY IF EXISTS pacientes_mesclagens_select ON public.pacientes_mesclagens;
CREATE POLICY pacientes_mesclagens_select ON public.pacientes_mesclagens
  FOR SELECT TO authenticated
  USING (public.can_manage_data(auth.uid()) AND public.is_same_clinica(clinica_id));

CREATE OR REPLACE FUNCTION public.normalizar_nome_revisao(p_nome text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT regexp_replace(
    translate(lower(btrim(COALESCE(p_nome, ''))),
      'áàâãäéèêëíìîïóòôõöúùûüç',
      'aaaaaeeeeiiiiooooouuuuc'),
    '[^a-z0-9]', '', 'g'
  );
$$;
REVOKE ALL ON FUNCTION public.normalizar_nome_revisao(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.listar_duplicidades_pacientes(
  p_limiar integer DEFAULT 70,
  p_limite integer DEFAULT 50
)
RETURNS TABLE (
  paciente_a uuid,
  nome_a text,
  nascimento_a date,
  telefone_final_a text,
  paciente_b uuid,
  nome_b text,
  nascimento_b date,
  telefone_final_b text,
  pontuacao integer,
  motivos text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinica_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_data(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissao para revisar cadastros.' USING ERRCODE = '42501';
  END IF;
  IF p_limiar IS NULL OR p_limiar < 20 OR p_limiar > 100 THEN
    RAISE EXCEPTION 'O limiar deve ficar entre 20 e 100.' USING ERRCODE = '22023';
  END IF;

  v_clinica_id := public.get_my_clinica_id();
  IF v_clinica_id IS NULL OR NOT public.is_same_clinica(v_clinica_id) THEN
    RAISE EXCEPTION 'Clinica nao identificada.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      p.id,
      p.nome,
      p.data_nascimento,
      NULLIF(regexp_replace(COALESCE(p.cpf, ''), '[^0-9]', '', 'g'), '') AS cpf,
      public.normalizar_telefone_revisao(p.telefone) AS tel,
      public.normalizar_nome_revisao(p.nome) AS nome_n
    FROM public.pacientes p
    WHERE p.clinica_id = v_clinica_id
      AND p.ativo
  ),
  pares AS (
    SELECT a.id AS a_id, b.id AS b_id FROM base a JOIN base b ON a.id < b.id AND a.cpf = b.cpf
     WHERE char_length(a.cpf) = 11
    UNION
    SELECT a.id, b.id FROM base a JOIN base b ON a.id < b.id AND a.tel = b.tel
     WHERE char_length(a.tel) >= 10
    UNION
    SELECT a.id, b.id FROM base a JOIN base b ON a.id < b.id AND a.nome_n = b.nome_n
     WHERE char_length(a.nome_n) >= 3
  ),
  pontuados AS (
    SELECT
      a.id AS a_id, a.nome AS a_nome, a.data_nascimento AS a_nasc, a.tel AS a_tel,
      b.id AS b_id, b.nome AS b_nome, b.data_nascimento AS b_nasc, b.tel AS b_tel,
      array_remove(ARRAY[
        CASE WHEN char_length(a.cpf) = 11 AND a.cpf = b.cpf THEN 'cpf' END,
        CASE WHEN a.nome_n = b.nome_n AND a.data_nascimento = b.data_nascimento THEN 'nome_data_nascimento' END,
        CASE WHEN char_length(a.tel) >= 10 AND a.tel = b.tel THEN 'telefone' END,
        CASE WHEN a.nome_n = b.nome_n AND a.data_nascimento IS DISTINCT FROM b.data_nascimento THEN 'nome' END
      ], NULL) AS razoes
    FROM pares
    JOIN base a ON a.id = pares.a_id
    JOIN base b ON b.id = pares.b_id
  ),
  com_pontos AS (
    SELECT *,
      LEAST(100,
        (CASE WHEN 'cpf' = ANY(pontuados.razoes) THEN 100 ELSE 0 END)
        + (CASE WHEN 'nome_data_nascimento' = ANY(pontuados.razoes) THEN 70 ELSE 0 END)
        + (CASE WHEN 'telefone' = ANY(pontuados.razoes) THEN 40 ELSE 0 END)
        + (CASE WHEN 'nome' = ANY(pontuados.razoes) THEN 20 ELSE 0 END)
      )::integer AS pontos
    FROM pontuados
  )
  SELECT
    c.a_id, c.a_nome, c.a_nasc,
    CASE WHEN char_length(c.a_tel) > 4 THEN right(c.a_tel, 4) END,
    c.b_id, c.b_nome, c.b_nasc,
    CASE WHEN char_length(c.b_tel) > 4 THEN right(c.b_tel, 4) END,
    c.pontos, c.razoes
  FROM com_pontos c
  WHERE c.pontos >= p_limiar
    AND NOT EXISTS (
      SELECT 1 FROM public.pacientes_duplicidade_descartes d
       WHERE d.clinica_id = v_clinica_id AND d.paciente_a = c.a_id AND d.paciente_b = c.b_id
    )
  ORDER BY c.pontos DESC, c.a_nome
  LIMIT LEAST(GREATEST(COALESCE(p_limite, 50), 1), 200);
END;
$$;

REVOKE ALL ON FUNCTION public.listar_duplicidades_pacientes(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_duplicidades_pacientes(integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.descartar_duplicidade_pacientes(p_paciente_a uuid, p_paciente_b uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_clinica_id uuid := public.get_my_clinica_id();
BEGIN
  IF v_user_id IS NULL OR NOT public.can_manage_data(v_user_id) THEN
    RAISE EXCEPTION 'Sem permissao para revisar cadastros.' USING ERRCODE = '42501';
  END IF;
  IF p_paciente_a IS NULL OR p_paciente_b IS NULL OR p_paciente_a = p_paciente_b THEN
    RAISE EXCEPTION 'Informe dois cadastros diferentes.' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM public.pacientes
       WHERE id IN (p_paciente_a, p_paciente_b) AND clinica_id = v_clinica_id) <> 2 THEN
    RAISE EXCEPTION 'Paciente nao encontrado nesta clinica.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.pacientes_duplicidade_descartes (clinica_id, paciente_a, paciente_b, decidido_por)
  VALUES (v_clinica_id, LEAST(p_paciente_a, p_paciente_b), GREATEST(p_paciente_a, p_paciente_b), v_user_id)
  ON CONFLICT (clinica_id, paciente_a, paciente_b) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.descartar_duplicidade_pacientes(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.descartar_duplicidade_pacientes(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.mesclar_pacientes(
  p_origem uuid,
  p_destino uuid,
  p_campos text[],
  p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- Dados cadastrais que podem vir da origem. Clínicos, status e confirmações
  -- de contato ficam de fora de propósito.
  v_permitidos constant text[] := ARRAY[
    'nome', 'nome_social', 'cpf', 'data_nascimento', 'sexo', 'telefone', 'email',
    'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'estado',
    'convenio_id', 'numero_carteira', 'validade_carteira', 'estado_civil', 'profissao',
    'nome_responsavel', 'cpf_responsavel', 'parentesco_responsavel'
  ];
  v_user_id uuid := auth.uid();
  v_clinica_id uuid := public.get_my_clinica_id();
  v_campos text[] := ARRAY(SELECT DISTINCT c FROM unnest(COALESCE(p_campos, '{}'::text[])) c ORDER BY c);
  v_motivo text := btrim(COALESCE(p_motivo, ''));
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_origem public.pacientes%ROWTYPE;
  v_destino public.pacientes%ROWTYPE;
  v_locked integer;
  v_set text;
  v_agendamentos integer := 0;
  v_lista_espera integer := 0;
  v_preservadas jsonb := '{}'::jsonb;
  v_ref record;
  v_n bigint;
  v_mesclagem_id uuid;
BEGIN
  IF v_user_id IS NULL OR NOT public.is_admin(v_user_id) THEN
    RAISE EXCEPTION 'Somente administradores podem mesclar cadastros.' USING ERRCODE = '42501';
  END IF;
  IF p_origem IS NULL OR p_destino IS NULL OR p_origem = p_destino THEN
    RAISE EXCEPTION 'Escolha dois cadastros diferentes.' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_motivo) < 10 OR char_length(v_motivo) > 500 THEN
    RAISE EXCEPTION 'Descreva o motivo da mesclagem (10 a 500 caracteres).' USING ERRCODE = '22023';
  END IF;
  IF NOT (v_campos <@ v_permitidos) THEN
    RAISE EXCEPTION 'Campo nao permitido na mesclagem.' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_locked FROM (
    SELECT id FROM public.pacientes
     WHERE id IN (p_origem, p_destino) AND clinica_id = v_clinica_id
     ORDER BY id
     FOR UPDATE
  ) travados;
  IF v_locked <> 2 THEN
    RAISE EXCEPTION 'Paciente nao encontrado nesta clinica.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_origem FROM public.pacientes WHERE id = p_origem;
  SELECT * INTO v_destino FROM public.pacientes WHERE id = p_destino;
  IF NOT v_origem.ativo OR NOT v_destino.ativo
     OR v_origem.mesclado_em_paciente_id IS NOT NULL
     OR v_destino.mesclado_em_paciente_id IS NOT NULL THEN
    RAISE EXCEPTION 'Os dois cadastros precisam estar ativos e sem mesclagem anterior.' USING ERRCODE = 'check_violation';
  END IF;

  -- O CPF é único por clínica: a origem libera o valor antes de ele ir para o destino.
  IF 'cpf' = ANY(v_campos) AND v_origem.cpf IS NOT NULL THEN
    UPDATE public.pacientes SET cpf = NULL WHERE id = p_origem;
  END IF;

  IF cardinality(v_campos) > 0 THEN
    SELECT string_agg(format('%1$I = o.%1$I', c), ', ') INTO v_set FROM unnest(v_campos) c;
    EXECUTE format(
      'UPDATE public.pacientes d SET %s FROM jsonb_populate_record(NULL::public.pacientes, $1) o WHERE d.id = $2',
      v_set
    ) USING to_jsonb(v_origem), p_destino;
  END IF;

  BEGIN
    UPDATE public.agendamentos
       SET paciente_id = p_destino
     WHERE paciente_id = p_origem
       AND clinica_id = v_clinica_id
       AND data >= v_hoje
       AND COALESCE(status::text, 'agendado') NOT IN ('cancelado', 'faltou', 'finalizado', 'atendimento_finalizado');
    GET DIAGNOSTICS v_agendamentos = ROW_COUNT;

    UPDATE public.lista_espera
       SET paciente_id = p_destino
     WHERE paciente_id = p_origem
       AND clinica_id = v_clinica_id
       AND status IN ('aguardando', 'notificado', 'confirmado');
    GET DIAGNOSTICS v_lista_espera = ROW_COUNT;
  EXCEPTION WHEN unique_violation OR exclusion_violation THEN
    RAISE EXCEPTION 'Os dois cadastros têm compromissos ou pedidos de espera conflitantes. Resolva-os na agenda antes de mesclar.'
      USING ERRCODE = 'check_violation';
  END;

  -- Contagem do que continua ligado à origem, para a trilha e para a tela.
  FOR v_ref IN
    SELECT c.conrelid::regclass AS tabela, a.attname AS coluna
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
     WHERE c.contype = 'f'
       AND c.confrelid = 'public.pacientes'::regclass
       AND cardinality(c.conkey) = 1
       AND c.conrelid <> 'public.pacientes'::regclass
       AND c.conrelid <> 'public.pacientes_mesclagens'::regclass
       AND c.conrelid <> 'public.pacientes_duplicidade_descartes'::regclass
  LOOP
    EXECUTE format('SELECT count(*) FROM %s WHERE %I = $1', v_ref.tabela, v_ref.coluna) INTO v_n USING p_origem;
    IF v_n > 0 THEN
      v_preservadas := v_preservadas || jsonb_build_object(v_ref.tabela::text, v_n);
    END IF;
  END LOOP;

  PERFORM set_config('app.allow_patient_status_rpc', 'on', true);
  UPDATE public.pacientes
     SET ativo = false, mesclado_em_paciente_id = p_destino
   WHERE id = p_origem;

  UPDATE public.paciente_portal_tokens
     SET ativo = false
   WHERE paciente_id = p_origem AND ativo = true;

  INSERT INTO public.paciente_status_eventos (paciente_id, clinica_id, ativo, motivo, alterado_por)
  VALUES (p_origem, v_clinica_id, false, 'cadastro_duplicado', v_user_id);

  INSERT INTO public.pacientes_mesclagens (
    clinica_id, origem_id, destino_id, campos_copiados, destino_antes, origem_snapshot,
    referencias_movidas, referencias_preservadas, motivo, mesclado_por
  ) VALUES (
    v_clinica_id, p_origem, p_destino, v_campos, to_jsonb(v_destino), to_jsonb(v_origem),
    jsonb_build_object('agendamentos', v_agendamentos, 'lista_espera', v_lista_espera),
    v_preservadas, v_motivo, v_user_id
  ) RETURNING id INTO v_mesclagem_id;

  INSERT INTO public.audit_log (user_id, action, collection, record_id, record_name, changes)
  VALUES (
    v_user_id, 'update', 'pacientes', p_destino::text, 'Mesclagem de cadastro',
    jsonb_build_object('mesclagem_id', v_mesclagem_id, 'origem_id', p_origem, 'campos', v_campos)
  );

  RETURN jsonb_build_object(
    'mesclagem_id', v_mesclagem_id,
    'destino_id', p_destino,
    'campos_copiados', v_campos,
    'agendamentos_movidos', v_agendamentos,
    'lista_espera_movida', v_lista_espera,
    'referencias_preservadas', v_preservadas
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mesclar_pacientes(uuid, uuid, text[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mesclar_pacientes(uuid, uuid, text[], text) TO authenticated;

COMMENT ON FUNCTION public.mesclar_pacientes(uuid, uuid, text[], text) IS
  'Mescla cadastro duplicado: copia campos escolhidos, move agenda futura e espera ativa, preserva registros clínicos na origem, inativa a origem e registra trilha.';

COMMIT;
