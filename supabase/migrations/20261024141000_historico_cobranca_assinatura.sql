-- Histórico da cobrança da assinatura EloLab, separado do financeiro clínico.
--
-- A tela de faturas da assinatura lia pagamentos_mercadopago (cobranças de
-- pacientes da clínica). Estas funções leem somente as tabelas da cobrança
-- SaaS: tentativas de assinatura no cartão (assinaturas_mercadopago com
-- checkout_type = 'preapproval_card'), pedidos Pix de período
-- (platform_plan_orders) e faturas recorrentes (platform_subscription_invoices).
-- Cada linha é uma tentativa ou cobrança com o estado final registrado; não há
-- número de cartão, token, e-mail do pagador nem payload do provedor.
-- Aditiva e idempotente: só cria ou substitui funções.

CREATE OR REPLACE FUNCTION public.cobranca_assinatura_eventos(p_owner_id uuid)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  origem text,
  referencia text,
  metodo text,
  valor numeric,
  status text,
  detalhe text,
  criado_em timestamptz,
  atualizado_em timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT am.id,
         CASE WHEN am.detalhes->>'user_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              THEN (am.detalhes->>'user_id')::uuid END,
         'cartao_assinatura'::text,
         am.detalhes->>'checkout_reference',
         'cartao'::text,
         am.valor::numeric,
         am.status::text,
         COALESCE(am.detalhes->>'reconciliacao_resolucao', am.detalhes->>'erro_checkout', am.detalhes->>'preapproval_status'),
         am.created_at::timestamptz,
         COALESCE(am.updated_at, am.created_at)::timestamptz
    FROM public.assinaturas_mercadopago am
   WHERE am.detalhes->>'checkout_type' = 'preapproval_card'
     AND (p_owner_id IS NULL OR am.detalhes->>'user_id' = p_owner_id::text)
  UNION ALL
  SELECT o.id, o.user_id, 'pix_periodo'::text, o.id::text, o.metodo, o.valor::numeric, o.status,
         o.status_detail, o.created_at, o.updated_at
    FROM public.platform_plan_orders o
   WHERE p_owner_id IS NULL OR o.user_id = p_owner_id
  UNION ALL
  SELECT i.id, i.user_id, 'fatura_recorrente'::text, i.mp_authorized_payment_id, 'cartao'::text, i.amount::numeric,
         COALESCE(i.payment_status, i.invoice_status), i.payment_status_detail,
         COALESCE(i.date_created::timestamptz, i.created_at::timestamptz), i.updated_at::timestamptz
    FROM public.platform_subscription_invoices i
   WHERE p_owner_id IS NULL OR i.user_id = p_owner_id;
$function$;

REVOKE ALL ON FUNCTION public.cobranca_assinatura_eventos(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cobranca_assinatura_eventos(uuid) TO service_role;

-- Para a clínica: o dono da assinatura ou um administrador da clínica.
CREATE OR REPLACE FUNCTION public.historico_cobranca_assinatura(p_limit integer DEFAULT 50)
RETURNS TABLE (
  id uuid,
  origem text,
  referencia text,
  metodo text,
  valor numeric,
  status text,
  detalhe text,
  criado_em timestamptz,
  atualizado_em timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
BEGIN
  SELECT COALESCE(c.owner_id, p.id)
    INTO v_owner
    FROM public.profiles p
    LEFT JOIN public.clinicas c ON c.id = p.clinica_id
   WHERE p.id = v_uid;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Conta sem assinatura da plataforma' USING ERRCODE = '42501';
  END IF;
  IF v_owner <> v_uid AND NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'Apenas administradores da clínica consultam a cobrança da assinatura' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT e.id, e.origem, e.referencia, e.metodo, e.valor, e.status, e.detalhe, e.criado_em, e.atualizado_em
    FROM public.cobranca_assinatura_eventos(v_owner) e
   ORDER BY e.criado_em DESC NULLS LAST
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
END;
$function$;

REVOKE ALL ON FUNCTION public.historico_cobranca_assinatura(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.historico_cobranca_assinatura(integer) TO authenticated;

-- Para a administração da plataforma: tentativas de todas as contas, com
-- sinal de divergência para reconciliação.
CREATE OR REPLACE FUNCTION public.platform_checkout_attempts(p_limit integer DEFAULT 100)
RETURNS TABLE (
  id uuid,
  origem text,
  referencia text,
  metodo text,
  valor numeric,
  status text,
  detalhe text,
  criado_em timestamptz,
  atualizado_em timestamptz,
  clinica_nome text,
  dono_email text,
  divergente boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Acesso restrito à administração da plataforma' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT e.id, e.origem, e.referencia, e.metodo, e.valor, e.status, e.detalhe, e.criado_em, e.atualizado_em,
         (SELECT c.nome::text FROM public.clinicas c
           WHERE c.owner_id = e.user_id AND NOT COALESCE(c.arquivada, false)
           ORDER BY c.created_at LIMIT 1),
         p.email::text,
         (
           (e.origem = 'pix_periodo' AND e.detalhe = 'valor_divergente' AND e.status = 'em_processamento')
           OR (e.origem = 'cartao_assinatura' AND e.status = 'pendente' AND e.detalhe = 'falha_comunicacao'
               AND e.criado_em < now() - interval '1 hour')
         ) AS divergente
    FROM public.cobranca_assinatura_eventos(NULL) e
    LEFT JOIN public.profiles p ON p.id = e.user_id
   WHERE e.origem <> 'fatura_recorrente'
   ORDER BY e.criado_em DESC NULLS LAST
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 300);
END;
$function$;

REVOKE ALL ON FUNCTION public.platform_checkout_attempts(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_checkout_attempts(integer) TO authenticated;
