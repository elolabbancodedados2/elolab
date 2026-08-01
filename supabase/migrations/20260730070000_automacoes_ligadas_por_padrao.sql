-- ============================================================================
-- Automações passam a vir ligadas
--
-- As rotinas (lembrete de consulta, aniversário, alerta de estoque) consultam
-- automation_settings antes de rodar, com a regra `if (ativo === false) pula`.
-- Ou seja: clínica SEM registro roda tudo, clínica COM registro desligado não
-- roda nada.
--
-- Na prática isso significava que criar a configuração DESLIGAVA a automação.
-- A INOVALAB tinha 7 registros e os 7 desligados: nenhum lembrete de consulta,
-- nenhum aviso de estoque, nenhuma felicitação de aniversário — em silêncio,
-- porque a tela mostrava o interruptor cinza como se fosse a escolha da
-- clínica, e ninguém lembrava de ter escolhido.
--
-- Liga tudo. Quem quiser desligar continua podendo, pela tela de Automações —
-- a diferença é que agora o padrão é funcionar.
--
-- O default da coluna já era `true`, então registros novos nascem ligados. O
-- que faltava era corrigir os que ficaram para trás.
-- ============================================================================

BEGIN;

UPDATE public.automation_settings
   SET ativo = true, updated_at = now()
 WHERE ativo IS DISTINCT FROM true;

COMMIT;

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================
-- SELECT chave, ativo FROM public.automation_settings ORDER BY chave;
-- Todas devem estar ligadas.
--
-- Lembre que a ausência de registro também significa ligado: a checagem nas
-- edge functions é `ativo === false`, e undefined não casa. Uma clínica nova,
-- sem nenhuma linha aqui, já recebe todas as automações.
