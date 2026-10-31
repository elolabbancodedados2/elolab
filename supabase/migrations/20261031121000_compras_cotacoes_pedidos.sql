-- Compras: fornecedores, cotações e pedidos de compra.
--
-- Fornecedores e cotações são mantidos por administração e enfermagem; o
-- financeiro consulta. Pedidos só nascem pela RPC gerar_pedidos_da_cotacao
-- (menor preço por item, um pedido por fornecedor) e só entram no estoque pela
-- RPC receber_pedido_compra, que reaproveita registrar_movimentacao_estoque com
-- chave de idempotência por item do pedido. Um pedido recebido nunca entra duas
-- vezes no estoque.
--
-- As tabelas filhas guardam clinica_id, preenchido por trigger a partir do pai,
-- para que as políticas de acesso sejam simples e indexáveis. Triggers garantem
-- que fornecedor, item de estoque, cotação e pedido sejam sempre da mesma clínica.
BEGIN;

-- ─── Tabelas ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.fornecedores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  nome text NOT NULL CHECK (char_length(btrim(nome)) BETWEEN 2 AND 200),
  cnpj text CHECK (cnpj IS NULL OR cnpj ~ '^[0-9]{14}$'),
  contato text CHECK (contato IS NULL OR char_length(contato) <= 200),
  telefone text CHECK (telefone IS NULL OR char_length(telefone) <= 40),
  email text CHECK (email IS NULL OR char_length(email) <= 254),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cotacoes_compra (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  titulo text NOT NULL CHECK (char_length(btrim(titulo)) BETWEEN 2 AND 200),
  status text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'fechada', 'cancelada')),
  observacoes text CHECK (observacoes IS NULL OR char_length(observacoes) <= 2000),
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cotacao_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cotacao_id uuid NOT NULL REFERENCES public.cotacoes_compra(id) ON DELETE CASCADE,
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  estoque_id uuid REFERENCES public.estoque(id) ON DELETE SET NULL,
  descricao text NOT NULL CHECK (char_length(btrim(descricao)) BETWEEN 1 AND 300),
  quantidade integer NOT NULL CHECK (quantidade > 0),
  unidade text CHECK (unidade IS NULL OR char_length(unidade) <= 40),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cotacao_propostas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cotacao_item_id uuid NOT NULL REFERENCES public.cotacao_itens(id) ON DELETE CASCADE,
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  fornecedor_id uuid NOT NULL REFERENCES public.fornecedores(id),
  preco_unitario numeric(12, 2) NOT NULL CHECK (preco_unitario >= 0),
  prazo_dias integer CHECK (prazo_dias IS NULL OR prazo_dias BETWEEN 0 AND 365),
  observacao text CHECK (observacao IS NULL OR char_length(observacao) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cotacao_propostas_item_fornecedor_unico UNIQUE (cotacao_item_id, fornecedor_id)
);

CREATE TABLE IF NOT EXISTS public.pedidos_compra (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  cotacao_id uuid REFERENCES public.cotacoes_compra(id),
  fornecedor_id uuid NOT NULL REFERENCES public.fornecedores(id),
  status text NOT NULL DEFAULT 'emitido' CHECK (status IN ('emitido', 'recebido', 'cancelado')),
  total numeric(14, 2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  emitido_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recebido_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recebido_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pedidos_compra_recebimento_coerente CHECK (
    (status = 'recebido') = (recebido_em IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.pedido_compra_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES public.pedidos_compra(id) ON DELETE CASCADE,
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  estoque_id uuid REFERENCES public.estoque(id) ON DELETE SET NULL,
  descricao text NOT NULL CHECK (char_length(btrim(descricao)) BETWEEN 1 AND 300),
  quantidade integer NOT NULL CHECK (quantidade > 0),
  preco_unitario numeric(12, 2) NOT NULL CHECK (preco_unitario >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.fornecedores IS 'Fornecedores da clínica usados em cotações e pedidos de compra.';
COMMENT ON TABLE public.cotacoes_compra IS 'Cotação de compra: itens pedidos a vários fornecedores para comparar preços.';
COMMENT ON TABLE public.cotacao_propostas IS 'Preço e prazo de um fornecedor para um item da cotação.';
COMMENT ON TABLE public.pedidos_compra IS 'Pedido emitido a um fornecedor. Criado e recebido somente pelas RPCs de compras.';

-- ─── Índices ────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS fornecedores_clinica_cnpj_unico
  ON public.fornecedores (clinica_id, cnpj) WHERE cnpj IS NOT NULL;
CREATE INDEX IF NOT EXISTS fornecedores_clinica_nome_idx ON public.fornecedores (clinica_id, nome);

CREATE INDEX IF NOT EXISTS cotacoes_compra_clinica_idx ON public.cotacoes_compra (clinica_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cotacoes_compra_criado_por_idx ON public.cotacoes_compra (criado_por) WHERE criado_por IS NOT NULL;

CREATE INDEX IF NOT EXISTS cotacao_itens_cotacao_idx ON public.cotacao_itens (cotacao_id);
CREATE INDEX IF NOT EXISTS cotacao_itens_clinica_idx ON public.cotacao_itens (clinica_id);
CREATE INDEX IF NOT EXISTS cotacao_itens_estoque_idx ON public.cotacao_itens (estoque_id) WHERE estoque_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS cotacao_propostas_clinica_idx ON public.cotacao_propostas (clinica_id);
CREATE INDEX IF NOT EXISTS cotacao_propostas_fornecedor_idx ON public.cotacao_propostas (fornecedor_id);

CREATE INDEX IF NOT EXISTS pedidos_compra_clinica_idx ON public.pedidos_compra (clinica_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pedidos_compra_cotacao_idx ON public.pedidos_compra (cotacao_id) WHERE cotacao_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS pedidos_compra_fornecedor_idx ON public.pedidos_compra (fornecedor_id);
CREATE INDEX IF NOT EXISTS pedidos_compra_emitido_por_idx ON public.pedidos_compra (emitido_por) WHERE emitido_por IS NOT NULL;
CREATE INDEX IF NOT EXISTS pedidos_compra_recebido_por_idx ON public.pedidos_compra (recebido_por) WHERE recebido_por IS NOT NULL;

CREATE INDEX IF NOT EXISTS pedido_compra_itens_pedido_idx ON public.pedido_compra_itens (pedido_id);
CREATE INDEX IF NOT EXISTS pedido_compra_itens_clinica_idx ON public.pedido_compra_itens (clinica_id);
CREATE INDEX IF NOT EXISTS pedido_compra_itens_estoque_idx ON public.pedido_compra_itens (estoque_id) WHERE estoque_id IS NOT NULL;

-- ─── Permissões ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.pode_consultar_compras()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.is_admin(auth.uid()) OR public.is_enfermagem(auth.uid()) OR public.is_financeiro(auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION public.pode_gerir_compras()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.is_admin(auth.uid()) OR public.is_enfermagem(auth.uid())
  );
$$;

REVOKE ALL ON FUNCTION public.pode_consultar_compras() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pode_gerir_compras() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pode_consultar_compras() TO authenticated;
GRANT EXECUTE ON FUNCTION public.pode_gerir_compras() TO authenticated;

-- ─── Integridade entre clínicas e regras de situação ────────────────────────

-- As RPCs ligam esta flag local à transação para fazer o que o cliente não pode.
CREATE OR REPLACE FUNCTION public.compras_rpc_ativa()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT current_setting('app.compras_rpc', true) IS NOT DISTINCT FROM 'on';
$$;
REVOKE ALL ON FUNCTION public.compras_rpc_ativa() FROM PUBLIC, anon;
-- Só lê a flag; o trigger de cotações roda com o papel de quem grava e precisa chamá-la.
GRANT EXECUTE ON FUNCTION public.compras_rpc_ativa() TO authenticated;

CREATE OR REPLACE FUNCTION public.compras_fornecedor_normalizar()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.clinica_id IS DISTINCT FROM OLD.clinica_id THEN
    RAISE EXCEPTION 'O fornecedor não pode mudar de clínica.' USING ERRCODE = '42501';
  END IF;
  NEW.nome := btrim(NEW.nome);
  NEW.cnpj := NULLIF(regexp_replace(COALESCE(NEW.cnpj, ''), '[^0-9]', '', 'g'), '');
  NEW.contato := NULLIF(btrim(COALESCE(NEW.contato, '')), '');
  NEW.telefone := NULLIF(btrim(COALESCE(NEW.telefone, '')), '');
  NEW.email := NULLIF(lower(btrim(COALESCE(NEW.email, ''))), '');
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.compras_fornecedor_normalizar() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.compras_cotacao_proteger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.status := 'aberta';
    NEW.criado_por := COALESCE(auth.uid(), NEW.criado_por);
    NEW.titulo := btrim(NEW.titulo);
    RETURN NEW;
  END IF;

  IF NEW.clinica_id IS DISTINCT FROM OLD.clinica_id OR NEW.criado_por IS DISTINCT FROM OLD.criado_por THEN
    RAISE EXCEPTION 'A clínica e o autor da cotação não podem ser alterados.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.compras_rpc_ativa() THEN
    IF OLD.status <> 'aberta' THEN
      RAISE EXCEPTION 'Esta cotação já foi encerrada e não pode ser alterada.' USING ERRCODE = '55000';
    END IF;
    IF NEW.status = 'fechada' THEN
      RAISE EXCEPTION 'A cotação é fechada ao gerar os pedidos com menor preço.' USING ERRCODE = '42501';
    END IF;
  END IF;
  NEW.titulo := btrim(NEW.titulo);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.compras_cotacao_proteger() FROM PUBLIC, anon, authenticated;

-- Itens e propostas herdam a clínica do pai e só mudam enquanto a cotação está aberta.
CREATE OR REPLACE FUNCTION public.compras_cotacao_item_vincular()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cotacao public.cotacoes_compra%ROWTYPE;
  v_ref public.cotacao_itens%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_ref := OLD;
  ELSE
    v_ref := NEW;
  END IF;
  -- FOR SHARE espera a geração de pedidos em andamento e enxerga a situação final.
  SELECT c.* INTO v_cotacao FROM public.cotacoes_compra c WHERE c.id = v_ref.cotacao_id FOR SHARE;

  IF TG_OP = 'DELETE' THEN
    -- Exclusão em cascata da cotação ou da clínica: o pai já não existe.
    IF FOUND AND v_cotacao.status <> 'aberta' THEN
      RAISE EXCEPTION 'Esta cotação já foi encerrada e não pode ser alterada.' USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cotação não encontrada.' USING ERRCODE = '23503';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.cotacao_id IS DISTINCT FROM OLD.cotacao_id THEN
      RAISE EXCEPTION 'O item não pode mudar de cotação.' USING ERRCODE = '42501';
    END IF;
    -- Exclusão de um item do estoque apenas desfaz o vínculo (ON DELETE SET NULL).
    IF NEW.estoque_id IS NULL AND OLD.estoque_id IS NOT NULL
       AND ROW(NEW.descricao, NEW.quantidade, NEW.unidade, NEW.clinica_id)
           IS NOT DISTINCT FROM ROW(OLD.descricao, OLD.quantidade, OLD.unidade, OLD.clinica_id) THEN
      RETURN NEW;
    END IF;
  END IF;
  IF v_cotacao.status <> 'aberta' THEN
    RAISE EXCEPTION 'Esta cotação já foi encerrada e não pode ser alterada.' USING ERRCODE = '55000';
  END IF;

  NEW.clinica_id := v_cotacao.clinica_id;
  NEW.descricao := btrim(NEW.descricao);
  IF NEW.estoque_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.estoque e WHERE e.id = NEW.estoque_id AND e.clinica_id = v_cotacao.clinica_id
  ) THEN
    RAISE EXCEPTION 'O item de estoque não pertence a esta clínica.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.compras_cotacao_item_vincular() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.compras_cotacao_proposta_vincular()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinica_id uuid;
  v_status text;
  v_ref public.cotacao_propostas%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_ref := OLD;
  ELSE
    v_ref := NEW;
  END IF;
  SELECT c.clinica_id, c.status INTO v_clinica_id, v_status
    FROM public.cotacao_itens i
    JOIN public.cotacoes_compra c ON c.id = i.cotacao_id
   WHERE i.id = v_ref.cotacao_item_id
     FOR SHARE OF c;

  IF TG_OP = 'DELETE' THEN
    IF FOUND AND v_status <> 'aberta' THEN
      RAISE EXCEPTION 'Esta cotação já foi encerrada e não pode ser alterada.' USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item da cotação não encontrado.' USING ERRCODE = '23503';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.cotacao_item_id IS DISTINCT FROM OLD.cotacao_item_id
                           OR NEW.fornecedor_id IS DISTINCT FROM OLD.fornecedor_id) THEN
    RAISE EXCEPTION 'A proposta não pode mudar de item ou de fornecedor.' USING ERRCODE = '42501';
  END IF;
  IF v_status <> 'aberta' THEN
    RAISE EXCEPTION 'Esta cotação já foi encerrada e não pode ser alterada.' USING ERRCODE = '55000';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.fornecedores f WHERE f.id = NEW.fornecedor_id AND f.clinica_id = v_clinica_id
  ) THEN
    RAISE EXCEPTION 'O fornecedor não pertence a esta clínica.' USING ERRCODE = '42501';
  END IF;
  NEW.clinica_id := v_clinica_id;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.compras_cotacao_proposta_vincular() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.compras_pedido_proteger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.fornecedores f WHERE f.id = NEW.fornecedor_id AND f.clinica_id = NEW.clinica_id
  ) THEN
    RAISE EXCEPTION 'O fornecedor não pertence a esta clínica.' USING ERRCODE = '42501';
  END IF;
  IF NEW.cotacao_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.cotacoes_compra c WHERE c.id = NEW.cotacao_id AND c.clinica_id = NEW.clinica_id
  ) THEN
    RAISE EXCEPTION 'A cotação não pertence a esta clínica.' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT public.compras_rpc_ativa() THEN
      RAISE EXCEPTION 'Pedidos de compra são gerados a partir de uma cotação.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF ROW(NEW.clinica_id, NEW.cotacao_id, NEW.fornecedor_id, NEW.emitido_por)
     IS DISTINCT FROM ROW(OLD.clinica_id, OLD.cotacao_id, OLD.fornecedor_id, OLD.emitido_por) THEN
    RAISE EXCEPTION 'A origem do pedido de compra não pode ser alterada.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.compras_rpc_ativa() THEN
    -- Fora das RPCs, a única mudança aceita é cancelar um pedido emitido.
    IF OLD.status <> 'emitido' OR NEW.status <> 'cancelado'
       OR ROW(NEW.total, NEW.recebido_por, NEW.recebido_em)
          IS DISTINCT FROM ROW(OLD.total, OLD.recebido_por, OLD.recebido_em) THEN
      RAISE EXCEPTION 'Somente um pedido emitido pode ser cancelado. O recebimento é feito pela ação Receber pedido.'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.compras_pedido_proteger() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.compras_pedido_item_vincular()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinica_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Exclusão de um item do estoque apenas desfaz o vínculo (ON DELETE SET NULL).
    IF NEW.estoque_id IS NULL AND OLD.estoque_id IS NOT NULL
       AND ROW(NEW.pedido_id, NEW.clinica_id, NEW.descricao, NEW.quantidade, NEW.preco_unitario)
           IS NOT DISTINCT FROM ROW(OLD.pedido_id, OLD.clinica_id, OLD.descricao, OLD.quantidade, OLD.preco_unitario) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Itens de pedido de compra não podem ser alterados.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.compras_rpc_ativa() THEN
    RAISE EXCEPTION 'Itens de pedido são gerados a partir de uma cotação.' USING ERRCODE = '42501';
  END IF;
  SELECT p.clinica_id INTO v_clinica_id FROM public.pedidos_compra p WHERE p.id = NEW.pedido_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido de compra não encontrado.' USING ERRCODE = '23503';
  END IF;
  NEW.clinica_id := v_clinica_id;
  IF NEW.estoque_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.estoque e WHERE e.id = NEW.estoque_id AND e.clinica_id = v_clinica_id
  ) THEN
    RAISE EXCEPTION 'O item de estoque não pertence a esta clínica.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.compras_pedido_item_vincular() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS fornecedores_normalizar ON public.fornecedores;
CREATE TRIGGER fornecedores_normalizar
  BEFORE INSERT OR UPDATE ON public.fornecedores
  FOR EACH ROW EXECUTE FUNCTION public.compras_fornecedor_normalizar();

DROP TRIGGER IF EXISTS cotacoes_compra_proteger ON public.cotacoes_compra;
CREATE TRIGGER cotacoes_compra_proteger
  BEFORE INSERT OR UPDATE ON public.cotacoes_compra
  FOR EACH ROW EXECUTE FUNCTION public.compras_cotacao_proteger();

DROP TRIGGER IF EXISTS cotacao_itens_vincular ON public.cotacao_itens;
CREATE TRIGGER cotacao_itens_vincular
  BEFORE INSERT OR UPDATE OR DELETE ON public.cotacao_itens
  FOR EACH ROW EXECUTE FUNCTION public.compras_cotacao_item_vincular();

DROP TRIGGER IF EXISTS cotacao_propostas_vincular ON public.cotacao_propostas;
CREATE TRIGGER cotacao_propostas_vincular
  BEFORE INSERT OR UPDATE OR DELETE ON public.cotacao_propostas
  FOR EACH ROW EXECUTE FUNCTION public.compras_cotacao_proposta_vincular();

DROP TRIGGER IF EXISTS pedidos_compra_proteger ON public.pedidos_compra;
CREATE TRIGGER pedidos_compra_proteger
  BEFORE INSERT OR UPDATE ON public.pedidos_compra
  FOR EACH ROW EXECUTE FUNCTION public.compras_pedido_proteger();

DROP TRIGGER IF EXISTS pedido_compra_itens_vincular ON public.pedido_compra_itens;
CREATE TRIGGER pedido_compra_itens_vincular
  BEFORE INSERT OR UPDATE ON public.pedido_compra_itens
  FOR EACH ROW EXECUTE FUNCTION public.compras_pedido_item_vincular();

DROP TRIGGER IF EXISTS fornecedores_updated_at ON public.fornecedores;
CREATE TRIGGER fornecedores_updated_at
  BEFORE UPDATE ON public.fornecedores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS cotacoes_compra_updated_at ON public.cotacoes_compra;
CREATE TRIGGER cotacoes_compra_updated_at
  BEFORE UPDATE ON public.cotacoes_compra
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS cotacao_propostas_updated_at ON public.cotacao_propostas;
CREATE TRIGGER cotacao_propostas_updated_at
  BEFORE UPDATE ON public.cotacao_propostas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS pedidos_compra_updated_at ON public.pedidos_compra;
CREATE TRIGGER pedidos_compra_updated_at
  BEFORE UPDATE ON public.pedidos_compra
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── RLS e privilégios ──────────────────────────────────────────────────────

ALTER TABLE public.fornecedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotacoes_compra ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotacao_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotacao_propostas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos_compra ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedido_compra_itens ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.fornecedores, public.cotacoes_compra, public.cotacao_itens,
  public.cotacao_propostas, public.pedidos_compra, public.pedido_compra_itens
  FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fornecedores TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.cotacoes_compra TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cotacao_itens TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cotacao_propostas TO authenticated;
GRANT SELECT ON public.pedidos_compra TO authenticated;
GRANT UPDATE (status) ON public.pedidos_compra TO authenticated;
GRANT SELECT ON public.pedido_compra_itens TO authenticated;

-- Leitura: admin, enfermagem e financeiro da mesma clínica.
DROP POLICY IF EXISTS fornecedores_select ON public.fornecedores;
CREATE POLICY fornecedores_select ON public.fornecedores FOR SELECT TO authenticated
  USING ((SELECT public.pode_consultar_compras()) AND public.is_same_clinica(clinica_id));
DROP POLICY IF EXISTS cotacoes_compra_select ON public.cotacoes_compra;
CREATE POLICY cotacoes_compra_select ON public.cotacoes_compra FOR SELECT TO authenticated
  USING ((SELECT public.pode_consultar_compras()) AND public.is_same_clinica(clinica_id));
DROP POLICY IF EXISTS cotacao_itens_select ON public.cotacao_itens;
CREATE POLICY cotacao_itens_select ON public.cotacao_itens FOR SELECT TO authenticated
  USING ((SELECT public.pode_consultar_compras()) AND public.is_same_clinica(clinica_id));
DROP POLICY IF EXISTS cotacao_propostas_select ON public.cotacao_propostas;
CREATE POLICY cotacao_propostas_select ON public.cotacao_propostas FOR SELECT TO authenticated
  USING ((SELECT public.pode_consultar_compras()) AND public.is_same_clinica(clinica_id));
DROP POLICY IF EXISTS pedidos_compra_select ON public.pedidos_compra;
CREATE POLICY pedidos_compra_select ON public.pedidos_compra FOR SELECT TO authenticated
  USING ((SELECT public.pode_consultar_compras()) AND public.is_same_clinica(clinica_id));
DROP POLICY IF EXISTS pedido_compra_itens_select ON public.pedido_compra_itens;
CREATE POLICY pedido_compra_itens_select ON public.pedido_compra_itens FOR SELECT TO authenticated
  USING ((SELECT public.pode_consultar_compras()) AND public.is_same_clinica(clinica_id));

-- Escrita: admin e enfermagem da mesma clínica.
DROP POLICY IF EXISTS fornecedores_insert ON public.fornecedores;
CREATE POLICY fornecedores_insert ON public.fornecedores FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.pode_gerir_compras()) AND public.is_same_clinica(clinica_id));
DROP POLICY IF EXISTS fornecedores_update ON public.fornecedores;
CREATE POLICY fornecedores_update ON public.fornecedores FOR UPDATE TO authenticated
  USING ((SELECT public.pode_gerir_compras()) AND public.is_same_clinica(clinica_id))
  WITH CHECK ((SELECT public.pode_gerir_compras()) AND public.is_same_clinica(clinica_id));
DROP POLICY IF EXISTS fornecedores_delete ON public.fornecedores;
CREATE POLICY fornecedores_delete ON public.fornecedores FOR DELETE TO authenticated
  USING ((SELECT public.pode_gerir_compras()) AND public.is_same_clinica(clinica_id));

DROP POLICY IF EXISTS cotacoes_compra_insert ON public.cotacoes_compra;
CREATE POLICY cotacoes_compra_insert ON public.cotacoes_compra FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.pode_gerir_compras()) AND public.is_same_clinica(clinica_id));
DROP POLICY IF EXISTS cotacoes_compra_update ON public.cotacoes_compra;
CREATE POLICY cotacoes_compra_update ON public.cotacoes_compra FOR UPDATE TO authenticated
  USING ((SELECT public.pode_gerir_compras()) AND public.is_same_clinica(clinica_id))
  WITH CHECK ((SELECT public.pode_gerir_compras()) AND public.is_same_clinica(clinica_id));

DROP POLICY IF EXISTS cotacao_itens_insert ON public.cotacao_itens;
CREATE POLICY cotacao_itens_insert ON public.cotacao_itens FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.pode_gerir_compras()) AND public.is_same_clinica(clinica_id));
DROP POLICY IF EXISTS cotacao_itens_update ON public.cotacao_itens;
CREATE POLICY cotacao_itens_update ON public.cotacao_itens FOR UPDATE TO authenticated
  USING ((SELECT public.pode_gerir_compras()) AND public.is_same_clinica(clinica_id))
  WITH CHECK ((SELECT public.pode_gerir_compras()) AND public.is_same_clinica(clinica_id));
DROP POLICY IF EXISTS cotacao_itens_delete ON public.cotacao_itens;
CREATE POLICY cotacao_itens_delete ON public.cotacao_itens FOR DELETE TO authenticated
  USING ((SELECT public.pode_gerir_compras()) AND public.is_same_clinica(clinica_id));

DROP POLICY IF EXISTS cotacao_propostas_insert ON public.cotacao_propostas;
CREATE POLICY cotacao_propostas_insert ON public.cotacao_propostas FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.pode_gerir_compras()) AND public.is_same_clinica(clinica_id));
DROP POLICY IF EXISTS cotacao_propostas_update ON public.cotacao_propostas;
CREATE POLICY cotacao_propostas_update ON public.cotacao_propostas FOR UPDATE TO authenticated
  USING ((SELECT public.pode_gerir_compras()) AND public.is_same_clinica(clinica_id))
  WITH CHECK ((SELECT public.pode_gerir_compras()) AND public.is_same_clinica(clinica_id));
DROP POLICY IF EXISTS cotacao_propostas_delete ON public.cotacao_propostas;
CREATE POLICY cotacao_propostas_delete ON public.cotacao_propostas FOR DELETE TO authenticated
  USING ((SELECT public.pode_gerir_compras()) AND public.is_same_clinica(clinica_id));

-- Pedidos: só o cancelamento é feito direto pelo cliente (o trigger limita a transição).
DROP POLICY IF EXISTS pedidos_compra_update ON public.pedidos_compra;
CREATE POLICY pedidos_compra_update ON public.pedidos_compra FOR UPDATE TO authenticated
  USING ((SELECT public.pode_gerir_compras()) AND public.is_same_clinica(clinica_id))
  WITH CHECK ((SELECT public.pode_gerir_compras()) AND public.is_same_clinica(clinica_id));

-- ─── RPCs ───────────────────────────────────────────────────────────────────

-- Menor preço por item (desempate: menor prazo, depois nome do fornecedor),
-- um pedido por fornecedor vencedor. Repetir a chamada numa cotação já fechada
-- devolve os pedidos gerados antes, sem duplicar.
CREATE OR REPLACE FUNCTION public.gerar_pedidos_da_cotacao(p_cotacao_id uuid)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinica_id uuid := public.current_clinica_id();
  v_cotacao public.cotacoes_compra%ROWTYPE;
  v_sem_proposta text;
  v_fornecedor record;
  v_pedido_id uuid;
  v_ids uuid[] := '{}';
BEGIN
  IF NOT public.pode_gerir_compras() OR v_clinica_id IS NULL THEN
    RAISE EXCEPTION 'Seu perfil não pode gerar pedidos de compra.' USING ERRCODE = '42501';
  END IF;

  SELECT c.* INTO v_cotacao
    FROM public.cotacoes_compra c
   WHERE c.id = p_cotacao_id AND c.clinica_id = v_clinica_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cotação não encontrada nesta clínica.' USING ERRCODE = 'P0002';
  END IF;
  IF v_cotacao.status = 'fechada' THEN
    SELECT COALESCE(array_agg(p.id ORDER BY p.created_at), '{}') INTO v_ids
      FROM public.pedidos_compra p
     WHERE p.cotacao_id = p_cotacao_id AND p.clinica_id = v_clinica_id;
    RETURN v_ids;
  END IF;
  IF v_cotacao.status <> 'aberta' THEN
    RAISE EXCEPTION 'Cotação cancelada não gera pedidos.' USING ERRCODE = '55000';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cotacao_itens i WHERE i.cotacao_id = p_cotacao_id) THEN
    RAISE EXCEPTION 'Inclua ao menos um item na cotação.' USING ERRCODE = '23514';
  END IF;

  SELECT string_agg(i.descricao, ', ' ORDER BY i.descricao) INTO v_sem_proposta
    FROM public.cotacao_itens i
   WHERE i.cotacao_id = p_cotacao_id
     AND NOT EXISTS (
       SELECT 1 FROM public.cotacao_propostas cp
         JOIN public.fornecedores f ON f.id = cp.fornecedor_id AND f.ativo
        WHERE cp.cotacao_item_id = i.id
     );
  IF v_sem_proposta IS NOT NULL THEN
    RAISE EXCEPTION 'Há itens sem proposta de fornecedor ativo: %.', v_sem_proposta USING ERRCODE = '23514';
  END IF;

  PERFORM set_config('app.compras_rpc', 'on', true);

  FOR v_fornecedor IN
    WITH vencedores AS (
      SELECT DISTINCT ON (i.id) i.quantidade, cp.preco_unitario, cp.fornecedor_id
        FROM public.cotacao_itens i
        JOIN public.cotacao_propostas cp ON cp.cotacao_item_id = i.id
        JOIN public.fornecedores f ON f.id = cp.fornecedor_id AND f.ativo
       WHERE i.cotacao_id = p_cotacao_id
       ORDER BY i.id, cp.preco_unitario, cp.prazo_dias NULLS LAST, lower(f.nome), f.id
    )
    SELECT v.fornecedor_id, round(sum(v.quantidade * v.preco_unitario), 2) AS total
      FROM vencedores v
      JOIN public.fornecedores f ON f.id = v.fornecedor_id
     GROUP BY v.fornecedor_id, f.nome
     ORDER BY lower(f.nome), v.fornecedor_id
  LOOP
    INSERT INTO public.pedidos_compra (clinica_id, cotacao_id, fornecedor_id, status, total, emitido_por)
    VALUES (v_clinica_id, p_cotacao_id, v_fornecedor.fornecedor_id, 'emitido', v_fornecedor.total, auth.uid())
    RETURNING id INTO v_pedido_id;

    INSERT INTO public.pedido_compra_itens (pedido_id, clinica_id, estoque_id, descricao, quantidade, preco_unitario)
    SELECT v_pedido_id, v_clinica_id, v.estoque_id, v.descricao, v.quantidade, v.preco_unitario
      FROM (
        SELECT DISTINCT ON (i.id) i.estoque_id, i.descricao, i.quantidade, cp.preco_unitario, cp.fornecedor_id
          FROM public.cotacao_itens i
          JOIN public.cotacao_propostas cp ON cp.cotacao_item_id = i.id
          JOIN public.fornecedores f ON f.id = cp.fornecedor_id AND f.ativo
         WHERE i.cotacao_id = p_cotacao_id
         ORDER BY i.id, cp.preco_unitario, cp.prazo_dias NULLS LAST, lower(f.nome), f.id
      ) v
     WHERE v.fornecedor_id = v_fornecedor.fornecedor_id
     ORDER BY v.descricao;

    v_ids := v_ids || v_pedido_id;
  END LOOP;

  UPDATE public.cotacoes_compra SET status = 'fechada' WHERE id = p_cotacao_id;
  PERFORM set_config('app.compras_rpc', 'off', true);
  RETURN v_ids;
END;
$$;

REVOKE ALL ON FUNCTION public.gerar_pedidos_da_cotacao(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gerar_pedidos_da_cotacao(uuid) TO authenticated;
COMMENT ON FUNCTION public.gerar_pedidos_da_cotacao(uuid) IS
  'Gera um pedido por fornecedor com o menor preço de cada item, fecha a cotação e devolve os ids dos pedidos.';

-- Recebe o pedido uma única vez: o bloqueio da linha e a situação garantem que
-- a entrada no estoque não se repete; a chave de idempotência por item protege
-- a movimentação mesmo numa nova tentativa da mesma transação.
CREATE OR REPLACE FUNCTION public.receber_pedido_compra(p_pedido_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinica_id uuid := public.current_clinica_id();
  v_pedido public.pedidos_compra%ROWTYPE;
  v_fornecedor text;
  v_item record;
  v_entradas integer := 0;
BEGIN
  IF NOT public.pode_gerir_compras() OR v_clinica_id IS NULL THEN
    RAISE EXCEPTION 'Seu perfil não pode receber pedidos de compra.' USING ERRCODE = '42501';
  END IF;

  SELECT p.* INTO v_pedido
    FROM public.pedidos_compra p
   WHERE p.id = p_pedido_id AND p.clinica_id = v_clinica_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido de compra não encontrado nesta clínica.' USING ERRCODE = 'P0002';
  END IF;
  IF v_pedido.status = 'recebido' THEN
    RETURN jsonb_build_object(
      'pedido_id', v_pedido.id, 'ja_recebido', true, 'entradas', 0,
      'recebido_em', v_pedido.recebido_em
    );
  END IF;
  IF v_pedido.status <> 'emitido' THEN
    RAISE EXCEPTION 'Pedido cancelado não pode ser recebido.' USING ERRCODE = '55000';
  END IF;

  SELECT f.nome INTO v_fornecedor FROM public.fornecedores f WHERE f.id = v_pedido.fornecedor_id;

  FOR v_item IN
    SELECT i.id, i.estoque_id, i.quantidade
      FROM public.pedido_compra_itens i
     WHERE i.pedido_id = v_pedido.id AND i.estoque_id IS NOT NULL
     ORDER BY i.estoque_id, i.id
  LOOP
    PERFORM public.registrar_movimentacao_estoque(
      v_item.estoque_id,
      'entrada',
      v_item.quantidade,
      left(format('Recebimento do pedido de compra %s (%s)', left(v_pedido.id::text, 8), COALESCE(v_fornecedor, 'fornecedor')), 500),
      v_item.id
    );
    v_entradas := v_entradas + 1;
  END LOOP;

  PERFORM set_config('app.compras_rpc', 'on', true);
  UPDATE public.pedidos_compra
     SET status = 'recebido', recebido_por = auth.uid(), recebido_em = now()
   WHERE id = v_pedido.id
   RETURNING * INTO v_pedido;
  PERFORM set_config('app.compras_rpc', 'off', true);

  RETURN jsonb_build_object(
    'pedido_id', v_pedido.id, 'ja_recebido', false, 'entradas', v_entradas,
    'recebido_em', v_pedido.recebido_em
  );
END;
$$;

REVOKE ALL ON FUNCTION public.receber_pedido_compra(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receber_pedido_compra(uuid) TO authenticated;
COMMENT ON FUNCTION public.receber_pedido_compra(uuid) IS
  'Marca o pedido como recebido e lança a entrada no estoque dos itens vinculados, uma única vez.';

COMMIT;
