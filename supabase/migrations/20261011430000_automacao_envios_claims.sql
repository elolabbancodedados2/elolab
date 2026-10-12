CREATE TABLE IF NOT EXISTS public.automation_delivery_claims (
  id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  chave text NOT NULL CHECK (length(chave) BETWEEN 1 AND 240),
  estado text NOT NULL DEFAULT 'claimed' CHECK (estado IN ('claimed', 'completed', 'uncertain')),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clinica_id, chave)
);

ALTER TABLE public.automation_delivery_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.automation_delivery_claims FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_delivery_claims TO service_role;
GRANT SELECT ON public.automation_delivery_claims TO authenticated;
DROP POLICY IF EXISTS automation_delivery_claims_admin_read ON public.automation_delivery_claims;
CREATE POLICY automation_delivery_claims_admin_read
  ON public.automation_delivery_claims FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) AND public.is_same_clinica(clinica_id));

CREATE OR REPLACE FUNCTION public.claim_automation_delivery(p_clinica_id uuid, p_chave text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service_role required' USING ERRCODE = '42501';
  END IF;
  IF p_clinica_id IS NULL OR p_chave IS NULL OR length(p_chave) NOT BETWEEN 1 AND 240 THEN
    RAISE EXCEPTION 'invalid automation delivery claim';
  END IF;

  -- A crashed sender is never retried automatically because its provider result
  -- may be unknown. Convert stale reservations into a visible review state.
  UPDATE public.automation_delivery_claims
  SET estado = 'uncertain', atualizado_em = now()
  WHERE clinica_id = p_clinica_id AND chave = p_chave
    AND estado = 'claimed' AND criado_em < now() - interval '10 minutes';

  INSERT INTO public.automation_delivery_claims (clinica_id, chave)
  VALUES (p_clinica_id, p_chave)
  ON CONFLICT (clinica_id, chave) DO NOTHING;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_automation_delivery(
  p_clinica_id uuid,
  p_chave text,
  p_estado text DEFAULT 'completed'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service_role required' USING ERRCODE = '42501';
  END IF;
  IF p_estado NOT IN ('completed', 'uncertain') THEN
    RAISE EXCEPTION 'invalid terminal claim state';
  END IF;

  UPDATE public.automation_delivery_claims
  SET estado = p_estado, atualizado_em = now()
  WHERE clinica_id = p_clinica_id AND chave = p_chave AND estado = 'claimed';
END;
$$;

CREATE OR REPLACE FUNCTION public.release_automation_delivery(p_clinica_id uuid, p_chave text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service_role required' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.automation_delivery_claims
  WHERE clinica_id = p_clinica_id AND chave = p_chave AND estado = 'claimed';
END;
$$;

REVOKE ALL ON FUNCTION public.claim_automation_delivery(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_automation_delivery(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_automation_delivery(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_automation_delivery(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_automation_delivery(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_automation_delivery(uuid, text) TO service_role;
