-- Não apaga a trilha de auditoria quando alguém tenta excluir um produto usado.
ALTER TABLE public.movimentacoes_estoque
  DROP CONSTRAINT IF EXISTS movimentacoes_estoque_item_id_fkey;

ALTER TABLE public.movimentacoes_estoque
  ADD CONSTRAINT movimentacoes_estoque_item_id_fkey
  FOREIGN KEY (item_id) REFERENCES public.estoque(id) ON DELETE RESTRICT;

COMMENT ON CONSTRAINT movimentacoes_estoque_item_id_fkey ON public.movimentacoes_estoque IS
  'Impede apagar produtos com histórico de estoque; preserva a trilha de auditoria.';

CREATE OR REPLACE FUNCTION public.impedir_exclusao_estoque_com_saldo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.quantidade > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Zere o saldo do produto antes de excluí-lo.';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS impedir_exclusao_estoque_com_saldo ON public.estoque;
CREATE TRIGGER impedir_exclusao_estoque_com_saldo
  BEFORE DELETE ON public.estoque
  FOR EACH ROW EXECUTE FUNCTION public.impedir_exclusao_estoque_com_saldo();
