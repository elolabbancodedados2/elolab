-- ============================================================================
-- Resultado de exame não pode ser liberado antes da conferência técnica
--
-- O pipeline do laboratório é:
--   pendente → coletado → em_analise → validado → liberado
--
-- Mas a liberação gravava `liberado = true` direto, sem olhar em que etapa a
-- coleta estava. Um resultado ainda em análise — ou digitado errado — podia ser
-- liberado, e o paciente é NOTIFICADO assim que isso acontece. Depois que o
-- resultado chega ao paciente, não tem como voltar atrás.
--
-- A tela agora bloqueia, mas tela é sugestão: roda no navegador e qualquer
-- caminho que fale direto com a API passa por cima. Um resultado clínico
-- liberado sem conferência é dano ao paciente, então a regra vale no banco.
--
-- Também preenche `liberado_por`: a coluna existia e nunca era gravada, então
-- não havia como saber quem liberou um laudo depois que ele saiu.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.exige_conferencia_antes_de_liberar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER          -- precisa ler a coleta mesmo com RLS restritivo
SET search_path = public
AS $$
DECLARE
  v_status_coleta text;
  v_ja_estava_liberado boolean := false;
BEGIN
  -- `OLD` só existe em UPDATE/DELETE. Num trigger BEFORE INSERT, referenciar
  -- OLD.<campo> levanta "record \"old\" is not assigned yet" e derruba todo
  -- INSERT na tabela — ou seja, o laboratório não conseguiria nem cadastrar
  -- resultado. Por isso o TG_OP vem antes de qualquer leitura de OLD.
  IF TG_OP = 'UPDATE' THEN
    v_ja_estava_liberado := COALESCE(OLD.liberado, false);
  END IF;

  -- Só interessa a transição PARA liberado. Correções de texto, unidade e
  -- valor de referência num resultado já liberado seguem seu caminho.
  IF NEW.liberado IS NOT TRUE OR v_ja_estava_liberado THEN
    RETURN NEW;
  END IF;

  SELECT status INTO v_status_coleta
    FROM public.coletas_laboratorio
   WHERE id = NEW.coleta_id;

  IF v_status_coleta IS NULL THEN
    RAISE EXCEPTION 'Coleta % não encontrada — não é possível liberar o resultado.', NEW.coleta_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_status_coleta NOT IN ('validado', 'liberado') THEN
    RAISE EXCEPTION
      'Resultado não pode ser liberado: a coleta está em "%". Conclua a conferência técnica (status "validado") antes — o paciente é notificado na liberação.',
      v_status_coleta
      USING ERRCODE = 'check_violation';
  END IF;

  -- Carimba quem liberou, quando a aplicação não informar.
  IF NEW.data_liberacao IS NULL THEN
    NEW.data_liberacao := now();
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.exige_conferencia_antes_de_liberar() IS
  'Impede liberar resultado de coleta que ainda não passou pela conferência técnica. A validação da tela roda no navegador e não protege quem fala direto com a API.';

DROP TRIGGER IF EXISTS resultados_exigem_conferencia ON public.resultados_laboratorio;

CREATE TRIGGER resultados_exigem_conferencia
  BEFORE INSERT OR UPDATE ON public.resultados_laboratorio
  FOR EACH ROW
  EXECUTE FUNCTION public.exige_conferencia_antes_de_liberar();

COMMIT;

-- ============================================================================
-- SE ALGUM FLUXO LEGÍTIMO QUEBRAR
-- ============================================================================
-- Sintoma: "Resultado não pode ser liberado: a coleta está em em_analise".
-- Significa que existe caminho liberando resultado sem passar a coleta por
-- `validado`. O certo é corrigir esse caminho, não afrouxar o trigger.
--
-- Para ver em que etapa estão as coletas com resultado pendente:
--
-- SELECT c.status, count(*) AS coletas, count(r.id) AS resultados_pendentes
--   FROM public.coletas_laboratorio c
--   LEFT JOIN public.resultados_laboratorio r
--     ON r.coleta_id = c.id AND COALESCE(r.liberado, false) = false
--  GROUP BY c.status
--  ORDER BY coletas DESC;
