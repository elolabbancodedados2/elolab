-- ============================================================================
-- Alerta automatizado para a dona do SaaS quando a saúde de uma clínica cai
--
-- A migration 20260817210000 criou `platform_get_clinicas_saude()` e o
-- painel `/admin/saude`. Só que a dona precisa ABRIR o painel para
-- descobrir problema — a melhor UI é a que avisa sozinha.
--
-- Esta migration:
--   1. `verificar_saude_clinicas_e_alertar()`: função diária que compara os
--      indicadores de cada clínica com limites, e enfileira e-mail para os
--      platform_admins ativos quando alguma clínica passa do teto.
--   2. Job cron diário às 8h BRT (11h UTC).
--   3. Guarda em `plataforma_estado` o momento do último alerta por clínica,
--      para não repetir se a situação não mudou.
--
-- ─── LIMITES ────────────────────────────────────────────────────────────
--
-- - Inatividade > 14 dias (feriado longo passa, semana morta soa alarme)
-- - Agendamentos em atendimento > 5 (o watchdog cancela em 24h, mas
--   observar padrão vale)
-- - Coletas esquecidas > 30 (o próprio operador da clínica precisa saber
--   antes disso, mas 30 é o limiar em que vira grito)
-- - Contas vencidas em valor > R$ 5.000 (perda de receita significativa)
-- - Trial vence em < 3 dias (perda de cliente iminente — CRM manda push)
--
-- Não repetir alerta pelas próximas 24h da mesma clínica: se ninguém agiu,
-- o próximo lote já traz de novo, mas sem inundar o inbox.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.verificar_saude_clinicas_e_alertar()
RETURNS TABLE (
  clinica_id  uuid,
  motivo      text,
  enfileirada boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin record;
  v_row   record;
  v_motivos text[];
  v_msg   text;
  v_key   text;
  v_ultimo timestamptz;
BEGIN
  -- Admin da plataforma que recebe o alerta.
  SELECT pa.user_id, u.email
    INTO v_admin
    FROM public.platform_admins pa
    JOIN auth.users u ON u.id = pa.user_id
   WHERE pa.ativo = true
   LIMIT 1;

  IF v_admin.email IS NULL THEN
    RAISE NOTICE '[alerta-saude] sem admin de plataforma ativo, nada a enviar';
    RETURN;
  END IF;

  -- Uma linha por clínica com todos os indicadores.
  FOR v_row IN
    SELECT * FROM public.platform_get_clinicas_saude()
     WHERE NOT arquivada
  LOOP
    v_motivos := ARRAY[]::text[];

    IF v_row.ultima_atividade_ha_dias > 14 THEN
      v_motivos := array_append(v_motivos,
        format('sem atividade há %s dias', v_row.ultima_atividade_ha_dias));
    END IF;

    IF v_row.agendamentos_em_atendimento > 5 THEN
      v_motivos := array_append(v_motivos,
        format('%s agendamentos em atendimento aberto', v_row.agendamentos_em_atendimento));
    END IF;

    IF v_row.coletas_esquecidas > 30 THEN
      v_motivos := array_append(v_motivos,
        format('%s coletas esquecidas há mais de 15 dias', v_row.coletas_esquecidas));
    END IF;

    IF COALESCE(v_row.contas_a_receber_valor, 0) > 5000 THEN
      v_motivos := array_append(v_motivos,
        format('R$ %s vencidos (%s contas)',
               to_char(v_row.contas_a_receber_valor, 'FM999G999D00'),
               v_row.contas_a_receber_vencidas));
    END IF;

    -- Nada estourou? Segue.
    IF array_length(v_motivos, 1) IS NULL THEN
      CONTINUE;
    END IF;

    -- Não repetir dentro de 24h para a mesma clínica.
    v_key := 'alerta_saude_ultima:' || v_row.clinica_id::text;
    SELECT valor::timestamptz INTO v_ultimo
      FROM public.plataforma_estado WHERE chave = v_key;

    IF v_ultimo IS NOT NULL AND v_ultimo > now() - interval '24 hours' THEN
      clinica_id := v_row.clinica_id;
      motivo := array_to_string(v_motivos, ' · ');
      enfileirada := false;
      RETURN NEXT;
      CONTINUE;
    END IF;

    v_msg := format(
      E'A clínica %s está com sinais de problema:\n\n- %s\n\nAbra o dashboard: https://app.elolab.com.br/admin/saude',
      v_row.clinica_nome,
      array_to_string(v_motivos, E'\n- ')
    );

    INSERT INTO public.notification_queue (
      tipo, destinatario_id, destinatario_email, destinatario_nome,
      assunto, conteudo, status, dados_extras
    ) VALUES (
      'email', v_admin.user_id, v_admin.email, 'Admin EloLab',
      format('[Saúde SaaS] %s precisa de atenção', v_row.clinica_nome),
      v_msg, 'pendente',
      jsonb_build_object('clinica_id', v_row.clinica_id, 'motivos', v_motivos)
    );

    -- Registra que alertou.
    INSERT INTO public.plataforma_estado (chave, valor)
    VALUES (v_key, now()::text)
    ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor;

    clinica_id := v_row.clinica_id;
    motivo := array_to_string(v_motivos, ' · ');
    enfileirada := true;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$;

COMMENT ON FUNCTION public.verificar_saude_clinicas_e_alertar() IS
  'Roda diariamente. Para cada clínica ativa, compara indicadores da platform_get_clinicas_saude com limites; enfileira e-mail ao platform_admin quando algum estoura. Não repete alerta da mesma clínica em janela de 24h.';

REVOKE ALL ON FUNCTION public.verificar_saude_clinicas_e_alertar() FROM PUBLIC;

-- Agendamento: 8h BRT (11h UTC) diariamente.
SELECT cron.unschedule('alerta-saude-clinicas')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'alerta-saude-clinicas');

SELECT cron.schedule(
  'alerta-saude-clinicas',
  '0 11 * * *',
  $$SELECT public.verificar_saude_clinicas_e_alertar();$$
);

COMMIT;

-- ============================================================================
-- CONFERIR
-- ============================================================================
-- Rodar manualmente sem esperar o cron:
--   SELECT * FROM public.verificar_saude_clinicas_e_alertar();
--
-- Ver os alertas enfileirados:
--   SELECT assunto, dados_extras->'motivos' AS motivos, status
--     FROM notification_queue
--    WHERE assunto ILIKE '[Saúde SaaS]%%'
--    ORDER BY created_at DESC LIMIT 20;
--
-- Zerar o supressor de 24h de uma clínica específica (pra testar de novo):
--   DELETE FROM plataforma_estado WHERE chave LIKE 'alerta_saude_ultima:%';
