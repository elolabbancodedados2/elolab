-- Impede duplicar entrada/saída quando a resposta da rede se perde e o usuário tenta novamente.
BEGIN;

ALTER TABLE public.movimentacoes_estoque
  ADD COLUMN IF NOT EXISTS chave_idempotencia uuid NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_movimentacoes_estoque_idempotencia
  ON public.movimentacoes_estoque (clinica_id, chave_idempotencia)
  WHERE chave_idempotencia IS NOT NULL;

DROP FUNCTION IF EXISTS public.registrar_movimentacao_estoque(uuid, text, integer, text);

CREATE FUNCTION public.registrar_movimentacao_estoque(
  p_item_id uuid,
  p_tipo text,
  p_quantidade integer,
  p_motivo text DEFAULT NULL,
  p_chave_idempotencia uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_clinica_id uuid := public.get_my_clinica_id();
  v_item public.estoque%ROWTYPE;
  v_movimento public.movimentacoes_estoque%ROWTYPE;
  v_quantidade_nova integer;
  v_motivo text := NULLIF(trim(p_motivo), '');
BEGIN
  IF auth.uid() IS NULL OR v_clinica_id IS NULL OR NOT (
    public.is_admin(auth.uid())
    OR public.is_enfermagem(auth.uid())
    OR public.is_financeiro(auth.uid())
    OR public.is_medico(auth.uid())
  ) THEN
    RAISE EXCEPTION 'Seu perfil não pode movimentar o estoque desta clínica.';
  END IF;
  IF p_tipo IS NULL OR p_tipo NOT IN ('entrada', 'saida') THEN
    RAISE EXCEPTION 'Tipo de movimentação inválido.';
  END IF;
  IF p_quantidade IS NULL OR p_quantidade < 1 THEN
    RAISE EXCEPTION 'A quantidade deve ser um número inteiro maior que zero.';
  END IF;

  SELECT e.* INTO v_item
    FROM public.estoque AS e
   WHERE e.id = p_item_id AND e.clinica_id = v_clinica_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto não encontrado nesta clínica.';
  END IF;

  -- O bloqueio do item serializa tentativas repetidas da mesma operação.
  IF p_chave_idempotencia IS NOT NULL THEN
    SELECT m.* INTO v_movimento
      FROM public.movimentacoes_estoque AS m
     WHERE m.clinica_id = v_clinica_id
       AND m.chave_idempotencia = p_chave_idempotencia;
    IF FOUND THEN
      IF v_movimento.item_id IS DISTINCT FROM p_item_id
         OR v_movimento.tipo IS DISTINCT FROM p_tipo
         OR v_movimento.quantidade IS DISTINCT FROM p_quantidade
         OR v_movimento.motivo IS DISTINCT FROM v_motivo
         OR v_movimento.usuario_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Esta chave já foi usada em outra movimentação. Atualize a tela antes de continuar.';
      END IF;
      RETURN v_item.quantidade;
    END IF;
  END IF;

  IF p_tipo = 'entrada' AND p_quantidade > 2147483647 - v_item.quantidade THEN
    RAISE EXCEPTION 'A entrada ultrapassa o limite de quantidade aceito pelo sistema.';
  END IF;
  v_quantidade_nova := CASE
    WHEN p_tipo = 'entrada' THEN v_item.quantidade + p_quantidade
    ELSE v_item.quantidade - p_quantidade
  END;

  IF v_quantidade_nova < 0 THEN
    RAISE EXCEPTION 'Estoque insuficiente: % disponível, % solicitado.', v_item.quantidade, p_quantidade;
  END IF;
  IF v_item.quantidade_maxima IS NOT NULL AND v_quantidade_nova > v_item.quantidade_maxima THEN
    RAISE EXCEPTION 'A movimentação ultrapassa o estoque máximo de %.', v_item.quantidade_maxima;
  END IF;

  UPDATE public.estoque AS e
     SET quantidade = v_quantidade_nova
   WHERE e.id = p_item_id;

  INSERT INTO public.movimentacoes_estoque (
    item_id, clinica_id, tipo, quantidade, motivo, usuario_id, chave_idempotencia
  ) VALUES (
    v_item.id, v_clinica_id, p_tipo, p_quantidade, v_motivo, auth.uid(), p_chave_idempotencia
  );

  RETURN v_quantidade_nova;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_movimentacao_estoque(uuid, text, integer, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_movimentacao_estoque(uuid, text, integer, text, uuid) TO authenticated;

COMMENT ON FUNCTION public.registrar_movimentacao_estoque(uuid, text, integer, text, uuid) IS
  'Registra entrada ou saída de forma atômica e idempotente, com escopo de clínica.';

COMMIT;
