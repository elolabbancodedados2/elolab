
-- 1) Backfill clinica_id
UPDATE public.medicos m
SET clinica_id = COALESCE(
  (SELECT p.clinica_id FROM public.profiles p WHERE p.id = m.user_id),
  (SELECT f.clinica_id FROM public.funcionarios f WHERE f.email = m.email LIMIT 1),
  (SELECT id FROM public.clinicas ORDER BY created_at LIMIT 1)
)
WHERE m.clinica_id IS NULL;

UPDATE public.funcionarios f
SET clinica_id = COALESCE(
  (SELECT p.clinica_id FROM public.profiles p WHERE p.id = f.user_id),
  (SELECT id FROM public.clinicas ORDER BY created_at LIMIT 1)
)
WHERE f.clinica_id IS NULL;

UPDATE public.salas
SET clinica_id = (SELECT id FROM public.clinicas ORDER BY created_at LIMIT 1)
WHERE clinica_id IS NULL;

UPDATE public.convenios
SET clinica_id = (SELECT id FROM public.clinicas ORDER BY created_at LIMIT 1)
WHERE clinica_id IS NULL;

-- 2) Corrige policy permissiva em feedbacks_nps (sem clinica_id direto, valida via paciente)
DROP POLICY IF EXISTS nps_insert_policy ON public.feedbacks_nps;
CREATE POLICY nps_insert_policy ON public.feedbacks_nps
  FOR INSERT TO authenticated
  WITH CHECK (
    paciente_id IS NULL OR EXISTS (
      SELECT 1 FROM public.pacientes p
      WHERE p.id = paciente_id
        AND public.is_same_clinica(p.clinica_id)
    )
  );

-- 3) Revoga EXECUTE de funções internas SECURITY DEFINER
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'fn_fill_clinica_id()',
    'auto_provision_subscriber()',
    'update_updated_at_column()',
    'handle_new_user()',
    'update_ultimo_acesso()',
    'check_critical_stock()',
    'notify_exam_result_available()',
    'auto_billing_on_appointment_complete()',
    'expire_trials()',
    'mask_cpf(text)',
    'normalize_cpf(text)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', fn);
  END LOOP;
END $$;
