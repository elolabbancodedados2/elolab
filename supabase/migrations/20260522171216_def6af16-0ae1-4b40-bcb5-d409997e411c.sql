
-- ============================================
-- 1.1 platform_admins
-- ============================================
CREATE TABLE IF NOT EXISTS public.platform_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nivel text NOT NULL CHECK (nivel IN ('owner', 'support', 'finance')),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  notes text,
  UNIQUE(user_id)
);

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins
    WHERE user_id = auth.uid() AND ativo = true
  );
$$;

DROP POLICY IF EXISTS "platform_admins_select" ON public.platform_admins;
CREATE POLICY "platform_admins_select" ON public.platform_admins
  FOR SELECT USING (public.is_platform_admin());

DROP POLICY IF EXISTS "platform_admins_modify" ON public.platform_admins;
CREATE POLICY "platform_admins_modify" ON public.platform_admins
  FOR ALL USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- Seed: migra superadmin hardcoded
INSERT INTO public.platform_admins (user_id, nivel, notes)
SELECT id, 'owner', 'Migrado de SUPERADMIN_EMAILS hardcoded'
FROM auth.users
WHERE email = 'contato@elolab.com.br'
ON CONFLICT (user_id) DO NOTHING;

-- ============================================
-- 1.2 clinicas: plano + suspensão + helpers
-- ============================================
ALTER TABLE public.clinicas
  ADD COLUMN IF NOT EXISTS plano_id uuid REFERENCES public.planos(id),
  ADD COLUMN IF NOT EXISTS suspensa boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS suspensa_em timestamptz,
  ADD COLUMN IF NOT EXISTS suspensa_motivo text;

CREATE INDEX IF NOT EXISTS idx_clinicas_owner ON public.clinicas(owner_id);
CREATE INDEX IF NOT EXISTS idx_clinicas_plano ON public.clinicas(plano_id);

CREATE OR REPLACE FUNCTION public.current_clinica_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT clinica_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_clinica_owner(p_clinica_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clinicas
    WHERE id = p_clinica_id AND owner_id = auth.uid()
  );
$$;

-- ============================================
-- 1.3 planos: limites de uso
-- ============================================
ALTER TABLE public.planos
  ADD COLUMN IF NOT EXISTS max_medicos integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS max_recepcao integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS max_funcionarios_total integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS max_storage_mb integer NOT NULL DEFAULT 1000;

-- Ajusta limites para planos conhecidos (não cria novos, só atualiza)
UPDATE public.planos SET max_medicos=2, max_recepcao=1, max_funcionarios_total=3, max_storage_mb=500 WHERE slug='trial';
UPDATE public.planos SET max_medicos=3, max_recepcao=2, max_funcionarios_total=6, max_storage_mb=2000 WHERE slug='basic';
UPDATE public.planos SET max_medicos=10, max_recepcao=5, max_funcionarios_total=20, max_storage_mb=10000 WHERE slug IN ('pro','max');
UPDATE public.planos SET max_medicos=999, max_recepcao=999, max_funcionarios_total=999, max_storage_mb=100000 WHERE slug IN ('enterprise','ultra');

-- ============================================
-- 1.4 convites_funcionario
-- ============================================
CREATE TABLE IF NOT EXISTS public.convites_funcionario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  email text NOT NULL,
  nome text NOT NULL,
  roles text[] NOT NULL,
  token text NOT NULL UNIQUE,
  invited_by uuid NOT NULL REFERENCES auth.users(id),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_convites_clinica ON public.convites_funcionario(clinica_id);
CREATE INDEX IF NOT EXISTS idx_convites_email ON public.convites_funcionario(lower(email));
CREATE INDEX IF NOT EXISTS idx_convites_token ON public.convites_funcionario(token);

ALTER TABLE public.convites_funcionario ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "convites_select" ON public.convites_funcionario;
CREATE POLICY "convites_select" ON public.convites_funcionario
  FOR SELECT USING (
    clinica_id = public.current_clinica_id()
    OR public.is_platform_admin()
  );

DROP POLICY IF EXISTS "convites_insert" ON public.convites_funcionario;
CREATE POLICY "convites_insert" ON public.convites_funcionario
  FOR INSERT WITH CHECK (
    clinica_id = public.current_clinica_id()
    AND public.is_admin(auth.uid())
  );

DROP POLICY IF EXISTS "convites_delete" ON public.convites_funcionario;
CREATE POLICY "convites_delete" ON public.convites_funcionario
  FOR DELETE USING (
    clinica_id = public.current_clinica_id()
    AND public.is_admin(auth.uid())
  );

-- ============================================
-- 1.5 platform_impersonation_log
-- ============================================
CREATE TABLE IF NOT EXISTS public.platform_impersonation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_admin_id uuid NOT NULL REFERENCES auth.users(id),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id),
  motivo text NOT NULL,
  iniciado_em timestamptz NOT NULL DEFAULT now(),
  encerrado_em timestamptz,
  acoes jsonb NOT NULL DEFAULT '[]'::jsonb
);

ALTER TABLE public.platform_impersonation_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "impersonation_log_all" ON public.platform_impersonation_log;
CREATE POLICY "impersonation_log_all" ON public.platform_impersonation_log
  FOR ALL USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());
