-- ============================================================================
-- Auditoria de 02/11 — view de coletas esquecidas respeita o RLS de quem lê
--
-- A view public.fila_alertas_lab_esquecido (20260817160000) foi criada sem
-- security_invoker. Views do Postgres rodam com os privilégios do dono
-- (postgres), então o RLS de coletas_laboratorio e pacientes não era aplicado:
-- qualquer chamada pela API, inclusive com a chave anon, listava nome de
-- paciente de todas as clínicas.
--
-- Com security_invoker = on, o RLS das tabelas base vale para quem consulta.
-- platform_get_clinicas_saude (SECURITY DEFINER, 20261101105000) continua
-- contando as coletas de todas as clínicas, porque roda como o dono.
-- ============================================================================

BEGIN;

ALTER VIEW IF EXISTS public.fila_alertas_lab_esquecido SET (security_invoker = on);

REVOKE ALL ON public.fila_alertas_lab_esquecido FROM anon;
REVOKE ALL ON public.fila_alertas_lab_esquecido FROM PUBLIC;
GRANT SELECT ON public.fila_alertas_lab_esquecido TO authenticated;

COMMIT;
