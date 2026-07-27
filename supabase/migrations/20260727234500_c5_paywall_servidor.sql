-- ============================================================================
-- C5 — Bloqueio de assinatura vencida no SERVIDOR
--
-- Hoje o SubscriptionGuard.tsx só decide no navegador, e todos os caminhos
-- terminam liberando o acesso. Quem chama a API do Supabase direto (ou edita o
-- JavaScript) ignora o paywall por completo.
--
-- REGRA IMPLEMENTADA (premissa — ajuste se a regra de negócio for outra):
--   Bloqueia ESCRITA quando a assinatura da clínica está explicitamente
--   'expirada' ou 'cancelada' há mais de GRACE_DAYS dias.
--   LEITURA continua liberada: a clínica sempre enxerga e exporta os próprios
--   dados. Além de ser o que a tela de bloqueio promete ("seus dados estão
--   seguros"), reter prontuário de paciente como alavanca de cobrança é
--   problema legal, não recurso de produto.
--
-- Desenhado para FALHAR ABERTO: qualquer dúvida (sem assinatura, sem data,
-- em trial, clínica sem registro) libera. Assim ninguém é bloqueado por engano.
--
-- Para desativar tudo:  DROP TRIGGER trg_block_expired ON public.<tabela>;
-- Para mudar a carência: altere GRACE_DAYS na função abaixo.
-- ============================================================================

BEGIN;

-- ─── Status de acesso da clínica ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.clinica_acesso_bloqueado()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  GRACE_DAYS constant integer := 2;
  v_uid       uuid;
  v_assinatura record;
BEGIN
  v_uid := auth.uid();

  -- service_role, cron, webhooks: nunca bloqueia
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  -- Platform admins nunca são bloqueados
  IF public.is_platform_admin() THEN
    RETURN false;
  END IF;

  SELECT status, trial_fim, data_fim
  INTO v_assinatura
  FROM public.assinaturas_plano
  WHERE user_id = v_uid
  ORDER BY created_at DESC
  LIMIT 1;

  -- Sem assinatura registrada → libera (clientes antigos, contas internas)
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Só bloqueia status explicitamente encerrado
  IF v_assinatura.status NOT IN ('expirada', 'cancelada') THEN
    RETURN false;
  END IF;

  -- Sem data de término confiável → libera
  IF COALESCE(v_assinatura.data_fim, v_assinatura.trial_fim) IS NULL THEN
    RETURN false;
  END IF;

  RETURN COALESCE(v_assinatura.data_fim, v_assinatura.trial_fim)
         < (now() - (GRACE_DAYS || ' days')::interval);
EXCEPTION WHEN others THEN
  -- Qualquer erro inesperado libera o acesso em vez de travar a clínica
  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.clinica_acesso_bloqueado() TO authenticated, anon;

-- ─── Trigger de bloqueio de escrita ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_block_if_subscription_expired()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.clinica_acesso_bloqueado() THEN
    RAISE EXCEPTION 'Assinatura vencida: o sistema está em modo somente leitura. Regularize o pagamento para voltar a registrar dados.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_block_if_subscription_expired() FROM PUBLIC, anon, authenticated;

-- Aplica só nas tabelas operacionais. Ficam de fora, de propósito:
--   assinaturas_plano / planos / pagamentos → precisam funcionar para pagar
--   audit_log, lgpd_*                       → registro legal não pode parar
--   profiles, user_roles, clinicas          → acesso e cadastro básico
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'agendamentos','anexos_prontuario','atestados','bloqueios_agenda',
    'coletas_laboratorio','encaminhamentos','estoque','exames',
    'fila_atendimento','lancamentos','lista_espera','movimentacoes_estoque',
    'pacientes','prescricoes','prontuarios','retornos','tarefas','triagens'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_block_expired ON public.%I', t);
      EXECUTE format(
        'CREATE TRIGGER trg_block_expired BEFORE INSERT OR UPDATE ON public.%I '
        'FOR EACH ROW EXECUTE FUNCTION public.fn_block_if_subscription_expired()', t
      );
    END IF;
  END LOOP;
END $$;

COMMIT;

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================
-- -- Quem seria bloqueado hoje (rode como service_role / SQL Editor):
-- SELECT c.nome, a.status, COALESCE(a.data_fim, a.trial_fim) AS fim
--   FROM public.assinaturas_plano a
--   JOIN public.profiles p ON p.id = a.user_id
--   JOIN public.clinicas c ON c.id = p.clinica_id
--  WHERE a.status IN ('expirada','cancelada')
--    AND COALESCE(a.data_fim, a.trial_fim) < now() - interval '2 days';
--
-- -- Desativar o bloqueio em todas as tabelas:
-- DO $$ DECLARE t record; BEGIN
--   FOR t IN SELECT tgrelid::regclass AS tbl FROM pg_trigger WHERE tgname = 'trg_block_expired'
--   LOOP EXECUTE format('DROP TRIGGER trg_block_expired ON %s', t.tbl); END LOOP;
-- END $$;
