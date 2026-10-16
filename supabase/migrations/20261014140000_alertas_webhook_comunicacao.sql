CREATE UNIQUE INDEX IF NOT EXISTS notification_queue_webhook_alert_hour_uidx
  ON public.notification_queue (
    clinica_id,
    (dados_extras ->> 'codigo_alerta'),
    (dados_extras ->> 'janela_alerta')
  )
  WHERE status = 'erro'
    AND dados_extras ? 'codigo_alerta'
    AND dados_extras ? 'janela_alerta';

CREATE OR REPLACE FUNCTION public.registrar_alerta_webhook_comunicacao(
  p_clinica_id uuid,
  p_codigo text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_bucket text := to_char(date_trunc('hour', now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24"Z"');
BEGIN
  IF p_clinica_id IS NULL OR p_codigo <> 'webhook_whatsapp_processing_failed' THEN
    RAISE EXCEPTION 'invalid communication alert';
  END IF;

  INSERT INTO public.notification_queue (
    tipo, assunto, conteudo, status, tentativas, max_tentativas,
    erro_mensagem, agendado_para, clinica_id, dados_extras
  ) VALUES (
    'email',
    'Falha no webhook WhatsApp',
    'Uma falha técnica interrompeu o processamento de um evento de comunicação. Verifique a sessão e a configuração da integração da clínica.',
    'erro', 0, 1,
    'Webhook de comunicação com falha. Código técnico: webhook_whatsapp_processing_failed.',
    now(), p_clinica_id,
    jsonb_build_object(
      'codigo_alerta', p_codigo,
      'janela_alerta', v_bucket
    )
  )
  ON CONFLICT (
    clinica_id,
    (dados_extras ->> 'codigo_alerta'),
    (dados_extras ->> 'janela_alerta')
  )
  WHERE status = 'erro'
    AND dados_extras ? 'codigo_alerta'
    AND dados_extras ? 'janela_alerta'
  DO UPDATE SET
    updated_at = now(),
    erro_mensagem = EXCLUDED.erro_mensagem,
    conteudo = EXCLUDED.conteudo
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_alerta_webhook_comunicacao(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_alerta_webhook_comunicacao(uuid, text)
  TO service_role;

COMMENT ON FUNCTION public.registrar_alerta_webhook_comunicacao(uuid, text) IS
  'Cria alerta técnico sem dados pessoais, deduplicado por clínica e hora; somente service_role pode chamá-lo.';
