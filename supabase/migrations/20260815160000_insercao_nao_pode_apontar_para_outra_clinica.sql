-- ============================================================================
-- Quatro tabelas aceitavam inserção apontando para OUTRA clínica
--
-- Encontrado ao endurecer a restauração de backup, que é o jeito mais fácil de
-- entregar linhas escolhidas a dedo: o arquivo é um JSON que qualquer um edita.
-- Mas o buraco não depende do backup — vale para qualquer chamada à API.
--
-- ─── POR QUE PASSAVA ───────────────────────────────────────────────────────
--
-- A política de INSERT dessas quatro só checava PERMISSÃO, não a clínica:
--
--   paciente_portal_tokens : can_manage_data(auth.uid())
--   consentimentos_lgpd    : can_manage_data(auth.uid())
--   precos_consulta_convenio: can_access_financial(auth.uid())
--   tipos_consulta         : is_admin(auth.uid())
--
-- E o gatilho `fn_fill_clinica_id`, que existe justamente para carimbar a
-- clínica, começa com:
--
--   IF NEW.clinica_id IS NOT NULL THEN RETURN NEW; END IF;
--
-- Ou seja: ele preenche quando vem vazio, e RESPEITA quando vem preenchido.
-- Mandando o `clinica_id` de outra clínica, ninguém barrava.
--
-- O caso que mais preocupa é `paciente_portal_tokens`: a linha é um token de
-- acesso ao portal do paciente. Criar um apontando para outra clínica é criar
-- credencial na casa dos outros.
--
-- ─── A CORREÇÃO ────────────────────────────────────────────────────────────
--
-- Acrescenta `is_same_clinica(clinica_id)` ao WITH CHECK, tolerando NULL.
--
-- O NULL é tolerado de propósito: o WITH CHECK roda DEPOIS dos gatilhos BEFORE,
-- então quando o app insere sem clínica (o padrão de hoje) o gatilho já
-- carimbou a certa e a checagem aprova. Só sobra NULL quando nem o gatilho
-- conseguiu resolver — linha órfã, invisível para todo mundo pelo SELECT, e
-- que já era possível antes. Recusar isso agora quebraria fluxo existente sem
-- fechar buraco nenhum.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS portal_tokens_insert ON public.paciente_portal_tokens;
CREATE POLICY portal_tokens_insert ON public.paciente_portal_tokens
  FOR INSERT WITH CHECK (
    can_manage_data(auth.uid())
    AND (clinica_id IS NULL OR is_same_clinica(clinica_id))
  );

DROP POLICY IF EXISTS consentimentos_insert ON public.consentimentos_lgpd;
CREATE POLICY consentimentos_insert ON public.consentimentos_lgpd
  FOR INSERT WITH CHECK (
    can_manage_data(auth.uid())
    AND (clinica_id IS NULL OR is_same_clinica(clinica_id))
  );

DROP POLICY IF EXISTS precos_consulta_insert ON public.precos_consulta_convenio;
CREATE POLICY precos_consulta_insert ON public.precos_consulta_convenio
  FOR INSERT WITH CHECK (
    can_access_financial(auth.uid())
    AND (clinica_id IS NULL OR is_same_clinica(clinica_id))
  );

DROP POLICY IF EXISTS tipos_consulta_insert ON public.tipos_consulta;
CREATE POLICY tipos_consulta_insert ON public.tipos_consulta
  FOR INSERT WITH CHECK (
    is_admin(auth.uid())
    AND (clinica_id IS NULL OR is_same_clinica(clinica_id))
  );

COMMIT;
