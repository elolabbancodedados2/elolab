ALTER VIEW public.funcionarios_safe SET (security_invoker = on);
ALTER VIEW public.nps_resumo_mensal SET (security_invoker = on);

REVOKE EXECUTE ON FUNCTION public.fn_fill_clinica_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_fill_clinica_id() FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_fill_clinica_id() FROM authenticated;