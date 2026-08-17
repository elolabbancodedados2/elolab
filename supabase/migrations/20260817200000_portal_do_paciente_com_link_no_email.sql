-- ============================================================================
-- Portal do paciente com token automático e link nos emails
--
-- Estado antes desta migration
-- ---------------------------------------------------------------------------
-- 81 pacientes em produção; apenas 3 tokens de portal criados. A tela do
-- Portal do Paciente existe e funciona (edge function `patient-portal` +
-- página `/portal-paciente?token=…`), mas a clínica precisava gerar cada
-- token manualmente pela ficha do paciente — na prática, ninguém fazia.
-- Resultado: uma feature entregue com adoção quase zero.
--
-- Além disso, os templates de e-mail (`notification_templates`) documentavam
-- a variável `{{link_portal}}` na lista de variáveis suportadas, mas nenhum
-- fluxo substituía essa variável pelo URL real. Se a clínica escrevia
-- "Acesse seus resultados em {{link_portal}}", o e-mail saía com a string
-- literal `{{link_portal}}`.
--
-- ─── O QUE ESTA MIGRATION FAZ ─────────────────────────────────────────────
--
-- 1. Trigger `pacientes_geram_token_portal` (AFTER INSERT em pacientes):
--    cria um `paciente_portal_tokens` com validade de 1 ano, ativo. Se por
--    algum motivo já existir um token ativo, não cria outro (idempotente).
--
-- 2. Backfill: os 81 pacientes existentes que não têm token ativo ganham
--    um agora, também com 1 ano.
--
-- 3. Função `public.link_portal_paciente(paciente_id)`:
--    - Retorna `https://app.elolab.com.br/portal-paciente?token=<...>`
--    - Usa o token ativo com maior `expires_at`.
--    - Se não houver, gera um novo (não deve acontecer depois do 1+2).
--    - `SECURITY DEFINER` para poder ser chamada dentro de triggers.
--
-- 4. Estende `notify_exam_result_available` (definida em 20260817180000)
--    para substituir `{{link_portal}}` pela URL real, tanto no e-mail
--    quanto no WhatsApp. Nada acontece se o template não usa a variável.
--
-- ─── DECISÕES ─────────────────────────────────────────────────────────────
--
-- - **1 ano de validade** é curto o bastante para um vazamento não durar
--   para sempre e longo o suficiente para o paciente não perder acesso
--   entre consultas. Se ele voltar depois disso, a próxima consulta gera
--   token novo (o backfill vai atrás dos "sem token ativo").
-- - **URL fixa em app.elolab.com.br**: hoje o único domínio de app é esse.
--   Se um dia isso mudar por clínica, movemos para `configuracoes_clinica`.
-- - **Não gera token para paciente arquivado/inativo**: os pacientes não
--   têm coluna `ativo`, então a regra fica em "todo paciente com registro
--   ganha token".
-- ============================================================================

BEGIN;

-- ─── 1. Trigger que cria token quando paciente é cadastrado ────────────────
CREATE OR REPLACE FUNCTION public.gerar_token_portal_paciente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Idempotente: se paciente já tem token ativo, não cria outro.
  IF EXISTS (
    SELECT 1 FROM public.paciente_portal_tokens
     WHERE paciente_id = NEW.id
       AND ativo = true
       AND expires_at > now()
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.paciente_portal_tokens (
    paciente_id, clinica_id, ativo, expires_at
  ) VALUES (
    NEW.id, NEW.clinica_id, true, now() + interval '1 year'
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.gerar_token_portal_paciente() IS
  'Trigger AFTER INSERT em pacientes. Cria token do portal com 1 ano de validade se ainda não houver ativo. Substitui o passo manual de gerar token pela ficha do paciente.';

DROP TRIGGER IF EXISTS pacientes_geram_token_portal ON public.pacientes;
CREATE TRIGGER pacientes_geram_token_portal
  AFTER INSERT ON public.pacientes
  FOR EACH ROW
  EXECUTE FUNCTION public.gerar_token_portal_paciente();

-- ─── 2. Backfill dos pacientes existentes ──────────────────────────────────
INSERT INTO public.paciente_portal_tokens (paciente_id, clinica_id, ativo, expires_at)
SELECT p.id, p.clinica_id, true, now() + interval '1 year'
  FROM public.pacientes p
 WHERE NOT EXISTS (
   SELECT 1 FROM public.paciente_portal_tokens t
    WHERE t.paciente_id = p.id AND t.ativo = true AND t.expires_at > now()
 );

-- ─── 3. Função que devolve o URL completo do portal ────────────────────────
CREATE OR REPLACE FUNCTION public.link_portal_paciente(p_paciente_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
BEGIN
  SELECT token INTO v_token
    FROM public.paciente_portal_tokens
   WHERE paciente_id = p_paciente_id
     AND ativo = true
     AND expires_at > now()
   ORDER BY expires_at DESC
   LIMIT 1;

  -- Fallback defensivo: se por acaso não existe (paciente antigo importado
  -- direto no banco sem passar pelo trigger), cria um agora e devolve.
  IF v_token IS NULL THEN
    INSERT INTO public.paciente_portal_tokens (paciente_id, clinica_id, ativo, expires_at)
    SELECT id, clinica_id, true, now() + interval '1 year'
      FROM public.pacientes WHERE id = p_paciente_id
    RETURNING token INTO v_token;
  END IF;

  IF v_token IS NULL THEN
    RETURN NULL;  -- paciente não existe
  END IF;

  RETURN 'https://app.elolab.com.br/portal-paciente?token=' || v_token;
END;
$$;

COMMENT ON FUNCTION public.link_portal_paciente(uuid) IS
  'URL completa do portal para o paciente. Usa o token ativo mais recente; cria um se faltar. Chamada dentro dos triggers de notificação para substituir {{link_portal}}.';

REVOKE ALL ON FUNCTION public.link_portal_paciente(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_portal_paciente(uuid) TO authenticated;

-- ─── 4. `notify_exam_result_available` passa a resolver {{link_portal}} ────
CREATE OR REPLACE FUNCTION public.notify_exam_result_available()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_paciente          record;
  v_clinica_nome      text;
  v_link_portal       text;
  v_template          record;
  v_assunto           text;
  v_conteudo          text;
  v_canais_disparados int := 0;
BEGIN
  IF NEW.status IS DISTINCT FROM 'laudo_disponivel'::status_exame OR
     (TG_OP = 'UPDATE' AND OLD.status = 'laudo_disponivel'::status_exame) THEN
    RETURN NEW;
  END IF;

  SELECT nome, email, telefone INTO v_paciente
    FROM public.pacientes WHERE id = NEW.paciente_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT nome INTO v_clinica_nome
    FROM public.clinicas WHERE id = NEW.clinica_id;

  v_clinica_nome := COALESCE(v_clinica_nome, 'a clínica');
  v_link_portal  := public.link_portal_paciente(NEW.paciente_id);

  -- E-mail
  IF v_paciente.email IS NOT NULL AND btrim(v_paciente.email) <> '' THEN
    SELECT * INTO v_template FROM public.notification_templates
     WHERE categoria = 'resultado_exame'
       AND tipo = 'email'
       AND ativo = true
       AND (clinica_id = NEW.clinica_id OR clinica_id IS NULL)
     ORDER BY (clinica_id = NEW.clinica_id) DESC
     LIMIT 1;

    IF v_template.id IS NOT NULL THEN
      v_assunto  := replace(replace(COALESCE(v_template.assunto, ''),
                     '{{paciente_nome}}', COALESCE(v_paciente.nome, '')),
                     '{{clinica_nome}}',  v_clinica_nome);
      v_conteudo := replace(replace(replace(replace(v_template.conteudo,
                     '{{paciente_nome}}', COALESCE(v_paciente.nome, '')),
                     '{{tipo_exame}}',    COALESCE(NEW.tipo_exame, '')),
                     '{{clinica_nome}}',  v_clinica_nome),
                     '{{link_portal}}',   COALESCE(v_link_portal, ''));

      INSERT INTO public.notification_queue (
        template_id, tipo, destinatario_id, destinatario_email, destinatario_nome,
        assunto, conteudo, dados_extras, status, clinica_id
      ) VALUES (
        v_template.id, 'email', NEW.paciente_id, v_paciente.email, v_paciente.nome,
        v_assunto, v_conteudo,
        jsonb_build_object('exame_id', NEW.id, 'tipo_exame', NEW.tipo_exame),
        'pendente', NEW.clinica_id
      );
      v_canais_disparados := v_canais_disparados + 1;
    END IF;
  END IF;

  -- WhatsApp
  IF v_paciente.telefone IS NOT NULL AND btrim(v_paciente.telefone) <> '' THEN
    SELECT * INTO v_template FROM public.notification_templates
     WHERE categoria = 'resultado_exame'
       AND tipo = 'whatsapp'
       AND ativo = true
       AND (clinica_id = NEW.clinica_id OR clinica_id IS NULL)
     ORDER BY (clinica_id = NEW.clinica_id) DESC
     LIMIT 1;

    IF v_template.id IS NOT NULL THEN
      v_conteudo := replace(replace(replace(replace(v_template.conteudo,
                     '{{paciente_nome}}', COALESCE(v_paciente.nome, '')),
                     '{{tipo_exame}}',    COALESCE(NEW.tipo_exame, '')),
                     '{{clinica_nome}}',  v_clinica_nome),
                     '{{link_portal}}',   COALESCE(v_link_portal, ''));

      INSERT INTO public.notification_queue (
        template_id, tipo, destinatario_id, destinatario_telefone, destinatario_nome,
        conteudo, dados_extras, status, clinica_id
      ) VALUES (
        v_template.id, 'whatsapp', NEW.paciente_id, v_paciente.telefone, v_paciente.nome,
        v_conteudo,
        jsonb_build_object('exame_id', NEW.id, 'tipo_exame', NEW.tipo_exame),
        'pendente', NEW.clinica_id
      );
      v_canais_disparados := v_canais_disparados + 1;
    END IF;
  END IF;

  IF v_canais_disparados > 0 THEN
    INSERT INTO public.automation_logs (tipo, nome, status, registros_processados, registros_sucesso, detalhes, clinica_id)
    VALUES ('exame', 'Notificação Resultado Exame', 'sucesso',
      v_canais_disparados, v_canais_disparados,
      jsonb_build_object('exame_id', NEW.id, 'paciente_id', NEW.paciente_id,
                         'tipo_exame', NEW.tipo_exame, 'canais', v_canais_disparados),
      NEW.clinica_id);
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;

-- ============================================================================
-- CONFERIR
-- ============================================================================
-- Todo paciente tem pelo menos um token ativo?
--
--   SELECT count(*) AS pacientes,
--          count(*) FILTER (
--            WHERE EXISTS (
--              SELECT 1 FROM paciente_portal_tokens t
--               WHERE t.paciente_id = pacientes.id
--                 AND t.ativo AND t.expires_at > now()
--            )
--          ) AS com_token
--     FROM pacientes;
--
-- URL de um paciente qualquer:
--
--   SELECT id, nome, public.link_portal_paciente(id) FROM pacientes LIMIT 3;
