-- ============================================================================
-- Dedup do alerta usa a própria `notification_queue`, não `plataforma_estado`
--
-- A migration anterior tentou gravar o timestamp do último alerta por
-- clínica em `plataforma_estado`, achando que ela era uma tabela chave/valor.
-- Ela é linha única de manutenção. A tentativa quebrou com "column valor
-- does not exist".
--
-- Solução mais simples e sem tabela nova: consultar a própria
-- `notification_queue` — se já existe alerta enfileirado para essa clínica
-- nas últimas 24h com o mesmo dado_extras.clinica_id, pula.
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
  v_ja_alertado boolean;
BEGIN
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

    IF array_length(v_motivos, 1) IS NULL THEN
      CONTINUE;
    END IF;

    -- Já alertado nas últimas 24h para esta clínica? Se sim, pula.
    SELECT EXISTS (
      SELECT 1 FROM public.notification_queue
       WHERE tipo = 'email'
         AND assunto LIKE '[Saúde SaaS]%%'
         AND created_at > now() - interval '24 hours'
         AND (dados_extras->>'clinica_id')::uuid = v_row.clinica_id
    ) INTO v_ja_alertado;

    IF v_ja_alertado THEN
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

    clinica_id := v_row.clinica_id;
    motivo := array_to_string(v_motivos, ' · ');
    enfileirada := true;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$;

COMMIT;
