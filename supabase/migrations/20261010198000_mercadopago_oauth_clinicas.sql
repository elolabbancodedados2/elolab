-- Estado temporário do fluxo OAuth de conexão da conta Mercado Pago da clínica.
-- O state é salvo como SHA-256 e o PKCE verifier cifrado; cada tentativa expira
-- em 10 minutos e é consumida uma única vez pelo callback.
BEGIN;

CREATE TABLE IF NOT EXISTS public.mercadopago_oauth_states (
  state_hash text PRIMARY KEY CHECK (state_hash ~ '^[a-f0-9]{64}$'),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_verifier_cifrado text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mercadopago_oauth_states_expiry_idx
  ON public.mercadopago_oauth_states (expires_at);

ALTER TABLE public.mercadopago_oauth_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mercadopago_oauth_states FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.mercadopago_oauth_states TO service_role;

-- Serializa a rotação do refresh_token, que também é rotativo no Mercado Pago.
CREATE TABLE IF NOT EXISTS public.mercadopago_oauth_refresh_locks (
  clinica_id uuid PRIMARY KEY REFERENCES public.clinicas(id) ON DELETE CASCADE,
  lock_id uuid NOT NULL,
  lock_until timestamptz NOT NULL
);
ALTER TABLE public.mercadopago_oauth_refresh_locks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mercadopago_oauth_refresh_locks FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mercadopago_oauth_refresh_locks TO service_role;

CREATE OR REPLACE FUNCTION public.claim_mercadopago_oauth_refresh_lock(
  p_clinica_id uuid, p_lock_id uuid, p_lock_until timestamptz
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE changed integer;
BEGIN
  INSERT INTO public.mercadopago_oauth_refresh_locks (clinica_id, lock_id, lock_until)
  VALUES (p_clinica_id, p_lock_id, p_lock_until)
  ON CONFLICT (clinica_id) DO UPDATE
    SET lock_id = EXCLUDED.lock_id, lock_until = EXCLUDED.lock_until
    WHERE public.mercadopago_oauth_refresh_locks.lock_until < now();
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed = 1;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_mercadopago_oauth_refresh_lock(uuid, uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_mercadopago_oauth_refresh_lock(uuid, uuid, timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.release_mercadopago_oauth_refresh_lock(
  p_clinica_id uuid, p_lock_id uuid
) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  DELETE FROM public.mercadopago_oauth_refresh_locks
  WHERE clinica_id = p_clinica_id AND lock_id = p_lock_id;
$$;
REVOKE ALL ON FUNCTION public.release_mercadopago_oauth_refresh_lock(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_mercadopago_oauth_refresh_lock(uuid, uuid) TO service_role;

COMMIT;
