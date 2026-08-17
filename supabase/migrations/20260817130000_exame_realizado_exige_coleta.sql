-- ============================================================================
-- Exame de laboratório só vira "realizado" depois que a coleta acontecer
--
-- Em 30 dias de produção, 285 dos 297 exames estão marcados como "realizado".
-- Existem 2 coletas no banco todo e 0 resultados. Todos os 20 exames mais
-- pedidos são de laboratório (testosterona, hemograma, TSH, ferritina, TGO).
--
-- Ou seja: o técnico não digitou o resultado em NENHUM exame; os pedidos vão
-- direto para "realizado" pelo botão "próximo passo" na tela de Exames, que
-- avança linearmente solicitado → agendado → realizado → laudo. A coleta
-- (`agendado`) e o resultado (`realizado`) viraram passos honorários.
--
-- Isso é dado clínico corrompido — se um médico ou paciente abrir o exame
-- pensando que foi realizado, não vai achar resultado nenhum. E financeiro:
-- 285 exames "prontos" que nunca foram cobrados nem entregues.
--
-- ─── O QUE ESTA MIGRATION FAZ ─────────────────────────────────────────────
--
-- 1. Reconhece quando o pedido é de laboratório, pelo mesmo dicionário de
--    palavras que o `autoCreateColeta` do frontend usa. Se o pedido é de
--    imagem (Raio-X, USG, Ecocardiograma), passa direto — imagem é feita
--    e assinada sem coleta biológica.
--
-- 2. Impede a transição `status → 'realizado'` de exame de laboratório se
--    não existir uma coleta em estado terminal (`coletado`, `em_analise`,
--    `validado` ou `liberado`). Pedido, cancelado ou recoleta não contam:
--    a coleta precisa ter acontecido.
--
-- 3. Cria a coleta faltante automaticamente no INSERT do exame — o
--    `autoCreateColeta` do frontend está falhando em silêncio (Promise.all
--    engole o erro e o toast só aparece se pelo menos uma coleta deu certo).
--    Passar para o banco garante que exame de laboratório SEMPRE nasce com
--    coleta ligada, e a tela do laboratório recebe o trabalho.
--
-- ─── O PASSADO NÃO É MEXIDO ────────────────────────────────────────────────
--
-- Os 285 exames já "realizado" sem coleta continuam como estão. O trigger
-- BEFORE UPDATE só age em transições novas — o histórico fica congelado e
-- documenta o defeito. Retroagir seria escrever "coleta em 15/06" para uma
-- que não aconteceu — pior que o dado atual.
--
-- Se a operação depois quiser limpar, a consulta abaixo lista o dano:
--
--   SELECT clinica_id, count(*)
--     FROM exames e
--    WHERE status = 'realizado'
--      AND public.exame_e_de_laboratorio(tipo_exame)
--      AND NOT EXISTS (
--        SELECT 1 FROM coletas_laboratorio c WHERE c.exame_id = e.id
--      )
--    GROUP BY 1 ORDER BY 2 DESC;
-- ============================================================================

BEGIN;

-- ─── Dicionário: o pedido é de laboratório? ────────────────────────────────
--
-- Mesmo conjunto de palavras que `autoCreateColeta` em src/lib/workflowAutomation.ts
-- usa (linha 383 em diante). Se o dicionário divergir entre banco e frontend,
-- o usuário vê comportamento diferente em cada lado. Mantenha os dois juntos
-- quando adicionar termo novo.
CREATE OR REPLACE FUNCTION public.exame_e_de_laboratorio(p_tipo text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_tipo IS NULL THEN false
    ELSE lower(p_tipo) ~ (
      'hemograma|glicemia|colesterol|trigliceri|ureia|creatinina|' ||
      'tgo|tgp|gama|bilirrubina|tsh|pcr|vdrl|hiv|' ||
      'hepatite|eas|urina|urocultura|hemocultura|cultura|' ||
      'ferro|ferritina|vitamina|hormonio|cortisol|insulina|' ||
      'psa|cea|hemoglobina|vhs|coagulograma|gasometria|' ||
      'anti-|fator|complemento|ige|parasitol|sangue oculto|' ||
      'calprotectina|coprocultura|baar|d-dimero|fibrinogenio|' ||
      'tap|ttpa|inr|reticulocito|tipagem|eletroforese|' ||
      'testosterona|magnesio|amilase|fosfatase|glicose|' ||
      't3|t4|hidroxivitamina|tireoestimulante'
    )
  END;
$$;

COMMENT ON FUNCTION public.exame_e_de_laboratorio(text) IS
  'Reconhece pedido de laboratório pelo nome. Mesmo dicionário de src/lib/workflowAutomation.ts::autoCreateColeta — divergir entre os dois gera comportamento inconsistente.';

-- ─── Trava: transição PARA "realizado" exige coleta terminada ──────────────
CREATE OR REPLACE FUNCTION public.exige_coleta_antes_de_realizado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER          -- precisa enxergar coletas mesmo com RLS restritivo
SET search_path = public
AS $$
DECLARE
  v_ja_estava_realizado boolean := false;
  v_tem_coleta_terminada boolean;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_ja_estava_realizado := OLD.status = 'realizado';
  END IF;

  -- Só interessa a transição PARA "realizado". Voltar do realizado, cancelar,
  -- liberar laudo — tudo segue livre.
  IF NEW.status IS DISTINCT FROM 'realizado' OR v_ja_estava_realizado THEN
    RETURN NEW;
  END IF;

  -- Imagem não tem coleta biológica. Passa.
  IF NOT public.exame_e_de_laboratorio(NEW.tipo_exame) THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.coletas_laboratorio
     WHERE exame_id = NEW.id
       AND status IN ('coletado', 'em_analise', 'validado', 'liberado')
  ) INTO v_tem_coleta_terminada;

  IF NOT v_tem_coleta_terminada THEN
    RAISE EXCEPTION
      'Este exame não pode ser marcado como realizado: não há coleta registrada. Registre a coleta em Laboratório (Painel Lab → coleta desse pedido) e marque como "coletado" antes.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.exige_coleta_antes_de_realizado() IS
  'Impede pular o passo da coleta no fluxo laboratorial. Antes disto, 285 de 297 exames em produção pularam direto para "realizado" pelo botão linear da tela de Exames, gerando dado clínico e financeiro corrompido.';

DROP TRIGGER IF EXISTS exames_exigem_coleta ON public.exames;
CREATE TRIGGER exames_exigem_coleta
  BEFORE UPDATE OF status ON public.exames
  FOR EACH ROW
  EXECUTE FUNCTION public.exige_coleta_antes_de_realizado();

-- ─── Coleta nasce junto do pedido de laboratório ───────────────────────────
--
-- O `autoCreateColeta` do frontend é chamado uma vez, dentro de `Promise.all`,
-- e engole o erro. Se falhar por RLS ou schema, o exame nasce órfão e nunca
-- vira coleta. Mover para o banco fecha essa corrida.
--
-- Não sobrescreve o que já existe: se o INSERT do exame vier com coleta já
-- criada por outro caminho, nada acontece.
CREATE OR REPLACE FUNCTION public.criar_coleta_para_exame_de_lab()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tipo_amostra   text := 'sangue';
  v_tubo           text := 'EDTA (roxo)';
  v_jejum_necessario boolean := false;
  v_tipo_lower     text;
BEGIN
  IF NOT public.exame_e_de_laboratorio(NEW.tipo_exame) THEN
    RETURN NEW;
  END IF;

  -- Idempotente. Uma linha do lado direito é suficiente.
  IF EXISTS (SELECT 1 FROM public.coletas_laboratorio WHERE exame_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  v_tipo_lower := lower(NEW.tipo_exame);

  -- Amostra e tubo, do mesmo jeito que o `autoCreateColeta` do frontend.
  IF v_tipo_lower ~ 'urina|eas|urocultura|clearance' THEN
    v_tipo_amostra := 'urina';
    v_tubo := 'Frasco estéril';
  ELSIF v_tipo_lower ~ 'fezes|parasitol|coprocultura|calprotectina|sangue oculto' THEN
    v_tipo_amostra := 'fezes';
    v_tubo := 'Coletor de fezes';
  ELSIF v_tipo_lower ~ 'coagulograma|tap|ttpa|inr|fibrinogenio|d-dimero' THEN
    v_tubo := 'Citrato (azul)';
  ELSIF v_tipo_lower ~ 'glicemia|lactato' THEN
    v_tubo := 'Fluoreto (cinza)';
  ELSIF v_tipo_lower ~ 'vhs' THEN
    v_tubo := 'Citrato (preto)';
  END IF;

  v_jejum_necessario := v_tipo_lower ~ 'glicemia|colesterol|trigliceri|perfil lipidico|curva glice|insulina';

  -- `urgente` fica false por padrão. `exames` não tem coluna de urgência
  -- (o campo `urgencia` só existe no formulário do frontend), então o técnico
  -- do laboratório marca urgente na tela da coleta se for o caso. Se um dia
  -- adicionarmos `exames.urgencia`, o valor sai daqui direto.
  INSERT INTO public.coletas_laboratorio (
    exame_id, paciente_id, medico_solicitante_id, clinica_id,
    tipo_amostra, tubo, status,
    urgente, jejum_necessario, jejum_horas
  ) VALUES (
    NEW.id, NEW.paciente_id, NEW.medico_solicitante_id, NEW.clinica_id,
    v_tipo_amostra, v_tubo, 'pendente',
    false,
    v_jejum_necessario,
    CASE WHEN v_jejum_necessario THEN 8 ELSE NULL END
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.criar_coleta_para_exame_de_lab() IS
  'AFTER INSERT em exames. Se o pedido é de laboratório e ainda não existe coleta, cria a coleta pendente. Substitui a chamada do frontend a autoCreateColeta que falhava silenciosamente.';

DROP TRIGGER IF EXISTS exames_geram_coleta ON public.exames;
CREATE TRIGGER exames_geram_coleta
  AFTER INSERT ON public.exames
  FOR EACH ROW
  EXECUTE FUNCTION public.criar_coleta_para_exame_de_lab();

COMMIT;

-- ============================================================================
-- COMO CONFERIR DEPOIS DE APLICAR
-- ============================================================================
-- 1) Pedidos futuros de laboratório devem nascer com coleta:
--
--    SELECT count(*) AS exames_novos, count(c.id) AS com_coleta
--      FROM exames e
--      LEFT JOIN coletas_laboratorio c ON c.exame_id = e.id
--     WHERE e.created_at > CURRENT_DATE
--       AND public.exame_e_de_laboratorio(e.tipo_exame);
--
-- 2) A tentativa de forçar "realizado" sem coleta falha com a mensagem:
--    "não pode ser marcado como realizado: não há coleta registrada".
--
-- 3) Imagem passa direto:
--
--    -- deve funcionar sem erro
--    UPDATE exames SET status = 'realizado'
--     WHERE tipo_exame = 'Raio-X Tórax' AND status = 'agendado';
--
-- ============================================================================
-- DESLIGAR EM CASO DE PROBLEMA
-- ============================================================================
-- DROP TRIGGER IF EXISTS exames_exigem_coleta ON public.exames;
-- DROP TRIGGER IF EXISTS exames_geram_coleta ON public.exames;
