BEGIN;

CREATE OR REPLACE FUNCTION public.revogar_links_portal_paciente(p_paciente_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_clinica_id uuid;
  v_revogados integer;
BEGIN
  IF v_user_id IS NULL OR NOT public.can_manage_data(v_user_id) THEN
    RAISE EXCEPTION 'Sem permissão para revogar o acesso ao portal.'
      USING ERRCODE = '42501';
  END IF;

  v_clinica_id := public.get_my_clinica_id();
  IF v_clinica_id IS NULL THEN
    RAISE EXCEPTION 'Perfil sem clínica vinculada.'
      USING ERRCODE = '42501';
  END IF;

  -- Serializa revogação e emissão para que um link recém-gerado não escape da ação.
  PERFORM 1
    FROM public.pacientes p
   WHERE p.id = p_paciente_id
     AND p.clinica_id = v_clinica_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Paciente não encontrado nesta clínica.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.paciente_portal_tokens t
     SET ativo = false
   WHERE t.paciente_id = p_paciente_id
     AND t.clinica_id = v_clinica_id
     AND t.ativo = true;

  GET DIAGNOSTICS v_revogados = ROW_COUNT;
  RETURN v_revogados;
END;
$$;

REVOKE ALL ON FUNCTION public.revogar_links_portal_paciente(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revogar_links_portal_paciente(uuid) TO authenticated;

COMMENT ON FUNCTION public.revogar_links_portal_paciente(uuid) IS
  'Invalida links ativos do Portal do Paciente para uma ficha da clínica do usuário e retorna a quantidade revogada.';

COMMIT;
