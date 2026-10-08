CREATE OR REPLACE FUNCTION public.meus_comunicados()
RETURNS TABLE (
  id uuid,
  titulo text,
  mensagem text,
  tipo text,
  inicia_em timestamptz,
  termina_em timestamptz,
  lido boolean
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    a.id,
    a.titulo,
    a.mensagem,
    a.tipo,
    a.inicia_em,
    a.termina_em,
    EXISTS (
      SELECT 1
      FROM public.platform_announcement_reads r
      WHERE r.announcement_id = a.id
        AND r.user_id = auth.uid()
    ) AS lido
  FROM public.platform_announcements a
  WHERE auth.uid() IS NOT NULL
    AND a.publicado
    AND a.inicia_em <= now()
    AND (a.termina_em IS NULL OR a.termina_em > now())
    AND (
      a.destino = 'todos'
      OR (
        a.destino = 'clinica'
        AND EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = auth.uid()
            AND a.destino_id = p.clinica_id::text
        )
      )
      OR (
        a.destino = 'plano'
        AND EXISTS (
          SELECT 1
          FROM public.assinaturas_plano s
          WHERE s.user_id = auth.uid()
            AND s.status IN ('ativa', 'trial')
            AND a.destino_id = s.plano_slug
        )
      )
    )
  ORDER BY a.inicia_em DESC;
$$;

REVOKE ALL ON FUNCTION public.meus_comunicados() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.meus_comunicados() TO authenticated;

CREATE OR REPLACE FUNCTION public.marcar_comunicado_lido(p_announcement_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.meus_comunicados() comunicado
    WHERE comunicado.id = p_announcement_id
  ) THEN
    RAISE EXCEPTION 'Comunicado indisponível para este usuário';
  END IF;

  INSERT INTO public.platform_announcement_reads (announcement_id, user_id)
  VALUES (p_announcement_id, auth.uid())
  ON CONFLICT (announcement_id, user_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.marcar_comunicado_lido(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marcar_comunicado_lido(uuid) TO authenticated;
