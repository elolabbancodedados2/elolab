-- Relacionamento: campanhas para pacientes e resultado por campanha.
--
-- A campanha é um rascunho editável pela recepção e pela administração da
-- clínica. Só o administrador dispara: o disparo monta o público, substitui as
-- variáveis da mensagem e grava uma linha por paciente em notification_queue,
-- que já é processada pela edge function process-notification-queue.
--
-- Contrato com a fila:
--   status = 'pendente' e agendado_para = data da campanha (ou agora), que é o
--   que reivindicar_notificacoes seleciona; dados_extras = {tipo:'campanha',
--   campanha_id}; dedupe_key = 'campanha:<campanha>:<paciente>' com o índice
--   único (clinica_id, tipo, dedupe_key) já existente, o que torna o disparo
--   idempotente.
--
-- Consentimento: o público respeita pacientes.preferencia_canal_lembrete com o
-- mesmo critério de canaisDeLembrete (ambos ou o próprio canal, e endereço
-- cadastrado). A edge function confere de novo a preferência e a janela de
-- contato no momento do envio, porque a campanha pode ficar agendada.
--
-- Não altera lancamentos nem pagamentos_mercadopago.
BEGIN;

CREATE TABLE IF NOT EXISTS public.campanhas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL DEFAULT public.current_clinica_id() REFERENCES public.clinicas(id) ON DELETE CASCADE,
  nome text NOT NULL CHECK (char_length(btrim(nome)) BETWEEN 3 AND 120),
  canal text NOT NULL DEFAULT 'whatsapp' CHECK (canal IN ('whatsapp', 'email')),
  publico text NOT NULL DEFAULT 'ativos'
    CHECK (publico IN ('ativos', 'sem_retorno', 'aniversariantes_mes', 'detratores_nps')),
  publico_dias integer NOT NULL DEFAULT 180 CHECK (publico_dias BETWEEN 1 AND 3650),
  mensagem text NOT NULL CHECK (char_length(btrim(mensagem)) BETWEEN 5 AND 2000),
  agendada_para timestamptz,
  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'agendada', 'enviada', 'cancelada')),
  total_destinatarios integer NOT NULL DEFAULT 0 CHECK (total_destinatarios >= 0),
  criado_por uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  disparada_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  disparada_em timestamptz,
  cancelada_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.campanhas IS
  'Campanhas de relacionamento com pacientes. Disparo e cancelamento só pelas RPCs disparar_campanha e cancelar_campanha.';
COMMENT ON COLUMN public.campanhas.mensagem IS
  'Texto com as variáveis {{nome}}, {{primeiro_nome}} e {{clinica}}.';
COMMENT ON COLUMN public.campanhas.publico_dias IS
  'Janela em dias: sem consulta há mais de N dias (sem_retorno) ou avaliação negativa nos últimos N dias (detratores_nps).';

CREATE INDEX IF NOT EXISTS campanhas_clinica_created_idx ON public.campanhas (clinica_id, created_at DESC);
CREATE INDEX IF NOT EXISTS campanhas_clinica_status_idx ON public.campanhas (clinica_id, status);

DROP TRIGGER IF EXISTS campanhas_updated_at ON public.campanhas;
CREATE TRIGGER campanhas_updated_at
  BEFORE UPDATE ON public.campanhas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Resultado por campanha sem varrer a fila inteira.
CREATE INDEX IF NOT EXISTS notification_queue_campanha_idx
  ON public.notification_queue (clinica_id, ((dados_extras->>'campanha_id')))
  WHERE dados_extras->>'tipo' = 'campanha';

ALTER TABLE public.campanhas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.campanhas FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campanhas TO authenticated;

DROP POLICY IF EXISTS campanhas_select ON public.campanhas;
CREATE POLICY campanhas_select ON public.campanhas
  FOR SELECT TO authenticated
  USING ((public.is_admin(auth.uid()) OR public.is_recepcao(auth.uid())) AND public.is_same_clinica(clinica_id));

-- Escrita direta só em rascunhos; status, total e disparo mudam pelas RPCs.
DROP POLICY IF EXISTS campanhas_insert_rascunho ON public.campanhas;
CREATE POLICY campanhas_insert_rascunho ON public.campanhas
  FOR INSERT TO authenticated
  WITH CHECK (
    (public.is_admin(auth.uid()) OR public.is_recepcao(auth.uid()))
    AND public.is_same_clinica(clinica_id)
    AND status = 'rascunho' AND total_destinatarios = 0
    AND disparada_por IS NULL AND disparada_em IS NULL AND cancelada_em IS NULL
    AND criado_por = auth.uid()
  );

DROP POLICY IF EXISTS campanhas_update_rascunho ON public.campanhas;
CREATE POLICY campanhas_update_rascunho ON public.campanhas
  FOR UPDATE TO authenticated
  USING ((public.is_admin(auth.uid()) OR public.is_recepcao(auth.uid())) AND public.is_same_clinica(clinica_id) AND status = 'rascunho')
  WITH CHECK (
    (public.is_admin(auth.uid()) OR public.is_recepcao(auth.uid()))
    AND public.is_same_clinica(clinica_id)
    AND status = 'rascunho' AND total_destinatarios = 0
    AND disparada_por IS NULL AND disparada_em IS NULL AND cancelada_em IS NULL
  );

DROP POLICY IF EXISTS campanhas_delete_rascunho ON public.campanhas;
CREATE POLICY campanhas_delete_rascunho ON public.campanhas
  FOR DELETE TO authenticated
  USING ((public.is_admin(auth.uid()) OR public.is_recepcao(auth.uid())) AND public.is_same_clinica(clinica_id) AND status = 'rascunho');

-- Substituição das variáveis; a mesma regra existe em src/lib/relacionamento.ts.
CREATE OR REPLACE FUNCTION public.aplicar_variaveis_campanha(p_mensagem text, p_nome text, p_clinica text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT replace(replace(replace(COALESCE(p_mensagem, ''),
    '{{primeiro_nome}}', COALESCE(NULLIF(split_part(btrim(COALESCE(p_nome, '')), ' ', 1), ''), 'paciente')),
    '{{nome}}', COALESCE(NULLIF(btrim(COALESCE(p_nome, '')), ''), 'paciente')),
    '{{clinica}}', COALESCE(NULLIF(btrim(COALESCE(p_clinica, '')), ''), 'a clínica'));
$$;
REVOKE ALL ON FUNCTION public.aplicar_variaveis_campanha(text, text, text) FROM PUBLIC, anon, authenticated;

-- Público elegível. Uso interno: não checa permissão e devolve contato completo.
CREATE OR REPLACE FUNCTION public.publico_campanha_interno(
  p_clinica_id uuid,
  p_publico text,
  p_dias integer,
  p_canal text,
  p_referencia timestamptz DEFAULT now()
)
RETURNS TABLE (paciente_id uuid, nome text, telefone text, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH base AS (
    SELECT p.id, COALESCE(NULLIF(btrim(p.nome_social), ''), p.nome) AS nome,
           p.telefone, NULLIF(btrim(p.email), '') AS email,
           p.preferencia_canal_lembrete, p.data_nascimento
      FROM public.pacientes p
     WHERE p.clinica_id = p_clinica_id
       AND p.ativo
       AND p.mesclado_em_paciente_id IS NULL
  ),
  contato AS (
    SELECT b.* FROM base b
     WHERE (p_canal = 'whatsapp'
            AND regexp_replace(COALESCE(b.telefone, ''), '\D', '', 'g') ~ '^(55)?[0-9]{10,11}$'
            AND COALESCE(b.preferencia_canal_lembrete, 'ambos') IN ('ambos', 'whatsapp'))
        OR (p_canal = 'email'
            AND b.email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
            AND COALESCE(b.preferencia_canal_lembrete, 'ambos') IN ('ambos', 'email'))
  )
  SELECT c.id, c.nome, c.telefone, c.email
    FROM contato c
   WHERE CASE p_publico
     WHEN 'ativos' THEN true
     WHEN 'aniversariantes_mes' THEN c.data_nascimento IS NOT NULL
       AND extract(month FROM c.data_nascimento) = extract(month FROM (p_referencia AT TIME ZONE 'America/Sao_Paulo'))
     WHEN 'sem_retorno' THEN
       EXISTS (
         SELECT 1 FROM public.agendamentos a
          WHERE a.clinica_id = p_clinica_id AND a.paciente_id = c.id
            AND a.status IN ('finalizado', 'atendimento_finalizado')
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.agendamentos a
          WHERE a.clinica_id = p_clinica_id AND a.paciente_id = c.id
            AND a.status IN ('finalizado', 'atendimento_finalizado')
            AND a.data > ((p_referencia AT TIME ZONE 'America/Sao_Paulo')::date - GREATEST(COALESCE(p_dias, 180), 1))
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.agendamentos a
          WHERE a.clinica_id = p_clinica_id AND a.paciente_id = c.id
            AND a.status IN ('agendado', 'confirmado')
            AND a.data >= (p_referencia AT TIME ZONE 'America/Sao_Paulo')::date
       )
     WHEN 'detratores_nps' THEN
       EXISTS (
         SELECT 1 FROM public.feedbacks_nps f
          WHERE f.clinica_id = p_clinica_id AND f.paciente_id = c.id
            AND f.nota <= 2
            AND f.created_at >= p_referencia - make_interval(days => GREATEST(COALESCE(p_dias, 90), 1))
       )
     ELSE false
   END;
$$;
REVOKE ALL ON FUNCTION public.publico_campanha_interno(uuid, text, integer, text, timestamptz) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.previa_publico_campanha(p_publico text, p_dias integer, p_canal text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinica_id uuid := public.current_clinica_id();
  v_total integer;
  v_amostra jsonb;
  v_clinica text;
BEGIN
  IF auth.uid() IS NULL OR NOT (public.is_admin(auth.uid()) OR public.is_recepcao(auth.uid())) THEN
    RAISE EXCEPTION 'Sem permissão para ver o público de campanhas.' USING ERRCODE = '42501';
  END IF;
  IF v_clinica_id IS NULL THEN
    RAISE EXCEPTION 'Clínica não identificada.' USING ERRCODE = '42501';
  END IF;
  IF p_canal IS NULL OR p_canal NOT IN ('whatsapp', 'email') THEN
    RAISE EXCEPTION 'Canal inválido. Use whatsapp ou email.' USING ERRCODE = '22023';
  END IF;
  IF p_publico IS NULL OR p_publico NOT IN ('ativos', 'sem_retorno', 'aniversariantes_mes', 'detratores_nps') THEN
    RAISE EXCEPTION 'Público inválido.' USING ERRCODE = '22023';
  END IF;

  SELECT count(*)::integer INTO v_total
    FROM public.publico_campanha_interno(v_clinica_id, p_publico, p_dias, p_canal);

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', s.paciente_id, 'nome', s.nome) ORDER BY s.nome), '[]'::jsonb)
    INTO v_amostra
    FROM (
      SELECT x.paciente_id, x.nome
        FROM public.publico_campanha_interno(v_clinica_id, p_publico, p_dias, p_canal) x
       ORDER BY x.nome, x.paciente_id
       LIMIT 20
    ) s;

  SELECT c.nome INTO v_clinica FROM public.clinicas c WHERE c.id = v_clinica_id;

  RETURN jsonb_build_object('total', v_total, 'amostra', v_amostra, 'clinica', v_clinica);
END;
$$;
REVOKE ALL ON FUNCTION public.previa_publico_campanha(text, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.previa_publico_campanha(text, integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.disparar_campanha(p_campanha_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limite constant integer := 2000;
  v_clinica_id uuid := public.current_clinica_id();
  v_campanha public.campanhas%ROWTYPE;
  v_envio timestamptz;
  v_total integer;
  v_inseridos integer;
  v_clinica text;
  v_status text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Somente o administrador pode disparar campanhas.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_campanha FROM public.campanhas
   WHERE id = p_campanha_id AND clinica_id = v_clinica_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campanha não encontrada.' USING ERRCODE = 'P0002';
  END IF;
  IF v_campanha.status <> 'rascunho' THEN
    RAISE EXCEPTION 'A campanha já foi disparada ou cancelada.' USING ERRCODE = '55000';
  END IF;

  v_envio := GREATEST(COALESCE(v_campanha.agendada_para, now()), now());

  SELECT count(*)::integer INTO v_total
    FROM public.publico_campanha_interno(v_clinica_id, v_campanha.publico, v_campanha.publico_dias, v_campanha.canal, v_envio);
  IF v_total = 0 THEN
    RAISE EXCEPTION 'Nenhum paciente elegível para este público e canal.' USING ERRCODE = '22023';
  END IF;
  IF v_total > v_limite THEN
    RAISE EXCEPTION 'O público tem % pacientes e o limite por disparo é %. Divida a campanha em públicos menores.', v_total, v_limite
      USING ERRCODE = '22023';
  END IF;

  SELECT c.nome INTO v_clinica FROM public.clinicas c WHERE c.id = v_clinica_id;

  INSERT INTO public.notification_queue (
    clinica_id, tipo, destinatario_id, destinatario_nome, destinatario_telefone, destinatario_email,
    assunto, conteudo, status, agendado_para, dados_extras, dedupe_key
  )
  SELECT v_clinica_id, v_campanha.canal, x.paciente_id, x.nome,
         CASE WHEN v_campanha.canal = 'whatsapp' THEN x.telefone END,
         CASE WHEN v_campanha.canal = 'email' THEN x.email END,
         CASE WHEN v_campanha.canal = 'email' THEN v_campanha.nome END,
         public.aplicar_variaveis_campanha(v_campanha.mensagem, x.nome, v_clinica),
         'pendente', v_envio,
         jsonb_build_object('tipo', 'campanha', 'campanha_id', v_campanha.id),
         'campanha:' || v_campanha.id || ':' || x.paciente_id
    FROM public.publico_campanha_interno(v_clinica_id, v_campanha.publico, v_campanha.publico_dias, v_campanha.canal, v_envio) x
  ON CONFLICT (clinica_id, tipo, dedupe_key) DO NOTHING;
  GET DIAGNOSTICS v_inseridos = ROW_COUNT;

  v_status := CASE WHEN v_envio > now() + interval '1 minute' THEN 'agendada' ELSE 'enviada' END;

  UPDATE public.campanhas
     SET status = v_status, total_destinatarios = v_total, agendada_para = v_envio,
         disparada_por = auth.uid(), disparada_em = now()
   WHERE id = v_campanha.id;

  RETURN jsonb_build_object('status', v_status, 'total', v_total, 'enfileirados', v_inseridos, 'agendado_para', v_envio);
END;
$$;
REVOKE ALL ON FUNCTION public.disparar_campanha(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.disparar_campanha(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancelar_campanha(p_campanha_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinica_id uuid := public.current_clinica_id();
  v_campanha public.campanhas%ROWTYPE;
  v_cancelados integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Somente o administrador pode cancelar campanhas.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_campanha FROM public.campanhas
   WHERE id = p_campanha_id AND clinica_id = v_clinica_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campanha não encontrada.' USING ERRCODE = 'P0002';
  END IF;
  IF v_campanha.status NOT IN ('rascunho', 'agendada') THEN
    RAISE EXCEPTION 'Só é possível cancelar rascunhos e campanhas agendadas.' USING ERRCODE = '55000';
  END IF;

  -- Itens já reservados pelo processador (enviando) seguem o fluxo normal.
  UPDATE public.notification_queue q
     SET status = 'cancelado', erro_mensagem = 'Campanha cancelada.', iniciado_em = NULL
   WHERE q.clinica_id = v_clinica_id
     AND q.dados_extras->>'tipo' = 'campanha'
     AND q.dados_extras->>'campanha_id' = v_campanha.id::text
     AND q.status = 'pendente';
  GET DIAGNOSTICS v_cancelados = ROW_COUNT;

  UPDATE public.campanhas SET status = 'cancelada', cancelada_em = now() WHERE id = v_campanha.id;

  RETURN jsonb_build_object('status', 'cancelada', 'cancelados', v_cancelados);
END;
$$;
REVOKE ALL ON FUNCTION public.cancelar_campanha(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancelar_campanha(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.resultado_campanhas()
RETURNS TABLE (
  campanha_id uuid,
  pendente integer,
  enviando integer,
  enviado integer,
  erro integer,
  cancelado integer,
  incerto integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinica_id uuid := public.current_clinica_id();
BEGIN
  IF auth.uid() IS NULL OR NOT (public.is_admin(auth.uid()) OR public.is_recepcao(auth.uid())) THEN
    RAISE EXCEPTION 'Sem permissão para ver o resultado das campanhas.' USING ERRCODE = '42501';
  END IF;
  IF v_clinica_id IS NULL THEN
    RAISE EXCEPTION 'Clínica não identificada.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT c.id,
         count(q.id) FILTER (WHERE q.status = 'pendente')::integer,
         count(q.id) FILTER (WHERE q.status = 'enviando')::integer,
         count(q.id) FILTER (WHERE q.status = 'enviado')::integer,
         count(q.id) FILTER (WHERE q.status = 'erro')::integer,
         count(q.id) FILTER (WHERE q.status = 'cancelado')::integer,
         count(q.id) FILTER (WHERE q.status = 'incerto')::integer
    FROM public.campanhas c
    LEFT JOIN public.notification_queue q
      ON q.clinica_id = c.clinica_id
     AND q.dados_extras->>'tipo' = 'campanha'
     AND q.dados_extras->>'campanha_id' = c.id::text
   WHERE c.clinica_id = v_clinica_id
   GROUP BY c.id;
END;
$$;
REVOKE ALL ON FUNCTION public.resultado_campanhas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resultado_campanhas() TO authenticated;

-- Aba "Sem retorno": última consulta finalizada mais antiga que N dias e sem
-- consulta futura marcada. Devolve só o final do telefone.
CREATE OR REPLACE FUNCTION public.listar_pacientes_sem_retorno(p_dias integer DEFAULT 180, p_limite integer DEFAULT 200)
RETURNS TABLE (
  paciente_id uuid,
  nome text,
  ultima_consulta date,
  dias_sem_consulta integer,
  telefone_final text,
  tem_email boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinica_id uuid := public.current_clinica_id();
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF auth.uid() IS NULL OR NOT (public.is_admin(auth.uid()) OR public.is_recepcao(auth.uid())) THEN
    RAISE EXCEPTION 'Sem permissão para listar pacientes sem retorno.' USING ERRCODE = '42501';
  END IF;
  IF v_clinica_id IS NULL THEN
    RAISE EXCEPTION 'Clínica não identificada.' USING ERRCODE = '42501';
  END IF;
  IF p_dias IS NULL OR p_dias < 1 OR p_dias > 3650 THEN
    RAISE EXCEPTION 'Informe entre 1 e 3650 dias.' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH ultimas AS (
    SELECT a.paciente_id, max(a.data) AS ultima
      FROM public.agendamentos a
     WHERE a.clinica_id = v_clinica_id
       AND a.status IN ('finalizado', 'atendimento_finalizado')
     GROUP BY a.paciente_id
  )
  SELECT p.id,
         COALESCE(NULLIF(btrim(p.nome_social), ''), p.nome),
         u.ultima,
         (v_hoje - u.ultima)::integer,
         CASE WHEN char_length(regexp_replace(COALESCE(p.telefone, ''), '\D', '', 'g')) > 4
              THEN right(regexp_replace(p.telefone, '\D', '', 'g'), 4) END,
         NULLIF(btrim(p.email), '') IS NOT NULL
    FROM ultimas u
    JOIN public.pacientes p ON p.id = u.paciente_id AND p.clinica_id = v_clinica_id
   WHERE p.ativo
     AND p.mesclado_em_paciente_id IS NULL
     AND u.ultima <= v_hoje - p_dias
     AND NOT EXISTS (
       SELECT 1 FROM public.agendamentos f
        WHERE f.clinica_id = v_clinica_id AND f.paciente_id = p.id
          AND f.status IN ('agendado', 'confirmado')
          AND f.data >= v_hoje
     )
   ORDER BY u.ultima ASC, p.nome
   LIMIT LEAST(GREATEST(COALESCE(p_limite, 200), 1), 500);
END;
$$;
REVOKE ALL ON FUNCTION public.listar_pacientes_sem_retorno(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_pacientes_sem_retorno(integer, integer) TO authenticated;

COMMIT;
