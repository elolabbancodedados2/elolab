-- Metadados mínimos para a área de segurança da própria conta.
-- Tokens e endereços IP não são armazenados nesta tabela.
CREATE TABLE IF NOT EXISTS public.account_session_activity (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES auth.sessions(id) ON DELETE CASCADE,
  user_agent text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  last_activity_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (user_id, session_id)
);

ALTER TABLE public.account_session_activity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.account_session_activity FROM anon, authenticated;

COMMENT ON TABLE public.account_session_activity IS
  'Metadados mínimos por sessão para o titular consultar seus próprios dispositivos e atividade.';

CREATE OR REPLACE FUNCTION public.touch_my_account_session(p_user_agent text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_session_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sessão autenticada necessária.' USING ERRCODE = '42501';
  END IF;

  v_session_id := NULLIF(auth.jwt() ->> 'session_id', '')::uuid;
  IF v_session_id IS NULL THEN
    RAISE EXCEPTION 'Identificador de sessão ausente.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM auth.sessions AS auth_session
    WHERE auth_session.id = v_session_id
      AND auth_session.user_id = v_user_id
      AND (auth_session.not_after IS NULL OR auth_session.not_after > statement_timestamp())
  ) THEN
    RAISE EXCEPTION 'Sessão não está ativa.' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.account_session_activity AS activity
  WHERE activity.user_id = v_user_id
    AND NOT EXISTS (
      SELECT 1
      FROM auth.sessions AS auth_session
      WHERE auth_session.id = activity.session_id
        AND auth_session.user_id = v_user_id
        AND (auth_session.not_after IS NULL OR auth_session.not_after > statement_timestamp())
    );

  INSERT INTO public.account_session_activity (
    user_id,
    session_id,
    user_agent,
    created_at,
    last_activity_at
  ) VALUES (
    v_user_id,
    v_session_id,
    LEFT(REGEXP_REPLACE(COALESCE(p_user_agent, ''), '[[:cntrl:]]', '', 'g'), 500),
    statement_timestamp(),
    statement_timestamp()
  )
  ON CONFLICT (user_id, session_id) DO UPDATE
  SET user_agent = EXCLUDED.user_agent,
      last_activity_at = statement_timestamp();
END;
$$;

CREATE OR REPLACE FUNCTION public.list_my_account_sessions()
RETURNS TABLE (
  session_id uuid,
  created_at timestamptz,
  last_activity_at timestamptz,
  user_agent text,
  is_current boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    auth_session.id AS session_id,
    COALESCE(activity.created_at, auth_session.created_at) AS created_at,
    COALESCE(activity.last_activity_at, auth_session.refreshed_at, auth_session.updated_at, auth_session.created_at) AS last_activity_at,
    COALESCE(activity.user_agent, auth_session.user_agent, '') AS user_agent,
    auth_session.id = NULLIF(auth.jwt() ->> 'session_id', '')::uuid AS is_current
  FROM auth.sessions AS auth_session
  LEFT JOIN public.account_session_activity AS activity
    ON activity.session_id = auth_session.id
   AND activity.user_id = auth_session.user_id
  WHERE auth_session.user_id = auth.uid()
    AND (auth_session.not_after IS NULL OR auth_session.not_after > statement_timestamp())
  ORDER BY is_current DESC,
    COALESCE(activity.last_activity_at, auth_session.refreshed_at, auth_session.updated_at, auth_session.created_at) DESC;
$$;

REVOKE ALL ON FUNCTION public.touch_my_account_session(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.touch_my_account_session(text) TO authenticated;
REVOKE ALL ON FUNCTION public.list_my_account_sessions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_account_sessions() TO authenticated;
