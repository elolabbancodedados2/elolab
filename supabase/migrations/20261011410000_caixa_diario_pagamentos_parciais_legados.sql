-- Include legacy partial receipts in the daily cash screen and closing.
-- These rows predate the `pagamentos` child table and store the received
-- amount directly in `lancamentos.valor_pago`.
CREATE OR REPLACE FUNCTION public.movimentos_caixa_diario(p_data date)
RETURNS TABLE (
  id uuid,
  tipo text,
  descricao text,
  valor numeric,
  forma_pagamento text,
  categoria text,
  data date,
  created_at timestamptz,
  paciente_id uuid,
  paciente_nome text,
  origem_pagamento boolean
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT
    p.id,
    l.tipo::text,
    CASE WHEN p.estornado_em IS NULL
      THEN COALESCE(NULLIF(p.observacoes, ''), 'Pagamento: ' || l.descricao)
      ELSE 'Estorno: ' || l.descricao
    END,
    CASE WHEN p.estornado_em IS NULL THEN p.valor ELSE -p.valor END,
    p.forma_pagamento,
    l.categoria,
    (COALESCE(p.estornado_em, p.data_pagamento) AT TIME ZONE 'America/Sao_Paulo')::date,
    COALESCE(p.estornado_em, p.data_pagamento),
    l.paciente_id,
    pa.nome,
    true
  FROM public.pagamentos p
  JOIN public.lancamentos l ON l.id = p.lancamento_id
  LEFT JOIN public.pacientes pa ON pa.id = l.paciente_id
  WHERE COALESCE(p.clinica_id, l.clinica_id) = public.get_my_clinica_id()
    AND p_data IS NOT NULL
    AND (COALESCE(p.estornado_em, p.data_pagamento) AT TIME ZONE 'America/Sao_Paulo')::date = p_data
    AND p.forma_pagamento <> 'credito_paciente'
    AND (
      public.is_admin(auth.uid()) OR public.is_financeiro(auth.uid())
      OR public.is_recepcao(auth.uid())
    )

  UNION ALL

  SELECT
    l.id,
    l.tipo::text,
    l.descricao,
    CASE WHEN l.status = 'parcial' THEN COALESCE(l.valor_pago, 0)
         ELSE COALESCE(l.valor_pago, l.valor) END,
    l.forma_pagamento,
    l.categoria,
    COALESCE(l.data_pagamento, l.data),
    CASE WHEN l.data_pagamento IS NOT NULL THEN l.updated_at ELSE l.created_at END,
    l.paciente_id,
    pa.nome,
    false
  FROM public.lancamentos l
  LEFT JOIN public.pacientes pa ON pa.id = l.paciente_id
  WHERE l.clinica_id = public.get_my_clinica_id()
    AND COALESCE(l.data_pagamento, l.data) = p_data
    AND l.status IN ('pago', 'parcial')
    AND (l.status <> 'parcial' OR COALESCE(l.valor_pago, 0) > 0)
    AND l.tipo IN ('receita', 'despesa', 'sangria', 'suprimento')
    AND NOT EXISTS (
      SELECT 1 FROM public.pagamentos p WHERE p.lancamento_id = l.id
    )
    AND (
      public.is_admin(auth.uid()) OR public.is_financeiro(auth.uid())
      OR public.is_recepcao(auth.uid())
    )
  ORDER BY 8 DESC;
$$;

REVOKE ALL ON FUNCTION public.movimentos_caixa_diario(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.movimentos_caixa_diario(date) TO authenticated;
