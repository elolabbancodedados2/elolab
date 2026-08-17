-- ============================================================================
-- Rate limit para endpoints públicos (sem JWT do usuário)
--
-- Achado SEC-004 da revisão de segurança: `public-guias-externas`,
-- `public-checkout` e `patient-portal` aceitam qualquer volume. Um script
-- que descubra um token pode empurrar 10.000 requisições por minuto —
-- enche `guias_externas` de lixo, dispara o processador de notificações
-- desnecessariamente, consome quota da Evolution API.
--
-- Esta migration cria a plumbing simples:
--
--   - tabela `rate_limit_counters(chave, janela, contagem)` com PK
--     composta (chave, janela);
--   - função `checar_rate_limit(chave, limite, janela_segundos)` que
--     retorna `true` se a requisição pode passar (e incrementa o contador),
--     `false` se já estourou;
--   - job de limpeza diário via `pg_cron` que apaga janelas vencidas.
--
-- As edge functions passam a chamar `checar_rate_limit()` no começo. Se
-- devolver `false`, respondem 429.
--
-- ─── DESIGN ──────────────────────────────────────────────────────────────
--
-- - Janela deslizante por bucket: `date_trunc('second', now())` arredondado
--   pela função. Bucket menor → mais preciso, mais linhas. Escolha do
--   chamador via `janela_segundos`.
--
-- - Chave livre. Pode ser IP, token, `ip:token`, `endpoint:ip`. Cada canal
--   decide o que faz sentido.
--
-- - `INSERT ... ON CONFLICT DO UPDATE` é atômico — dois requests simultâneos
--   incrementam corretamente sem race.
--
-- - Sem RLS: só service_role escreve (via edge function). Chamada com anon
--   pelo cliente é bloqueada pela RLS default.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.rate_limit_counters (
  chave      text        NOT NULL,
  janela     timestamptz NOT NULL,
  contagem   integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (chave, janela)
);

COMMENT ON TABLE public.rate_limit_counters IS
  'Contadores de rate limit para endpoints públicos. Uma linha por (chave, janela). Limpo periodicamente por cron.';

-- RLS ativa, sem policy pública. Só service_role passa.
ALTER TABLE public.rate_limit_counters ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.checar_rate_limit(
  p_chave           text,
  p_limite          integer,
  p_janela_segundos integer DEFAULT 60
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bucket   timestamptz;
  v_contagem integer;
BEGIN
  IF p_chave IS NULL OR btrim(p_chave) = '' THEN
    -- Chave ausente é sinal de bug do chamador; nega para o ataque não
    -- descobrir que passar chave vazia libera.
    RETURN false;
  END IF;

  IF p_limite < 1 OR p_janela_segundos < 1 THEN
    RETURN false;
  END IF;

  -- Arredonda "agora" para o início da janela. Janelas de 60s alinham em
  -- date_trunc('minute'); janelas quaisquer usam epoch/janela*janela.
  v_bucket := to_timestamp(
    (floor(extract(epoch FROM now()) / p_janela_segundos) * p_janela_segundos)::bigint
  );

  INSERT INTO public.rate_limit_counters (chave, janela, contagem)
       VALUES (p_chave, v_bucket, 1)
  ON CONFLICT (chave, janela)
  DO UPDATE SET contagem = rate_limit_counters.contagem + 1
       RETURNING contagem INTO v_contagem;

  RETURN v_contagem <= p_limite;
END;
$$;

COMMENT ON FUNCTION public.checar_rate_limit(text, integer, integer) IS
  'Retorna true se a requisição pode passar (e incrementa o contador) ou false se a chave já estourou o limite na janela atual. Chamado do início das edge functions públicas.';

REVOKE ALL ON FUNCTION public.checar_rate_limit(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.checar_rate_limit(text, integer, integer) TO service_role;

-- ─── Limpeza de contadores antigos ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.limpar_rate_limit_antigos()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_apagados integer;
BEGIN
  DELETE FROM public.rate_limit_counters WHERE janela < now() - interval '1 hour';
  GET DIAGNOSTICS v_apagados = ROW_COUNT;
  RETURN v_apagados;
END;
$$;

-- Cron: hora em hora, no minuto 47 (fora dos horários já usados)
SELECT cron.unschedule('limpar-rate-limit-antigos')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'limpar-rate-limit-antigos');

SELECT cron.schedule(
  'limpar-rate-limit-antigos',
  '47 * * * *',
  $$SELECT public.limpar_rate_limit_antigos();$$
);

COMMIT;
