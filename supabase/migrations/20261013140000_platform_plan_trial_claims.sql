-- Histórico de teste gratuito controlado pelo servidor, independente de user_metadata.
CREATE TABLE IF NOT EXISTS public.platform_plan_trial_claims (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plano_slug text NOT NULL,
  trial_days integer NOT NULL CHECK (trial_days > 0),
  checkout_reference uuid NOT NULL UNIQUE,
  gateway_subscription_id text,
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'pending', 'started')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_plan_trial_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_plan_trial_claims FROM anon, authenticated;
GRANT ALL ON public.platform_plan_trial_claims TO service_role;

-- Preserve eligibility history already recorded on the platform entitlement row.
INSERT INTO public.platform_plan_trial_claims (
  user_id, plano_slug, trial_days, checkout_reference, status, created_at
)
SELECT
  ap.user_id,
  ap.plano_slug,
  GREATEST(1, COALESCE(p.trial_dias, 1)),
  gen_random_uuid(),
  'started',
  COALESCE(ap.updated_at, ap.created_at, now())
FROM public.assinaturas_plano ap
LEFT JOIN public.planos p ON p.id = ap.plano_id
JOIN auth.users u ON u.id = ap.user_id
WHERE COALESCE(ap.em_trial, false) OR ap.trial_fim IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

-- Also retain trials from gateway checkouts that predate the platform claim table.
INSERT INTO public.platform_plan_trial_claims (
  user_id, plano_slug, trial_days, checkout_reference, gateway_subscription_id, status, created_at
)
SELECT
  (am.detalhes->>'user_id')::uuid,
  COALESCE(NULLIF(am.detalhes->>'plano_slug', ''), 'historico'),
  1,
  gen_random_uuid(),
  am.mp_preapproval_id,
  'started',
  COALESCE(am.created_at, now())
FROM public.assinaturas_mercadopago am
JOIN auth.users u ON u.id::text = am.detalhes->>'user_id'
WHERE (am.detalhes->>'trial_end') IS NOT NULL
  AND (am.detalhes->>'user_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
ON CONFLICT (user_id) DO NOTHING;
