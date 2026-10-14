-- Bloqueia escrita do plano recorrente quando uma fatura explícita segue sem
-- aprovação por 72 horas após a data de débito. O acesso de leitura permanece.
-- Períodos pré-pagos mantêm a carência atual de sete dias.

-- Contas recorrentes anteriores à coluna de modalidade são identificadas pelo
-- vínculo de assinatura do gateway; não classificar pagamentos pré-pagos.
UPDATE public.assinaturas_plano
   SET cobranca_modalidade = 'recorrente', updated_at = now()
 WHERE cobranca_modalidade IS NULL
   AND mp_assinatura_id IS NOT NULL
   AND status IN ('ativa', 'trial');

CREATE OR REPLACE FUNCTION public.platform_plan_recurring_payment_overdue(p_owner_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.assinaturas_plano plan
      JOIN public.platform_subscription_invoices invoice
        ON invoice.assinatura_mp_id = plan.mp_assinatura_id
     WHERE plan.user_id = p_owner_user_id
       AND plan.cobranca_modalidade = 'recorrente'
       AND plan.status IN ('ativa', 'trial')
       AND invoice.payment_status IN (
         'authorized', 'cancelled', 'charged_back', 'in_mediation',
         'in_process', 'pending', 'rejected', 'refunded'
       )
       AND COALESCE(invoice.debit_date, invoice.date_created) IS NOT NULL
       AND COALESCE(invoice.debit_date, invoice.date_created) <= now() - interval '72 hours'
       AND NOT EXISTS (
         SELECT 1
           FROM public.platform_subscription_invoices recovered
          WHERE recovered.mp_preapproval_id = invoice.mp_preapproval_id
            AND recovered.payment_status = 'approved'
            AND COALESCE(recovered.debit_date, recovered.date_created)
                >= COALESCE(invoice.debit_date, invoice.date_created)
       )
  );
$function$;

REVOKE ALL ON FUNCTION public.platform_plan_recurring_payment_overdue(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_plan_recurring_payment_overdue(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.clinica_acesso_bloqueado()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  GRACE_DAYS constant integer := 7;
  v_uid uuid;
  v_owner_id uuid;
  v_assinatura record;
  v_fim timestamptz;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL OR public.is_platform_admin() THEN
    RETURN false;
  END IF;

  SELECT COALESCE(c.owner_id, p.id)
    INTO v_owner_id
    FROM public.profiles p
    LEFT JOIN public.clinicas c ON c.id = p.clinica_id
   WHERE p.id = v_uid;
  IF NOT FOUND OR v_owner_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT a.status, a.data_fim, a.trial_fim, a.cobranca_modalidade
    INTO v_assinatura
    FROM public.assinaturas_plano a
   WHERE a.user_id = v_owner_id
   ORDER BY a.created_at DESC
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_assinatura.cobranca_modalidade = 'recorrente'
     AND v_assinatura.status IN ('ativa', 'trial')
     AND public.platform_plan_recurring_payment_overdue(v_owner_id) THEN
    RETURN true;
  END IF;

  -- Cancelamento e pré-pago preservam a carência vigente de sete dias.
  IF v_assinatura.status NOT IN ('expirada', 'cancelada') THEN
    RETURN false;
  END IF;

  v_fim := COALESCE(v_assinatura.data_fim, v_assinatura.trial_fim);
  IF v_fim IS NULL THEN
    RETURN false;
  END IF;

  RETURN v_fim < now() - make_interval(days => GRACE_DAYS);
EXCEPTION WHEN others THEN
  -- Falha de consulta não pode bloquear uma clínica por engano.
  RETURN false;
END;
$function$;

COMMENT ON FUNCTION public.clinica_acesso_bloqueado() IS
  'Bloqueia escrita após 72 horas de fatura recorrente sem aprovação; pré-pago e cancelamento preservam sete dias. Leitura segue liberada.';

GRANT EXECUTE ON FUNCTION public.clinica_acesso_bloqueado() TO authenticated, anon;

-- A leitura prévia da fila evita reenvios no cron normal; o índice também
-- impede duplicatas se duas execuções concorrerem antes do primeiro insert.
CREATE UNIQUE INDEX IF NOT EXISTS notification_queue_plan_reminder_once_idx
  ON public.notification_queue (
    destinatario_id,
    (dados_extras->>'tipo_lembrete'),
    (dados_extras->>'assinatura_id'),
    (COALESCE(dados_extras->>'fatura_id', '')),
    (COALESCE(dados_extras->>'termina_em', ''))
  )
  WHERE dados_extras->>'tipo_lembrete' IN (
    'recurring_invoice_unpaid_72h',
    'prepaid_period_ends_soon',
    'plan_period_ends_soon',
    'prepaid_expired_day_0',
    'prepaid_expired_day_3',
    'prepaid_expired_day_6'
  );
