-- ============================================================================
-- Fila de jobs para webhooks (ADR 0003, fase 1 "expand" + produtor WhatsApp)
--
-- Webhooks só validam, persistem e respondem; o efeito (IA, envio de mensagem)
-- roda num worker que consome esta tabela. Padrão igual ao da
-- notification_queue: reserva com FOR UPDATE SKIP LOCKED, lease, backoff e
-- estados terminais que pedem ação humana.
--
-- Estados:
--   pendente   → aguardando execução (executar_apos <= now())
--   executando → reservado por um worker até bloqueado_ate (lease)
--   concluido  → feito; removido após 30 dias
--   incerto    → interrompido depois de um possível efeito externo não
--                idempotente (ex.: mensagem enviada). Não é repetido sozinho.
--   dead       → DLQ: tentativas esgotadas ou erro definitivo
--   cancelado  → descartado por ação humana
--
-- Acesso: RLS ligada e nenhuma policy; só service_role (edge functions).
-- Payload guarda o mínimo (ids). Conteúdo de mensagem fica em
-- whatsapp_messages. Prazos de retenção finais requerem avaliação
-- especializada (LGPD).
--
-- Esta migration é local. Não aplicar sem aprovação do responsável (ADR 0002).
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.jobs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo               text NOT NULL CHECK (tipo ~ '^[a-z0-9_]+(\.[a-z0-9_]+)+$' AND length(tipo) <= 80),
  clinica_id         uuid NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  chave_idempotencia text NOT NULL CHECK (length(chave_idempotencia) BETWEEN 1 AND 200),
  chave_ordenacao    text NULL CHECK (chave_ordenacao IS NULL OR length(chave_ordenacao) BETWEEN 1 AND 200),
  payload            jsonb NOT NULL DEFAULT '{}'::jsonb
                     CHECK (jsonb_typeof(payload) = 'object' AND pg_column_size(payload) <= 8192),
  status             text NOT NULL DEFAULT 'pendente'
                     CHECK (status IN ('pendente', 'executando', 'concluido', 'incerto', 'dead', 'cancelado')),
  -- true: lease expirado volta para pendente. false: vai para incerto, porque
  -- o efeito externo pode já ter acontecido (ADR 0003, regra 3).
  repetivel          boolean NOT NULL DEFAULT false,
  tentativas         integer NOT NULL DEFAULT 0 CHECK (tentativas >= 0),
  max_tentativas     integer NOT NULL DEFAULT 5 CHECK (max_tentativas BETWEEN 1 AND 20),
  executar_apos      timestamptz NOT NULL DEFAULT now(),
  bloqueado_ate      timestamptz NULL,
  ultimo_erro        text NULL CHECK (ultimo_erro IS NULL OR length(ultimo_erro) <= 500),
  criado_em          timestamptz NOT NULL DEFAULT now(),
  atualizado_em      timestamptz NOT NULL DEFAULT now(),
  concluido_em       timestamptz NULL,
  CONSTRAINT jobs_tipo_chave_idempotencia_key UNIQUE (tipo, chave_idempotencia)
);

COMMENT ON TABLE public.jobs IS
  'Fila de jobs dos webhooks (ADR 0003). Só service_role. Payload mínimo, sem conteúdo clínico.';

CREATE INDEX IF NOT EXISTS jobs_pendentes_idx
  ON public.jobs (executar_apos, criado_em) WHERE status = 'pendente';
CREATE INDEX IF NOT EXISTS jobs_executando_lease_idx
  ON public.jobs (bloqueado_ate) WHERE status = 'executando';
CREATE INDEX IF NOT EXISTS jobs_ordenacao_ativos_idx
  ON public.jobs (chave_ordenacao, criado_em) WHERE status IN ('pendente', 'executando') AND chave_ordenacao IS NOT NULL;
CREATE INDEX IF NOT EXISTS jobs_clinica_status_idx
  ON public.jobs (clinica_id, status);
CREATE INDEX IF NOT EXISTS jobs_concluidos_idx
  ON public.jobs (concluido_em) WHERE status = 'concluido';

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.jobs TO service_role;

-- ---------------------------------------------------------------------------
-- enfileirar_job: idempotente por (tipo, chave_idempotencia).
-- Reentrega do mesmo evento devolve o job existente com criado = false.
-- Recusa reaproveitar a chave de outra clínica (proteção contra vazamento).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enfileirar_job(
  p_tipo text,
  p_chave_idempotencia text,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_clinica_id uuid DEFAULT NULL,
  p_chave_ordenacao text DEFAULT NULL,
  p_repetivel boolean DEFAULT false,
  p_max_tentativas integer DEFAULT 5,
  p_executar_apos timestamptz DEFAULT NULL
)
RETURNS TABLE (job_id uuid, criado boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_clinica uuid;
BEGIN
  INSERT INTO public.jobs (tipo, chave_idempotencia, payload, clinica_id, chave_ordenacao,
                           repetivel, max_tentativas, executar_apos)
  VALUES (p_tipo, p_chave_idempotencia, COALESCE(p_payload, '{}'::jsonb), p_clinica_id, p_chave_ordenacao,
          COALESCE(p_repetivel, false), COALESCE(p_max_tentativas, 5), COALESCE(p_executar_apos, pg_catalog.now()))
  ON CONFLICT (tipo, chave_idempotencia) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NOT NULL THEN
    RETURN QUERY SELECT v_id, true;
    RETURN;
  END IF;

  SELECT j.id, j.clinica_id INTO v_id, v_clinica
    FROM public.jobs j
   WHERE j.tipo = p_tipo AND j.chave_idempotencia = p_chave_idempotencia;

  IF v_clinica IS DISTINCT FROM p_clinica_id THEN
    RAISE EXCEPTION 'job_clinica_divergente' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY SELECT v_id, false;
END;
$$;

-- ---------------------------------------------------------------------------
-- reivindicar_jobs: reserva atômica com SKIP LOCKED.
--  1. Lease expirado: repetível volta a pendente (ou dead se esgotou);
--     não repetível vai para incerto.
--  2. Ordem por chave: só o job pendente mais antigo de cada chave_ordenacao,
--     e nenhum se outro da mesma chave estiver executando.
--  3. Justiça: no máximo p_por_clinica jobs de uma clínica por lote.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reivindicar_jobs(
  p_tipos text[],
  p_limite integer DEFAULT 10,
  p_lease interval DEFAULT interval '2 minutes',
  p_por_clinica integer DEFAULT 10
)
RETURNS SETOF public.jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limite integer := LEAST(GREATEST(COALESCE(p_limite, 10), 1), 50);
  v_lease interval := LEAST(GREATEST(COALESCE(p_lease, interval '2 minutes'), interval '30 seconds'), interval '15 minutes');
  v_por_clinica integer := LEAST(GREATEST(COALESCE(p_por_clinica, 10), 1), 50);
BEGIN
  IF p_tipos IS NULL OR pg_catalog.cardinality(p_tipos) = 0 THEN
    RETURN;
  END IF;

  UPDATE public.jobs j
     SET status = CASE
                    WHEN j.repetivel AND j.tentativas < j.max_tentativas THEN 'pendente'
                    WHEN j.repetivel THEN 'dead'
                    ELSE 'incerto'
                  END,
         bloqueado_ate = NULL,
         ultimo_erro = CASE
                         WHEN j.repetivel THEN 'Lease expirado; job devolvido à fila'
                         ELSE 'Processamento interrompido após possível efeito externo; confira antes de repetir'
                       END,
         atualizado_em = pg_catalog.now()
   WHERE j.status = 'executando'
     AND j.bloqueado_ate < pg_catalog.now()
     AND j.tipo = ANY (p_tipos);

  RETURN QUERY
  WITH travados AS (
    SELECT j.id, j.clinica_id, j.executar_apos, j.criado_em
      FROM public.jobs j
     WHERE j.status = 'pendente'
       AND j.executar_apos <= pg_catalog.now()
       AND j.tipo = ANY (p_tipos)
       AND (j.chave_ordenacao IS NULL OR NOT EXISTS (
             SELECT 1 FROM public.jobs o
              WHERE o.chave_ordenacao = j.chave_ordenacao
                AND o.id <> j.id
                AND (o.status = 'executando'
                     OR (o.status = 'pendente' AND (o.criado_em, o.id) < (j.criado_em, j.id)))
           ))
     ORDER BY j.executar_apos, j.criado_em
     LIMIT v_limite * 5
     FOR UPDATE SKIP LOCKED
  ),
  escolhidos AS (
    SELECT t.id
      FROM (
        SELECT t.id, t.executar_apos, t.criado_em,
               pg_catalog.row_number() OVER (PARTITION BY t.clinica_id ORDER BY t.executar_apos, t.criado_em) AS posicao
          FROM travados t
      ) t
     WHERE t.posicao <= v_por_clinica
     ORDER BY t.executar_apos, t.criado_em
     LIMIT v_limite
  )
  UPDATE public.jobs j
     SET status = 'executando',
         tentativas = j.tentativas + 1,
         bloqueado_ate = pg_catalog.now() + v_lease,
         atualizado_em = pg_catalog.now()
    FROM escolhidos e
   WHERE j.id = e.id
  RETURNING j.*;
END;
$$;

-- ---------------------------------------------------------------------------
-- concluir_job: só conclui o que está executando (lease ainda do worker).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.concluir_job(p_job_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.jobs
     SET status = 'concluido', concluido_em = pg_catalog.now(), bloqueado_ate = NULL,
         ultimo_erro = NULL, atualizado_em = pg_catalog.now()
   WHERE id = p_job_id AND status = 'executando';
  RETURN FOUND;
END;
$$;

-- ---------------------------------------------------------------------------
-- falhar_job: backoff exponencial com jitter (30 s, 60 s, 120 s ... teto 60 min).
--   p_incerto    → incerto (efeito externo pode ter ocorrido)
--   p_definitivo → dead (payload inválido, clínica inexistente)
--   tentativas esgotadas → dead
-- Devolve o novo status, ou NULL se o job não estava executando.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.falhar_job(
  p_job_id uuid,
  p_erro text,
  p_definitivo boolean DEFAULT false,
  p_incerto boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status text;
BEGIN
  UPDATE public.jobs j
     SET status = CASE
                    WHEN COALESCE(p_incerto, false) THEN 'incerto'
                    WHEN COALESCE(p_definitivo, false) OR j.tentativas >= j.max_tentativas THEN 'dead'
                    ELSE 'pendente'
                  END,
         executar_apos = pg_catalog.now() + pg_catalog.make_interval(secs =>
           LEAST(3600, 30 * pg_catalog.power(2, GREATEST(j.tentativas - 1, 0)))
           * (0.8 + pg_catalog.random() * 0.4)),
         bloqueado_ate = NULL,
         ultimo_erro = pg_catalog.left(COALESCE(NULLIF(p_erro, ''), 'erro_desconhecido'), 500),
         atualizado_em = pg_catalog.now()
   WHERE j.id = p_job_id AND j.status = 'executando'
  RETURNING j.status INTO v_status;
  RETURN v_status;
END;
$$;

-- ---------------------------------------------------------------------------
-- limpar_jobs_concluidos: retenção de 30 dias para concluídos (ADR 0003, regra 9).
-- dead/incerto ficam até análise humana.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.limpar_jobs_concluidos()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_total integer;
BEGIN
  DELETE FROM public.jobs
   WHERE status = 'concluido' AND concluido_em < pg_catalog.now() - interval '30 days';
  GET DIAGNOSTICS v_total = ROW_COUNT;
  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.enfileirar_job(text, text, jsonb, uuid, text, boolean, integer, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reivindicar_jobs(text[], integer, interval, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.concluir_job(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.falhar_job(uuid, text, boolean, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.limpar_jobs_concluidos() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enfileirar_job(text, text, jsonb, uuid, text, boolean, integer, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.reivindicar_jobs(text[], integer, interval, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.concluir_job(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.falhar_job(uuid, text, boolean, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.limpar_jobs_concluidos() TO service_role;

-- ---------------------------------------------------------------------------
-- Agendamentos (só onde pg_cron existe).
--
-- Worker: chama whatsapp-webhook?modo=jobs a cada minuto. Para não gravar o
-- CRON_SECRET neste arquivo, o comando é derivado do agendamento existente
-- 'process-notification-queue' (mesma URL base e mesmo cabeçalho
-- x-cron-secret). Se ele não existir, nada é agendado e um NOTICE avisa:
-- agende manualmente seguindo 20260727235000_cron_segredo_proprio.sql.
--
-- Cutucada por trigger + pg_net após o INSERT (ADR 0003, regra 10) fica para
-- uma migration própria: exige o segredo no Vault, decisão do responsável.
-- ---------------------------------------------------------------------------
DO $agenda$
DECLARE
  v_modelo text;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    RAISE NOTICE 'pg_cron ausente: worker e limpeza da fila de jobs não foram agendados.';
    RETURN;
  END IF;

  PERFORM cron.schedule('limpar-jobs-concluidos', '30 3 * * *', $cmd$SELECT public.limpar_jobs_concluidos();$cmd$);

  SELECT command INTO v_modelo FROM cron.job WHERE jobname = 'process-notification-queue' LIMIT 1;
  IF v_modelo IS NULL OR strpos(v_modelo, 'functions/v1/process-notification-queue') = 0 THEN
    RAISE NOTICE 'Agendamento modelo process-notification-queue não encontrado: agende o worker whatsapp-webhook?modo=jobs manualmente.';
    RETURN;
  END IF;

  PERFORM cron.schedule(
    'jobs-worker-whatsapp',
    '* * * * *',
    replace(v_modelo, 'functions/v1/process-notification-queue', 'functions/v1/whatsapp-webhook?modo=jobs')
  );
END;
$agenda$;

COMMIT;

-- ============================================================================
-- REVERSÃO (fase expand; nenhum produtor depende disto enquanto
-- WHATSAPP_FILA_CLINICAS estiver vazio):
--   SELECT cron.unschedule('jobs-worker-whatsapp');
--   SELECT cron.unschedule('limpar-jobs-concluidos');
--   DROP FUNCTION public.limpar_jobs_concluidos(), public.falhar_job(uuid, text, boolean, boolean),
--     public.concluir_job(uuid), public.reivindicar_jobs(text[], integer, interval, integer),
--     public.enfileirar_job(text, text, jsonb, uuid, text, boolean, integer, timestamptz);
--   DROP TABLE public.jobs;
-- ============================================================================
