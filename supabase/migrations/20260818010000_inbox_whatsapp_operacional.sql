ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS responsavel_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS prioridade text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS nao_lidas integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS primeira_resposta_em timestamptz,
  ADD COLUMN IF NOT EXISTS atendimento_humano_em timestamptz,
  ADD COLUMN IF NOT EXISTS encerrada_em timestamptz,
  ADD COLUMN IF NOT EXISTS sla_limite_em timestamptz,
  ADD COLUMN IF NOT EXISTS resumo_ia text,
  ADD COLUMN IF NOT EXISTS satisfacao_nota smallint,
  ADD COLUMN IF NOT EXISTS satisfacao_comentario text;

ALTER TABLE public.whatsapp_conversations
  DROP CONSTRAINT IF EXISTS whatsapp_conversations_prioridade_check,
  ADD CONSTRAINT whatsapp_conversations_prioridade_check
    CHECK (prioridade IN ('baixa', 'normal', 'alta', 'urgente')),
  DROP CONSTRAINT IF EXISTS whatsapp_conversations_nao_lidas_check,
  ADD CONSTRAINT whatsapp_conversations_nao_lidas_check CHECK (nao_lidas >= 0),
  DROP CONSTRAINT IF EXISTS whatsapp_conversations_satisfacao_nota_check,
  ADD CONSTRAINT whatsapp_conversations_satisfacao_nota_check
    CHECK (satisfacao_nota IS NULL OR satisfacao_nota BETWEEN 1 AND 5);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_inbox
  ON public.whatsapp_conversations (clinica_id, status, prioridade, ultima_mensagem_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_responsavel
  ON public.whatsapp_conversations (responsavel_id, status);

CREATE TABLE IF NOT EXISTS public.whatsapp_notas_internas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  autor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  conteudo text NOT NULL CHECK (char_length(btrim(conteudo)) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_notas_conversa
  ON public.whatsapp_notas_internas (conversation_id, created_at);
ALTER TABLE public.whatsapp_notas_internas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_notas_select_scoped ON public.whatsapp_notas_internas;
CREATE POLICY whatsapp_notas_select_scoped ON public.whatsapp_notas_internas
  FOR SELECT TO authenticated USING (clinica_id = public.current_clinica_id());
DROP POLICY IF EXISTS whatsapp_notas_insert_scoped ON public.whatsapp_notas_internas;
CREATE POLICY whatsapp_notas_insert_scoped ON public.whatsapp_notas_internas
  FOR INSERT TO authenticated WITH CHECK (
    clinica_id = public.current_clinica_id()
    AND autor_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.whatsapp_conversations c
      WHERE c.id = conversation_id AND c.clinica_id = public.current_clinica_id()
    )
  );
DROP POLICY IF EXISTS whatsapp_notas_delete_own ON public.whatsapp_notas_internas;
CREATE POLICY whatsapp_notas_delete_own ON public.whatsapp_notas_internas
  FOR DELETE TO authenticated USING (autor_id = auth.uid() AND clinica_id = public.current_clinica_id());

CREATE OR REPLACE FUNCTION public.incrementar_whatsapp_nao_lidas(_conversation_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.whatsapp_conversations
     SET nao_lidas = nao_lidas + 1,
         sla_limite_em = COALESCE(sla_limite_em, now() + interval '15 minutes')
   WHERE id = _conversation_id;
$$;
REVOKE ALL ON FUNCTION public.incrementar_whatsapp_nao_lidas(uuid) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.incrementar_whatsapp_nao_lidas(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.marcar_whatsapp_como_lida(_conversation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.whatsapp_conversations
     SET nao_lidas = 0
   WHERE id = _conversation_id AND clinica_id = public.current_clinica_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'Conversa não encontrada nesta clínica'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.marcar_whatsapp_como_lida(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marcar_whatsapp_como_lida(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.assumir_conversa_whatsapp(_conversation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.whatsapp_conversations
     SET status = 'em_atendimento_humano', responsavel_id = auth.uid(),
         atendimento_humano_em = COALESCE(atendimento_humano_em, now()), nao_lidas = 0,
         primeira_resposta_em = COALESCE(primeira_resposta_em, now())
   WHERE id = _conversation_id
     AND clinica_id = public.current_clinica_id()
     AND status = 'aguardando_humano'
     AND (responsavel_id IS NULL OR responsavel_id = auth.uid());
  IF NOT FOUND THEN RAISE EXCEPTION 'Conversa já assumida ou indisponível'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.assumir_conversa_whatsapp(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assumir_conversa_whatsapp(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.alterar_status_conversa_whatsapp(_conversation_id uuid, _status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _status NOT IN ('ativo', 'encerrado') THEN RAISE EXCEPTION 'Status inválido'; END IF;
  UPDATE public.whatsapp_conversations
     SET status = _status,
         responsavel_id = CASE WHEN _status = 'ativo' THEN NULL ELSE responsavel_id END,
         encerrada_em = CASE WHEN _status = 'encerrado' THEN now() ELSE NULL END
   WHERE id = _conversation_id
     AND clinica_id = public.current_clinica_id()
     AND (responsavel_id = auth.uid() OR public.is_admin(auth.uid()));
  IF NOT FOUND THEN RAISE EXCEPTION 'Somente o responsável ou administrador pode alterar a conversa'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.alterar_status_conversa_whatsapp(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.alterar_status_conversa_whatsapp(uuid, text) TO authenticated;
