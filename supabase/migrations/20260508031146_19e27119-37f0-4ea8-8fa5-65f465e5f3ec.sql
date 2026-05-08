
-- Revoke EXECUTE from anon/authenticated on SECURITY DEFINER helpers that should
-- only be called from inside RLS policies, triggers or other server-side code.
-- Public RPCs (validate_invite_code, accept_employee_invitation, validate_invitation_token,
-- activate_public_registration, start_free_trial, get_user_plan, user_has_feature)
-- keep EXECUTE for authenticated/anon as needed.

DO $$
DECLARE
  fn text;
  internal_fns text[] := ARRAY[
    'has_role(uuid, app_role)',
    'is_admin(uuid)',
    'is_medico(uuid)',
    'is_enfermagem(uuid)',
    'is_recepcao(uuid)',
    'is_financeiro(uuid)',
    'can_access_financial(uuid)',
    'can_access_clinical(uuid)',
    'can_manage_data(uuid)',
    'has_any_role(uuid)',
    'is_same_clinica(uuid)',
    'get_my_clinica_id()',
    'user_in_same_clinica(uuid)',
    'fn_fill_clinica_id()',
    'handle_new_user()',
    'auto_provision_subscriber()',
    'auto_billing_on_appointment_complete()',
    'check_critical_stock()',
    'notify_exam_result_available()',
    'update_updated_at_column()',
    'update_ultimo_acesso()',
    'normalize_cpf(text)',
    'mask_cpf(text)',
    'expire_trials()',
    'delete_all_app_data()'
  ];
BEGIN
  FOREACH fn IN ARRAY internal_fns LOOP
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', fn);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skipping %: %', fn, SQLERRM;
    END;
  END LOOP;
END $$;

-- Ensure public-facing RPCs remain callable
GRANT EXECUTE ON FUNCTION public.validate_invite_code(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_invitation_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_employee_invitation(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.activate_public_registration(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_free_trial(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_plan(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_feature(uuid, text) TO authenticated;
