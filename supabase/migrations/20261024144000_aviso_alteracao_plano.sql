-- Aviso à clínica quando o preço ou um limite do plano muda.
--
-- Um trigger em planos registra a alteração (valor e limites) e enfileira um
-- e-mail para o dono de cada assinatura ativa ou em teste do plano. A tela de
-- Planos mostra o mesmo aviso com o efeito para a conta:
--   * preço, período pré-pago (Pix): vale a partir do próximo período, depois
--     de data_fim — o aviso chega antes dessa renovação;
--   * preço, assinatura no cartão: o Mercado Pago mantém o valor autorizado na
--     assinatura; o código não altera o preapproval existente;
--   * limites: valem no momento da alteração (validarLimitesDeEquipe lê o plano
--     vigente), por isso o aviso informa a data da mudança.
-- Aditiva e idempotente.

CREATE TABLE IF NOT EXISTS public.platform_plan_change_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plano_id uuid NOT NULL REFERENCES public.planos(id) ON DELETE CASCADE,
  plano_nome text NOT NULL,
  campos jsonb NOT NULL,
  alterado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_plan_change_notices_plano_idx
  ON public.platform_plan_change_notices (plano_id, created_at DESC);

ALTER TABLE public.platform_plan_change_notices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.platform_plan_change_notices FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.platform_plan_change_notices TO service_role;

CREATE OR REPLACE FUNCTION public.fn_avisar_alteracao_plano()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_campos jsonb := '{}'::jsonb;
  v_aviso uuid;
  v_texto text := '';
BEGIN
  IF NEW.valor IS DISTINCT FROM OLD.valor THEN
    v_campos := v_campos || jsonb_build_object('valor', jsonb_build_object('antes', OLD.valor, 'depois', NEW.valor));
    v_texto := v_texto || format(E'\n- Preço: de R$ %s para R$ %s.', to_char(OLD.valor, 'FM999G990D00'), to_char(NEW.valor, 'FM999G990D00'));
  END IF;
  IF NEW.max_medicos IS DISTINCT FROM OLD.max_medicos THEN
    v_campos := v_campos || jsonb_build_object('max_medicos', jsonb_build_object('antes', OLD.max_medicos, 'depois', NEW.max_medicos));
    v_texto := v_texto || format(E'\n- Médicos: de %s para %s.', OLD.max_medicos, NEW.max_medicos);
  END IF;
  IF NEW.max_recepcao IS DISTINCT FROM OLD.max_recepcao THEN
    v_campos := v_campos || jsonb_build_object('max_recepcao', jsonb_build_object('antes', OLD.max_recepcao, 'depois', NEW.max_recepcao));
    v_texto := v_texto || format(E'\n- Recepção: de %s para %s.', OLD.max_recepcao, NEW.max_recepcao);
  END IF;
  IF NEW.max_funcionarios_total IS DISTINCT FROM OLD.max_funcionarios_total THEN
    v_campos := v_campos || jsonb_build_object('max_funcionarios_total', jsonb_build_object('antes', OLD.max_funcionarios_total, 'depois', NEW.max_funcionarios_total));
    v_texto := v_texto || format(E'\n- Funcionários: de %s para %s.', OLD.max_funcionarios_total, NEW.max_funcionarios_total);
  END IF;
  IF NEW.max_storage_mb IS DISTINCT FROM OLD.max_storage_mb THEN
    v_campos := v_campos || jsonb_build_object('max_storage_mb', jsonb_build_object('antes', OLD.max_storage_mb, 'depois', NEW.max_storage_mb));
    v_texto := v_texto || format(E'\n- Armazenamento: de %s MB para %s MB.', OLD.max_storage_mb, NEW.max_storage_mb);
  END IF;
  IF v_campos = '{}'::jsonb THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.platform_plan_change_notices (plano_id, plano_nome, campos, alterado_por)
  VALUES (NEW.id, NEW.nome, v_campos, auth.uid())
  RETURNING id INTO v_aviso;

  INSERT INTO public.notification_queue (
    tipo, assunto, conteudo, destinatario_email, destinatario_nome, destinatario_id, clinica_id, status, dados_extras
  )
  SELECT 'email',
         format('Alteração no plano %s do EloLab', NEW.nome),
         format(
           E'Olá %s,\n\nO plano %s teve alterações:%s\n\n%s%s\nConfira os detalhes em Planos.\n\nEquipe EloLab',
           coalesce(p.nome, ''), NEW.nome, v_texto,
           CASE WHEN v_campos - 'valor' <> '{}'::jsonb THEN E'Os novos limites valem a partir de hoje.\n' ELSE '' END,
           CASE
             WHEN NOT (v_campos ? 'valor') THEN ''
             WHEN ap.cobranca_modalidade = 'pre_pago' AND ap.data_fim IS NOT NULL
               THEN format('O novo preço vale a partir do próximo período, depois de %s.', to_char(ap.data_fim AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY'))
             ELSE 'Sua assinatura no cartão mantém o valor já autorizado no Mercado Pago.'
           END
         ),
         p.email, p.nome, ap.user_id, p.clinica_id, 'pendente',
         jsonb_build_object('tipo_lembrete', 'plan_terms_changed', 'aviso_id', v_aviso, 'assinatura_id', ap.id)
    FROM public.assinaturas_plano ap
    JOIN public.profiles p ON p.id = ap.user_id
   WHERE ap.plano_id = NEW.id
     AND ap.status IN ('ativa', 'trial')
     AND p.email IS NOT NULL;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_avisar_alteracao_plano() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_avisar_alteracao_plano ON public.planos;
CREATE TRIGGER trg_avisar_alteracao_plano
  AFTER UPDATE OF valor, max_medicos, max_recepcao, max_funcionarios_total, max_storage_mb ON public.planos
  FOR EACH ROW EXECUTE FUNCTION public.fn_avisar_alteracao_plano();

-- Avisos dos últimos 90 dias para o plano vigente da clínica de quem consulta.
CREATE OR REPLACE FUNCTION public.avisos_alteracao_plano()
RETURNS TABLE (
  id uuid,
  plano_nome text,
  campos jsonb,
  alterado_em timestamptz,
  efeito_preco text,
  vigencia_preco timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_owner uuid;
  v_assinatura public.assinaturas_plano%ROWTYPE;
BEGIN
  SELECT COALESCE(c.owner_id, p.id) INTO v_owner
    FROM public.profiles p
    LEFT JOIN public.clinicas c ON c.id = p.clinica_id
   WHERE p.id = auth.uid();
  IF v_owner IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO v_assinatura
    FROM public.assinaturas_plano
   WHERE user_id = v_owner AND status IN ('ativa', 'trial')
   ORDER BY created_at DESC
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT n.id, n.plano_nome, n.campos, n.created_at,
         CASE
           WHEN NOT (n.campos ? 'valor') THEN NULL
           WHEN v_assinatura.cobranca_modalidade = 'pre_pago' THEN 'proximo_periodo'
           ELSE 'valor_autorizado_mantido'
         END,
         CASE WHEN n.campos ? 'valor' AND v_assinatura.cobranca_modalidade = 'pre_pago' THEN v_assinatura.data_fim END
    FROM public.platform_plan_change_notices n
   WHERE n.plano_id = v_assinatura.plano_id
     AND n.created_at >= now() - interval '90 days'
   ORDER BY n.created_at DESC
   LIMIT 5;
END;
$function$;

REVOKE ALL ON FUNCTION public.avisos_alteracao_plano() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.avisos_alteracao_plano() TO authenticated;
