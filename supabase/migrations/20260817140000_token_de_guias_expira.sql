-- ============================================================================
-- Token público de guias externas ganha expiração
--
-- Achado do relatório de segurança (SEC-002):
--
--   `portal_guias_tokens` tem apenas `ativo` (booleano) e `ultimo_uso`. Um
--   token gerado hoje aceita envios PARA SEMPRE, até alguém lembrar de
--   desativar manualmente. Um link colado num grupo de WhatsApp, ou vazado
--   num screenshot, continua aceitando dados sensíveis dos pacientes.
--
-- Esta migration:
--
--   1. Adiciona `expires_at` (timestamptz).
--   2. Backfilla tokens existentes com 90 dias no futuro — não derruba os
--      13 links ativos hoje, e dá tempo de rotacionar em transição.
--   3. Tokens novos nascem com 90 dias por padrão (via GENERATED). A tela
--      pode oferecer prazo maior/menor se quiser.
--   4. A edge function `public-guias-externas` passa a rejeitar `now() >
--      expires_at` (mudança no código, próximo commit).
-- ============================================================================

BEGIN;

-- 1. Coluna nova.
ALTER TABLE public.portal_guias_tokens
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- 2. Backfill: qualquer token vivo hoje ganha 90 dias a partir de agora. Não
--    quebra ninguém agora, mas passa a expirar.
UPDATE public.portal_guias_tokens
   SET expires_at = now() + interval '90 days'
 WHERE expires_at IS NULL;

-- 3. A partir daqui, expiração é obrigatória. Sem NOT NULL, uma UI mal
--    escrita voltaria a inserir sem prazo.
ALTER TABLE public.portal_guias_tokens
  ALTER COLUMN expires_at SET NOT NULL,
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '90 days');

-- 4. Índice para o `WHERE expires_at > now()` que a edge function passa a
--    fazer em toda validação. Tabela é pequena hoje, mas o índice segura a
--    escala sem custo.
CREATE INDEX IF NOT EXISTS idx_portal_guias_tokens_expires_ativo
  ON public.portal_guias_tokens (expires_at)
  WHERE ativo = true;

COMMENT ON COLUMN public.portal_guias_tokens.expires_at IS
  'Depois deste momento o token não aceita mais envios, mesmo com ativo=true. Padrão de 90 dias na criação; renovação exige gerar novo token.';

COMMIT;

-- ============================================================================
-- CONFERIR DEPOIS DE APLICAR
-- ============================================================================
-- SELECT count(*) AS total,
--        count(*) FILTER (WHERE expires_at > now()) AS vivos,
--        count(*) FILTER (WHERE expires_at <= now()) AS expirados
--   FROM public.portal_guias_tokens;
--
-- Nenhum deve estar expirado imediatamente após o push (todos ganharam 90
-- dias no backfill).
