
-- 1. Colunas de assinatura em prontuarios
ALTER TABLE public.prontuarios
  ADD COLUMN IF NOT EXISTS assinado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS assinado_em timestamp with time zone,
  ADD COLUMN IF NOT EXISTS assinado_por uuid,
  ADD COLUMN IF NOT EXISTS crm_assinante text,
  ADD COLUMN IF NOT EXISTS hash_conteudo text,
  ADD COLUMN IF NOT EXISTS tipo_assinatura text CHECK (tipo_assinatura IN ('icp_brasil','eletronica_simples','govbr'));

-- 2. Tabela de adendos (CFM 1.638/2002 art. 5º)
CREATE TABLE IF NOT EXISTS public.prontuario_adendos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prontuario_id uuid NOT NULL REFERENCES public.prontuarios(id) ON DELETE RESTRICT,
  clinica_id uuid,
  medico_id uuid,
  medico_nome text NOT NULL,
  crm text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('retificacao','complemento','erratum')),
  motivo text NOT NULL,
  texto text NOT NULL,
  hash text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.prontuario_adendos TO authenticated;
GRANT ALL ON public.prontuario_adendos TO service_role;
ALTER TABLE public.prontuario_adendos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "adendos_select_same_clinica" ON public.prontuario_adendos
  FOR SELECT TO authenticated
  USING (public.is_same_clinica(clinica_id));

CREATE POLICY "adendos_insert_same_clinica" ON public.prontuario_adendos
  FOR INSERT TO authenticated
  WITH CHECK (public.is_same_clinica(clinica_id));

-- Adendos NUNCA podem ser editados ou excluídos (imutabilidade CFM)
-- Sem policies de UPDATE/DELETE = bloqueado por RLS

-- 3. Tabela de acessos (trilha de auditoria - CFM 2.217/2018)
CREATE TABLE IF NOT EXISTS public.prontuario_acessos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prontuario_id uuid REFERENCES public.prontuarios(id) ON DELETE SET NULL,
  paciente_id uuid,
  clinica_id uuid,
  user_id uuid,
  user_nome text,
  user_crm text,
  acao text NOT NULL CHECK (acao IN ('visualizacao','edicao','assinatura','impressao','compartilhamento','exportacao','adendo')),
  justificativa text,
  ip_address text,
  user_agent text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.prontuario_acessos TO authenticated;
GRANT ALL ON public.prontuario_acessos TO service_role;
ALTER TABLE public.prontuario_acessos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "acessos_select_same_clinica" ON public.prontuario_acessos
  FOR SELECT TO authenticated
  USING (public.is_same_clinica(clinica_id));

CREATE POLICY "acessos_insert_same_clinica" ON public.prontuario_acessos
  FOR INSERT TO authenticated
  WITH CHECK (public.is_same_clinica(clinica_id));

-- Acessos são imutáveis: sem UPDATE/DELETE policies

CREATE INDEX IF NOT EXISTS idx_prontuario_acessos_prontuario ON public.prontuario_acessos(prontuario_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prontuario_adendos_prontuario ON public.prontuario_adendos(prontuario_id, created_at);

-- 4. Trigger de imutabilidade: prontuário assinado não pode ser alterado nem excluído
CREATE OR REPLACE FUNCTION public.prevent_signed_prontuario_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.assinado = true THEN
      RAISE EXCEPTION 'Prontuário assinado não pode ser excluído (CFM Res. 1.821/2007). Use adendo para retificações.';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.assinado = true THEN
    -- Só permite alteração dos próprios campos de assinatura (idempotência) NÃO — bloqueia tudo
    RAISE EXCEPTION 'Prontuário assinado é imutável (CFM Res. 1.821/2007). Registre uma retificação como adendo.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_signed_prontuario_change ON public.prontuarios;
CREATE TRIGGER trg_prevent_signed_prontuario_change
  BEFORE UPDATE OR DELETE ON public.prontuarios
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_signed_prontuario_change();

-- 5. Trigger para preencher clinica_id nos adendos e acessos
DROP TRIGGER IF EXISTS trg_fill_clinica_adendos ON public.prontuario_adendos;
CREATE TRIGGER trg_fill_clinica_adendos
  BEFORE INSERT ON public.prontuario_adendos
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_fill_clinica_id();

DROP TRIGGER IF EXISTS trg_fill_clinica_acessos ON public.prontuario_acessos;
CREATE TRIGGER trg_fill_clinica_acessos
  BEFORE INSERT ON public.prontuario_acessos
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_fill_clinica_id();
