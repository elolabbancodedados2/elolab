-- ============================================================================
-- Carência do bloqueio por assinatura sobe de 2 para 7 dias
--
-- A migration 20260727234500 tirou o paywall do navegador e o pôs no banco,
-- onde ele passou a valer de verdade. A primeira coisa que pegou foi uma
-- clínica com o teste vencido há 4 dias: o administrador entrava, batia na tela
-- de bloqueio e não conseguia gravar nada. Como é ele quem faz quase toda a
-- configuração, a clínica inteira pareceu ter parado.
--
-- Dois dias é curto demais para software de saúde. Um boleto que atrasa numa
-- sexta trava a clínica no sábado, sem ninguém do outro lado para resolver. E o
-- custo dos dois lados é assimétrico: liberar sete dias a mais de quem não
-- pagou custa pouco; travar uma clínica no meio do expediente custa consulta
-- não registrada e paciente sem prontuário.
--
-- Sete dias cobrem um fim de semana prolongado e dão tempo de alguém ligar.
--
-- O resto da função continua igual, inclusive as saídas que liberam o acesso:
-- sem usuário no contexto (cron, webhooks), admin de plataforma, assinatura não
-- encerrada, sem data confiável, e qualquer erro inesperado. Falhar liberando é
-- proposital — travar clínica por bug é pior do que deixar passar.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.clinica_acesso_bloqueado()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  GRACE_DAYS constant integer := 7;
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

COMMENT ON FUNCTION public.clinica_acesso_bloqueado() IS
  'Bloqueio por assinatura, com 7 dias de carência. Só bloqueia ESCRITA — a leitura segue liberada para a clínica nunca perder acesso ao próprio histórico.';

COMMIT;

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================
-- Quem está bloqueado agora, e por quê:
--
-- SELECT p.email, a.status, coalesce(a.data_fim, a.trial_fim)::date AS termina,
--        (coalesce(a.data_fim, a.trial_fim) < now() - interval '7 days') AS bloqueado
--   FROM public.profiles p
--   JOIN public.assinaturas_plano a ON a.user_id = p.id
--  WHERE a.status IN ('expirada', 'cancelada')
--  ORDER BY termina;
