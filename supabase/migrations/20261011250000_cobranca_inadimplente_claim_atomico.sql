BEGIN;

CREATE TABLE IF NOT EXISTS public.cobranca_inadimplente_claims (
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  lancamento_id uuid NOT NULL REFERENCES public.lancamentos(id) ON DELETE CASCADE,
  dias_atraso integer NOT NULL CHECK (dias_atraso > 0),
  claimed_until timestamptz NOT NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clinica_id, lancamento_id, dias_atraso)
);

ALTER TABLE public.cobranca_inadimplente_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.cobranca_inadimplente_claims FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.cobranca_inadimplente_claims TO service_role;

CREATE OR REPLACE FUNCTION public.claim_cobranca_inadimplente(
  p_clinica_id uuid,
  p_lancamento_id uuid,
  p_dias_atraso integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_claimed boolean := false;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Acesso restrito ao processador de notificações' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_clinica_id IS NULL OR p_lancamento_id IS NULL OR p_dias_atraso <= 0 THEN
    RAISE EXCEPTION 'Chave de cobrança inválida' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  INSERT INTO public.cobranca_inadimplente_claims
    (clinica_id, lancamento_id, dias_atraso, claimed_until)
  VALUES (p_clinica_id, p_lancamento_id, p_dias_atraso, now() + interval '10 minutes')
  ON CONFLICT (clinica_id, lancamento_id, dias_atraso) DO UPDATE
    SET claimed_until = EXCLUDED.claimed_until, created_at = now()
    WHERE public.cobranca_inadimplente_claims.completed_at IS NULL
      AND public.cobranca_inadimplente_claims.claimed_until < now()
  RETURNING true INTO v_claimed;

  RETURN COALESCE(v_claimed, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.concluir_cobranca_inadimplente(
  p_clinica_id uuid,
  p_lancamento_id uuid,
  p_dias_atraso integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Acesso restrito ao processador de notificações' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.cobranca_inadimplente_claims
     SET completed_at = now(), claimed_until = now()
   WHERE clinica_id = p_clinica_id
     AND lancamento_id = p_lancamento_id
     AND dias_atraso = p_dias_atraso
     AND completed_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_cobranca_inadimplente(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.concluir_cobranca_inadimplente(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_cobranca_inadimplente(uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.concluir_cobranca_inadimplente(uuid, uuid, integer) TO service_role;

COMMENT ON TABLE public.cobranca_inadimplente_claims IS
  'Reserva atômica por clínica, lançamento e etapa para evitar cobranças duplicadas em execuções concorrentes.';

COMMIT;
