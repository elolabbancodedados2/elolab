-- ============================================================================
-- Corrige a migration 20260728041952
--
-- Aquela migration tinha a intenção certa (restringir listagem de arquivos e
-- reduzir EXECUTE concedido a anon), mas três detalhes a tornam inócua ou
-- quebram fluxo em produção. Conferido contra o código que grava os arquivos.
--
-- ── 1. patient_photos_clinic_list nunca casa ────────────────────────────────
-- A política exige  (storage.foldername(name))[1] = clinica_id
-- O upload real grava  `${pacienteId}/${timestamp}.ext`
--   (src/components/clinical/PatientPhoto.tsx)
-- Ou seja, a primeira pasta é o PACIENTE, não a clínica. A comparação nunca é
-- verdadeira e nenhum usuário autenticado consegue listar as fotos.
-- O mesmo bucket ainda recebe foto e carimbo de MÉDICO (src/pages/Medicos.tsx).
--
-- ── 2. tv_panel_media_clinic_list nunca casa ────────────────────────────────
-- O upload grava `${timestamp}.ext`, sem pasta nenhuma
--   (src/pages/PainelTV.tsx)
-- storage.foldername('123.png') devolve array vazio, então [1] é NULL e
-- `NULL = texto` é NULL — a política nunca casa. O Painel TV não lista mídia.
--
-- ── 3. O REVOKE derruba o aceite de convite ─────────────────────────────────
-- O laço revoga EXECUTE de `anon` em toda função SECURITY DEFINER, exceto duas
-- validadoras. Mas accept_employee_invitation PRECISA ser chamável por anon:
-- quando a confirmação de e-mail está ativa, o signUp não devolve sessão e o
-- aceite acontece sem usuário autenticado. A função já se protege sozinha —
-- resolve o destinatário pelo e-mail do convite e recusa sessão de terceiro.
-- ============================================================================

BEGIN;

-- ─── 1 e 2: políticas de listagem que de fato funcionam ─────────────────────

-- patient-photos guarda `<paciente_id>/...` e também `<medico_id>/...`.
-- Como o caminho não carrega a clínica, resolvemos por consulta.
CREATE OR REPLACE FUNCTION public.storage_patient_photo_allowed(_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  candidate  uuid;
  my_clinica uuid;
BEGIN
  my_clinica := public.get_my_clinica_id();
  IF my_clinica IS NULL OR _name IS NULL THEN
    RETURN false;
  END IF;

  BEGIN
    candidate := (string_to_array(_name, '/'))[1]::uuid;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;

  RETURN EXISTS (SELECT 1 FROM public.pacientes WHERE id = candidate AND clinica_id = my_clinica)
      OR EXISTS (SELECT 1 FROM public.medicos   WHERE id = candidate AND clinica_id = my_clinica);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.storage_patient_photo_allowed(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.storage_patient_photo_allowed(text) TO authenticated;

DROP POLICY IF EXISTS "patient_photos_clinic_list" ON storage.objects;
CREATE POLICY "patient_photos_clinic_list"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'patient-photos'
  AND public.storage_patient_photo_allowed(name)
);

-- tv-panel-media grava arquivos na raiz do bucket, sem pasta. Não há como
-- deduzir a clínica pelo caminho, então a listagem é liberada para quem tem
-- papel na clínica — o conteúdo é mídia institucional exibida na sala de
-- espera, não dado de paciente.
--
-- Para escopar de verdade, o upload precisaria passar a gravar
-- `<clinica_id>/<arquivo>` em src/pages/PainelTV.tsx; enquanto isso não
-- acontecer, uma política baseada em pasta só quebraria a tela.
DROP POLICY IF EXISTS "tv_panel_media_clinic_list" ON storage.objects;
CREATE POLICY "tv_panel_media_clinic_list"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'tv-panel-media'
  AND public.has_any_role(auth.uid())
);

-- ─── 3: devolve o aceite de convite para anon ───────────────────────────────
DO $$
DECLARE
  args text;
BEGIN
  FOR args IN
    SELECT pg_get_function_identity_arguments(p.oid)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'accept_employee_invitation'
  LOOP
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION public.accept_employee_invitation(%s) TO anon, authenticated',
      args
    );
  END LOOP;
END $$;

COMMIT;

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================
-- -- As políticas de listagem casam com algum arquivo real?
-- SELECT name, public.storage_patient_photo_allowed(name)
--   FROM storage.objects WHERE bucket_id = 'patient-photos' LIMIT 10;
--
-- -- anon voltou a poder aceitar convite?
-- SELECT has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_pode
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname='public' AND p.proname='accept_employee_invitation';
