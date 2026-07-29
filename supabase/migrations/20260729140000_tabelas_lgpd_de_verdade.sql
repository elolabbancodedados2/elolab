-- ============================================================================
-- Cria as tabelas de LGPD que o app usa e que nunca existiram no banco
--
-- src/lib/lgpdCompliance.ts grava consentimento e exclusão em lgpd_consent_log
-- e lgpd_deletion_log. Nenhuma das duas existe em produção. A tela
-- /lgpd-pacientes está no ar, liberada para admin.
--
-- Como o supabase-js não lança exceção em erro de API, a gravação falhava em
-- silêncio: a clínica apagava os dados de um paciente a pedido dele e não
-- ficava registro nenhum de que apagou, por que, nem quem autorizou. É
-- exatamente o que a LGPD manda guardar.
--
-- Existe a migration 20260414140000_add_lgpd_compliance_tables.sql no repo,
-- nunca aplicada. NÃO a use: ela liga RLS sem criar política de INSERT, o que
-- bloqueia toda gravação, e deixa lgpd_deletion_log sem política nenhuma —
-- inacessível. Esta migration substitui aquela.
--
-- DECISÕES
--
-- clinica_id em todas: o escopo não pode depender de pacientes, porque o
-- registro de exclusão precisa sobreviver à remoção do paciente. Preenchido
-- pelo gatilho fn_fill_clinica_id, o mesmo do resto do banco.
--
-- Sem UPDATE e sem DELETE: são registros de auditoria. Log que pode ser
-- alterado não serve como prova. Por isso também não há política para essas
-- operações — sem política, o RLS nega.
--
-- lgpd_deletion_log.paciente_id sem chave estrangeira, de propósito: o
-- paciente referido acabou de ser apagado.
-- ============================================================================

BEGIN;

-- ─── Consentimentos ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lgpd_consent_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id  uuid NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,
  clinica_id   uuid REFERENCES public.clinicas(id) ON DELETE CASCADE,
  consent_type text NOT NULL CHECK (consent_type IN ('data_processing', 'marketing', 'third_party', 'revocation')),
  accepted     boolean NOT NULL,
  timestamp    timestamptz NOT NULL DEFAULT now(),
  ip_address   text,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ─── Exclusões (direito ao esquecimento) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lgpd_deletion_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id  uuid NOT NULL,
  clinica_id   uuid REFERENCES public.clinicas(id) ON DELETE CASCADE,
  deleted_at   timestamptz NOT NULL DEFAULT now(),
  reason       text,
  deleted_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ─── Requisições de acesso (LGPD Art. 18) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lgpd_access_request_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id      uuid NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,
  clinica_id       uuid REFERENCES public.clinicas(id) ON DELETE CASCADE,
  requested_at     timestamptz NOT NULL DEFAULT now(),
  request_type     text NOT NULL CHECK (request_type IN ('export', 'access', 'correction')),
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'fulfilled', 'denied')),
  fulfillment_date timestamptz,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ─── Índices ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_lgpd_consent_log_paciente_id        ON public.lgpd_consent_log (paciente_id);
CREATE INDEX IF NOT EXISTS idx_lgpd_consent_log_clinica_id         ON public.lgpd_consent_log (clinica_id);
CREATE INDEX IF NOT EXISTS idx_lgpd_consent_log_timestamp          ON public.lgpd_consent_log ("timestamp" DESC);
CREATE INDEX IF NOT EXISTS idx_lgpd_deletion_log_paciente_id       ON public.lgpd_deletion_log (paciente_id);
CREATE INDEX IF NOT EXISTS idx_lgpd_deletion_log_clinica_id        ON public.lgpd_deletion_log (clinica_id);
CREATE INDEX IF NOT EXISTS idx_lgpd_access_request_log_paciente_id ON public.lgpd_access_request_log (paciente_id);
CREATE INDEX IF NOT EXISTS idx_lgpd_access_request_log_clinica_id  ON public.lgpd_access_request_log (clinica_id);
CREATE INDEX IF NOT EXISTS idx_lgpd_access_request_log_status      ON public.lgpd_access_request_log (status);

-- ─── clinica_id preenchido sozinho ──────────────────────────────────────────
-- O app não envia clinica_id nessas gravações. fn_fill_clinica_id resolve pelo
-- perfil de quem está gravando e, se faltar, pelo paciente_id da própria linha.
DROP TRIGGER IF EXISTS trg_fill_clinica_id ON public.lgpd_consent_log;
CREATE TRIGGER trg_fill_clinica_id BEFORE INSERT ON public.lgpd_consent_log
  FOR EACH ROW EXECUTE FUNCTION public.fn_fill_clinica_id();

DROP TRIGGER IF EXISTS trg_fill_clinica_id ON public.lgpd_deletion_log;
CREATE TRIGGER trg_fill_clinica_id BEFORE INSERT ON public.lgpd_deletion_log
  FOR EACH ROW EXECUTE FUNCTION public.fn_fill_clinica_id();

DROP TRIGGER IF EXISTS trg_fill_clinica_id ON public.lgpd_access_request_log;
CREATE TRIGGER trg_fill_clinica_id BEFORE INSERT ON public.lgpd_access_request_log
  FOR EACH ROW EXECUTE FUNCTION public.fn_fill_clinica_id();

-- ─── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.lgpd_consent_log        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lgpd_deletion_log       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lgpd_access_request_log ENABLE ROW LEVEL SECURITY;

-- Consentimento: quem atende o paciente registra e consulta.
CREATE POLICY lgpd_consent_log_select ON public.lgpd_consent_log
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid()) AND public.is_same_clinica(clinica_id));

CREATE POLICY lgpd_consent_log_insert ON public.lgpd_consent_log
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_any_role(auth.uid())
    AND (clinica_id IS NULL OR clinica_id = public.get_my_clinica_id())
  );

-- Exclusão: só admin apaga um paciente, então só admin registra e lê.
CREATE POLICY lgpd_deletion_log_select ON public.lgpd_deletion_log
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) AND public.is_same_clinica(clinica_id));

CREATE POLICY lgpd_deletion_log_insert ON public.lgpd_deletion_log
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin(auth.uid())
    AND (clinica_id IS NULL OR clinica_id = public.get_my_clinica_id())
  );

-- Requisições de acesso: equipe registra, admin acompanha o status.
CREATE POLICY lgpd_access_request_log_select ON public.lgpd_access_request_log
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid()) AND public.is_same_clinica(clinica_id));

CREATE POLICY lgpd_access_request_log_insert ON public.lgpd_access_request_log
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_any_role(auth.uid())
    AND (clinica_id IS NULL OR clinica_id = public.get_my_clinica_id())
  );

CREATE POLICY lgpd_access_request_log_update ON public.lgpd_access_request_log
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()) AND public.is_same_clinica(clinica_id))
  WITH CHECK (public.is_admin(auth.uid()) AND public.is_same_clinica(clinica_id));

COMMENT ON TABLE public.lgpd_consent_log IS
  'Consentimentos LGPD. Imutável: sem política de UPDATE ou DELETE, porque log alterável não serve como prova.';
COMMENT ON TABLE public.lgpd_deletion_log IS
  'Exclusões a pedido do titular. paciente_id sem chave estrangeira de propósito: o paciente já foi apagado.';
COMMENT ON TABLE public.lgpd_access_request_log IS
  'Requisições de acesso, exportação e correção (LGPD Art. 18). Só o status pode ser atualizado, por admin.';

COMMIT;

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================
-- SELECT tablename, cmd, policyname FROM pg_policies
--  WHERE schemaname='public' AND tablename LIKE 'lgpd_%' ORDER BY 1, 2;
-- Cada tabela deve ter SELECT e INSERT; nenhuma deve ter DELETE.

-- Índice para deleted_by, esquecido na primeira versão deste arquivo. Sem ele,
-- remover um usuário obriga o Postgres a varrer o log inteiro à procura de
-- referências.
CREATE INDEX IF NOT EXISTS idx_lgpd_deletion_log_deleted_by
  ON public.lgpd_deletion_log (deleted_by);
