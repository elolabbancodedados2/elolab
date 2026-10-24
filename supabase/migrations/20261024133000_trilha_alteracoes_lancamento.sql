-- Trilha de alterações de vencimento, valor e classificação (categoria /
-- centro de custo) de contas a pagar e a receber, para a equipe financeira.
-- Lê o diff que o trigger universal (fn_audit_row) já grava em audit_log;
-- a tabela de auditoria continua restrita a administradores, e esta função
-- expõe apenas esses quatro campos de um lançamento da própria clínica.
BEGIN;

CREATE OR REPLACE FUNCTION public.historico_alteracoes_lancamento(p_lancamento_id uuid)
RETURNS TABLE (alterado_em timestamptz, alterado_por_nome text, campo text, valor_anterior text, valor_novo text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinica uuid := public.get_my_clinica_id();
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_access_financial(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso financeiro necessário';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.lancamentos l WHERE l.id = p_lancamento_id AND l.clinica_id = v_clinica) THEN
    RAISE EXCEPTION 'Lançamento não encontrado nesta clínica';
  END IF;

  RETURN QUERY
  SELECT a."timestamp"::timestamptz, COALESCE(a.user_name, p.nome), c.key, c.value->>'de', c.value->>'para'
    FROM public.audit_log a
    CROSS JOIN LATERAL jsonb_each(COALESCE(a.changes, '{}'::jsonb)) AS c(key, value)
    LEFT JOIN public.profiles p ON p.id = a.user_id
   WHERE a.collection = 'lancamentos'
     AND a.record_id::text = p_lancamento_id::text
     AND a.clinica_id = v_clinica
     AND a.action = 'update'
     AND c.key IN ('data_vencimento', 'valor', 'categoria', 'centro_custo')
   ORDER BY a."timestamp" DESC, c.key;
END;
$$;

REVOKE ALL ON FUNCTION public.historico_alteracoes_lancamento(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.historico_alteracoes_lancamento(uuid) TO authenticated;

COMMENT ON FUNCTION public.historico_alteracoes_lancamento(uuid) IS
  'Alterações de vencimento, valor, categoria e centro de custo de um lançamento, com autor e data.';

COMMIT;
