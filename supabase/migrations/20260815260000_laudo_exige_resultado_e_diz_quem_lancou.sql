-- ============================================================================
-- O exame morria em "realizado"
--
-- O estado do banco hoje:
--
--   285 exames  status = realizado
--     0 exames  com o campo `resultado` preenchido
--     0 linhas  em resultados_laboratorio
--     3 exames  status = laudo_disponivel — e os três com resultado VAZIO
--
-- Ou seja: o paciente faz o exame, alguém marca como realizado, e o resultado
-- não existe em lugar nenhum. Quando o médico abre a ficha para comparar com um
-- exame anterior, não há o que comparar.
--
-- A causa é simples e estava à vista: `Exames.tsx` só vincula o laudo ao
-- prontuário quando `exame.resultado` está preenchido — e NÃO EXISTE tela para
-- preencher. O campo existia, a automação existia, e faltava o meio do
-- caminho.
--
-- ─── O QUE ESTA MIGRATION FAZ ──────────────────────────────────────────────
--
-- 1. Registra QUEM lançou o resultado e QUANDO. Resultado de exame é peça de
--    prontuário; sem autoria, não serve como registro clínico.
--
-- 2. Impede que um exame vá para "laudo disponível" sem resultado nenhum —
--    que é exatamente o estado dos três que já estão lá. "Laudo disponível"
--    vazio é pior que "realizado": o paciente é avisado de que o resultado
--    saiu, chega na clínica, e não tem laudo.
--
-- Os três exames que já estão nesse estado NÃO são mexidos: a trava só olha a
-- ENTRADA no estado, como a de pagamento. Corrigir registro clínico antigo é
-- decisão de quem atendeu, não de migration.
-- ============================================================================

BEGIN;

ALTER TABLE public.exames
  ADD COLUMN IF NOT EXISTS resultado_em  timestamptz,
  ADD COLUMN IF NOT EXISTS resultado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.exames.resultado_por IS
  'Quem lançou o resultado. Carimbado pelo gatilho, não pela tela — resultado de exame é peça de prontuário e precisa de autoria confiável.';

-- ─── Carimbo de autoria ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.carimba_resultado_do_exame()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tinha boolean;
BEGIN
  v_tinha := TG_OP = 'UPDATE'
    AND (COALESCE(btrim(OLD.resultado), '') <> '' OR COALESCE(btrim(OLD.arquivo_resultado), '') <> '');

  -- Só carimba quando o resultado APARECE. Editar um resultado já lançado
  -- mantém a autoria original: quem corrigiu texto não vira autor do exame.
  IF NOT v_tinha
     AND (COALESCE(btrim(NEW.resultado), '') <> '' OR COALESCE(btrim(NEW.arquivo_resultado), '') <> '')
  THEN
    NEW.resultado_em  := now();
    NEW.resultado_por := auth.uid();
    IF NEW.data_realizacao IS NULL THEN
      NEW.data_realizacao := CURRENT_DATE;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS carimba_resultado ON public.exames;
CREATE TRIGGER carimba_resultado
  BEFORE INSERT OR UPDATE OF resultado, arquivo_resultado ON public.exames
  FOR EACH ROW
  EXECUTE FUNCTION public.carimba_resultado_do_exame();

-- ─── Laudo disponível exige resultado ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.laudo_exige_resultado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status::text <> 'laudo_disponivel' THEN
    RETURN NEW;
  END IF;

  -- Já estava nesse estado: não mexe. Os três exames que entraram vazios antes
  -- desta migration continuam editáveis por quem atendeu.
  IF TG_OP = 'UPDATE' AND OLD.status::text = 'laudo_disponivel' THEN
    RETURN NEW;
  END IF;

  IF COALESCE(btrim(NEW.resultado), '') = ''
     AND COALESCE(btrim(NEW.arquivo_resultado), '') = ''
  THEN
    RAISE EXCEPTION
      'Para marcar o laudo como disponível, lance o resultado (texto ou arquivo). Sem isso o paciente é avisado e não encontra o laudo.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS laudo_precisa_de_resultado ON public.exames;
CREATE TRIGGER laudo_precisa_de_resultado
  BEFORE INSERT OR UPDATE OF status ON public.exames
  FOR EACH ROW
  EXECUTE FUNCTION public.laudo_exige_resultado();

COMMIT;
