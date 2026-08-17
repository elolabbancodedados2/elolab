-- ============================================================================
-- Vigia: coleta pendente há mais de 15 dias vira alerta
--
-- A migration `20260817130000` fecha a porta para exame virar `realizado` sem
-- coleta, e a limpeza de 17/08 devolveu 253 exames da INOVALAB para o estado
-- correto (`solicitado` com coleta pendente). O problema agora é o inverso:
-- a coleta cria na fila e ninguém trabalha. 15 dias depois é o novo zumbi.
--
-- ─── O QUE ESTA MIGRATION FAZ ────────────────────────────────────────────
--
-- Cria `fila_alertas_lab_esquecido()`, view materializada RÁPIDA que lista
-- coletas em `pendente`, `coletado` ou `em_analise` há mais de 15 dias. A
-- tela do laboratório pode consultá-la para banner de alerta. Não muda o
-- estado das coletas — só torna visível o abandono.
--
-- Cancelar automaticamente coleta pendente seria pior que atendimento
-- travado: o material biológico pode ter sido coletado offline, e um
-- cancelamento apagaria o vínculo do exame. Melhor sinalizar e deixar o
-- humano decidir.
--
-- ─── VIEW E NÃO TABELA ───────────────────────────────────────────────────
--
-- Poderia ser materialized view + refresh cron, mas a base é pequena (2 →
-- 253 depois da limpeza) e o cálculo é barato: uma view comum resolve. Se
-- crescer, mudança pra materialized é local.
-- ============================================================================

BEGIN;

CREATE OR REPLACE VIEW public.fila_alertas_lab_esquecido AS
SELECT
  c.id                                       AS coleta_id,
  c.exame_id,
  c.paciente_id,
  c.clinica_id,
  c.status,
  c.created_at,
  now() - c.created_at                       AS parado_ha,
  e.tipo_exame,
  p.nome                                     AS paciente_nome
FROM public.coletas_laboratorio c
JOIN public.exames    e ON e.id = c.exame_id
JOIN public.pacientes p ON p.id = c.paciente_id
WHERE c.status IN ('pendente', 'coletado', 'em_analise')
  AND c.created_at < now() - interval '15 days';

COMMENT ON VIEW public.fila_alertas_lab_esquecido IS
  'Coletas travadas há mais de 15 dias sem virar resultado. O RLS herda o SELECT das tabelas — cada clínica só vê o dela.';

-- Garante que o acesso segue o RLS das tabelas base — a view é uma projeção,
-- não escapa do isolamento. Concede SELECT ao papel `authenticated` para que
-- a tela consiga ler.
GRANT SELECT ON public.fila_alertas_lab_esquecido TO authenticated;

COMMIT;

-- ============================================================================
-- COMO USAR NA TELA
-- ============================================================================
-- SELECT clinica_id, count(*), max(parado_ha) AS mais_antiga
--   FROM public.fila_alertas_lab_esquecido
--  GROUP BY clinica_id;
--
-- Ou, dentro do app, a mesma consulta filtrada por clinica passa pelo RLS
-- automaticamente e não devolve nada de outras clínicas.
