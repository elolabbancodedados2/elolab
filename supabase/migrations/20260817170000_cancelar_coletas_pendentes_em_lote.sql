-- ============================================================================
-- Cancelamento em lote de coletas pendentes antigas
--
-- A limpeza da INOVALAB (17/08) devolveu 253 coletas ao estado `pendente` — as
-- que apareceram artificialmente porque os exames tinham sido marcados como
-- "realizado" sem coleta. É provável que a maioria dessas 253 nunca foi
-- realmente coletada: o próprio comportamento anterior era "pular direto pra
-- realizado", ou seja, o material biológico nunca saiu do paciente.
--
-- Sem uma forma de encerrar em massa, ou o técnico do lab cancela uma a uma
-- (253 cliques com confirmação) ou a fila fica lá para sempre. A view
-- `fila_alertas_lab_esquecido` (migration 20260817160000) só sinaliza.
--
-- Esta RPC dá o corte:
--
--   SELECT public.cancelar_coletas_pendentes_antigas(
--     p_dias := 30,
--     p_motivo := 'Limpeza de fila da INOVALAB — dados nunca coletados.'
--   );
--
-- Retorna quantas foram canceladas.
--
-- ─── DECISÕES ────────────────────────────────────────────────────────────
--
-- - **Escopo por clínica.** Usa `get_my_clinica_id()`, então cada admin só
--   afeta a própria clínica — não é operação de super-admin.
-- - **Motivo é obrigatório.** Sem justificativa, a auditoria fica muda e
--   ninguém sabe daqui a três meses por que 253 coletas viraram cancelado
--   num mesmo instante. Grava o motivo em `observacoes`.
-- - **Só toca em `pendente`.** `coletado`, `em_analise`, `validado` e
--   `liberado` significam que material físico existe (ou existiu) — cancelar
--   isso apaga vínculo com laudo já emitido.
-- - **Papel restrito.** SECURITY INVOKER — só quem já pode UPDATE coletas
--   pela RLS consegue chamar. Não abre nova porta.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.cancelar_coletas_pendentes_antigas(
  p_dias    integer,
  p_motivo  text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER          -- respeita RLS e papel do chamador
SET search_path = public
AS $$
DECLARE
  v_afetadas integer;
BEGIN
  IF p_dias IS NULL OR p_dias < 1 THEN
    RAISE EXCEPTION 'Informe quantos dias a coleta precisa ter para virar candidata (mínimo 1).';
  END IF;

  IF p_motivo IS NULL OR length(btrim(p_motivo)) < 5 THEN
    RAISE EXCEPTION 'Motivo obrigatório (mínimo 5 caracteres). Sem justificativa, a auditoria fica sem contexto.';
  END IF;

  UPDATE public.coletas_laboratorio
     SET status = 'cancelado',
         observacoes = COALESCE(observacoes || E'\n\n', '') ||
           '[LOTE ' || to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') ||
           '] Cancelada em lote (mais de ' || p_dias || ' dias em pendente). Motivo: ' ||
           btrim(p_motivo)
   WHERE status = 'pendente'
     AND clinica_id = get_my_clinica_id()
     AND created_at < now() - (p_dias || ' days')::interval;

  GET DIAGNOSTICS v_afetadas = ROW_COUNT;
  RETURN v_afetadas;
END;
$$;

COMMENT ON FUNCTION public.cancelar_coletas_pendentes_antigas(integer, text) IS
  'Encerra em bloco as coletas em pendente da clínica atual que passaram de N dias. Exige motivo. Não toca em coletas onde material biológico já foi processado.';

REVOKE ALL ON FUNCTION public.cancelar_coletas_pendentes_antigas(integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancelar_coletas_pendentes_antigas(integer, text) TO authenticated;

COMMIT;

-- ============================================================================
-- PREVIEW ANTES DE RODAR
-- ============================================================================
-- SELECT count(*) FROM coletas_laboratorio
--  WHERE status = 'pendente'
--    AND clinica_id = get_my_clinica_id()
--    AND created_at < now() - interval '30 days';
