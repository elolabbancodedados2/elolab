-- Retornos são dados clínicos e precisam seguir o mesmo isolamento dos demais
-- registros do paciente. A policy antiga só verificava o papel do usuário;
-- portanto um usuário clínico podia consultar retornos de outra clínica.

DROP POLICY IF EXISTS "retornos_select" ON public.retornos;
DROP POLICY IF EXISTS retornos_select_scoped ON public.retornos;
CREATE POLICY retornos_select_scoped ON public.retornos
  FOR SELECT TO authenticated
  USING (
    (can_access_clinical(auth.uid()) OR is_recepcao(auth.uid()))
    AND is_same_clinica(clinica_id)
  );

DROP POLICY IF EXISTS "retornos_insert" ON public.retornos;
DROP POLICY IF EXISTS retornos_insert_scoped ON public.retornos;
CREATE POLICY retornos_insert_scoped ON public.retornos
  FOR INSERT TO authenticated
  WITH CHECK (
    can_access_clinical(auth.uid())
    AND clinica_id = get_my_clinica_id()
  );

DROP POLICY IF EXISTS "retornos_update" ON public.retornos;
DROP POLICY IF EXISTS retornos_update_scoped ON public.retornos;
CREATE POLICY retornos_update_scoped ON public.retornos
  FOR UPDATE TO authenticated
  USING (
    (can_access_clinical(auth.uid()) OR is_recepcao(auth.uid()))
    AND is_same_clinica(clinica_id)
  )
  WITH CHECK (
    (can_access_clinical(auth.uid()) OR is_recepcao(auth.uid()))
    AND clinica_id = get_my_clinica_id()
  );

DROP POLICY IF EXISTS "retornos_delete" ON public.retornos;
DROP POLICY IF EXISTS retornos_delete_scoped ON public.retornos;
CREATE POLICY retornos_delete_scoped ON public.retornos
  FOR DELETE TO authenticated
  USING (is_admin(auth.uid()) AND is_same_clinica(clinica_id));

-- Protocolos clínicos também são configuração privada da clínica. A policy
-- histórica de SELECT só verificava o papel e ainda permitia leitura cruzada.
DROP POLICY IF EXISTS "protocolos_select" ON public.protocolos_clinicos;
DROP POLICY IF EXISTS protocolos_select_scoped ON public.protocolos_clinicos;
CREATE POLICY protocolos_select_scoped ON public.protocolos_clinicos
  FOR SELECT TO authenticated
  USING (can_access_clinical(auth.uid()) AND is_same_clinica(clinica_id));

DROP POLICY IF EXISTS "protocolos_insert" ON public.protocolos_clinicos;
DROP POLICY IF EXISTS protocolos_insert_scoped ON public.protocolos_clinicos;
CREATE POLICY protocolos_insert_scoped ON public.protocolos_clinicos
  FOR INSERT TO authenticated
  WITH CHECK (
    (is_admin(auth.uid()) OR is_medico(auth.uid()))
    AND clinica_id = get_my_clinica_id()
  );

DROP POLICY IF EXISTS "protocolos_update" ON public.protocolos_clinicos;
DROP POLICY IF EXISTS protocolos_clinicos_update_scoped ON public.protocolos_clinicos;
CREATE POLICY protocolos_update_scoped ON public.protocolos_clinicos
  FOR UPDATE TO authenticated
  USING ((is_admin(auth.uid()) OR is_medico(auth.uid())) AND is_same_clinica(clinica_id))
  WITH CHECK ((is_admin(auth.uid()) OR is_medico(auth.uid())) AND clinica_id = get_my_clinica_id());

DROP POLICY IF EXISTS "protocolos_delete" ON public.protocolos_clinicos;
DROP POLICY IF EXISTS protocolos_delete_scoped ON public.protocolos_clinicos;
CREATE POLICY protocolos_delete_scoped ON public.protocolos_clinicos
  FOR DELETE TO authenticated
  USING (is_admin(auth.uid()) AND is_same_clinica(clinica_id));

-- A mesma varredura encontrou policies legadas ainda permissivas em catálogos
-- usados pelo agendamento e em dados de cobrança do Mercado Pago. Como policies
-- PERMISSIVE se combinam com OR, basta uma policy antiga para reabrir o acesso.
DROP POLICY IF EXISTS tipos_consulta_update ON public.tipos_consulta;
DROP POLICY IF EXISTS tipos_consulta_delete ON public.tipos_consulta;
CREATE POLICY tipos_consulta_update_scoped ON public.tipos_consulta
  FOR UPDATE TO authenticated
  USING (is_admin(auth.uid()) AND is_same_clinica(clinica_id))
  WITH CHECK (is_admin(auth.uid()) AND clinica_id = get_my_clinica_id());
CREATE POLICY tipos_consulta_delete_scoped ON public.tipos_consulta
  FOR DELETE TO authenticated
  USING (is_admin(auth.uid()) AND is_same_clinica(clinica_id));

DROP POLICY IF EXISTS precos_consulta_update ON public.precos_consulta_convenio;
DROP POLICY IF EXISTS precos_consulta_delete ON public.precos_consulta_convenio;
CREATE POLICY precos_consulta_update_scoped ON public.precos_consulta_convenio
  FOR UPDATE TO authenticated
  USING (can_access_financial(auth.uid()) AND is_same_clinica(clinica_id))
  WITH CHECK (can_access_financial(auth.uid()) AND clinica_id = get_my_clinica_id());
CREATE POLICY precos_consulta_delete_scoped ON public.precos_consulta_convenio
  FOR DELETE TO authenticated
  USING (is_admin(auth.uid()) AND is_same_clinica(clinica_id));

-- Tokens do portal são credenciais sensíveis; o vínculo com a clínica precisa
-- ser validado também nas operações administrativas.
DROP POLICY IF EXISTS portal_tokens_select ON public.paciente_portal_tokens;
DROP POLICY IF EXISTS portal_tokens_delete ON public.paciente_portal_tokens;
CREATE POLICY portal_tokens_select_scoped ON public.paciente_portal_tokens
  FOR SELECT TO authenticated
  USING (can_manage_data(auth.uid()) AND is_same_clinica(clinica_id));
CREATE POLICY portal_tokens_delete_scoped ON public.paciente_portal_tokens
  FOR DELETE TO authenticated
  USING (is_admin(auth.uid()) AND is_same_clinica(clinica_id));

DROP POLICY IF EXISTS pagamentos_mp_select ON public.pagamentos_mercadopago;
DROP POLICY IF EXISTS pagamentos_mp_update ON public.pagamentos_mercadopago;
CREATE POLICY pagamentos_mp_select_scoped ON public.pagamentos_mercadopago
  FOR SELECT TO authenticated
  USING (can_access_financial(auth.uid()) AND is_same_clinica(clinica_id));
CREATE POLICY pagamentos_mp_update_scoped ON public.pagamentos_mercadopago
  FOR UPDATE TO authenticated
  USING (can_access_financial(auth.uid()) AND is_same_clinica(clinica_id))
  WITH CHECK (can_access_financial(auth.uid()) AND clinica_id = get_my_clinica_id());

DROP POLICY IF EXISTS assinaturas_mp_select ON public.assinaturas_mercadopago;
DROP POLICY IF EXISTS assinaturas_mp_update ON public.assinaturas_mercadopago;
CREATE POLICY assinaturas_mp_select_scoped ON public.assinaturas_mercadopago
  FOR SELECT TO authenticated
  USING (can_access_financial(auth.uid()) AND is_same_clinica(clinica_id));
CREATE POLICY assinaturas_mp_update_scoped ON public.assinaturas_mercadopago
  FOR UPDATE TO authenticated
  USING (can_access_financial(auth.uid()) AND is_same_clinica(clinica_id))
  WITH CHECK (can_access_financial(auth.uid()) AND clinica_id = get_my_clinica_id());

-- Guias externas e seus tokens contêm dados de pacientes e credenciais de
-- acesso. O isolamento por clínica não basta: usuários financeiros ou apenas
-- clínicos não devem poder alterar/excluir esse fluxo operacional.
DROP POLICY IF EXISTS guias_externas_select ON public.guias_externas;
DROP POLICY IF EXISTS guias_externas_insert ON public.guias_externas;
DROP POLICY IF EXISTS guias_externas_update ON public.guias_externas;
DROP POLICY IF EXISTS guias_externas_delete ON public.guias_externas;
CREATE POLICY guias_externas_select_scoped ON public.guias_externas
  FOR SELECT TO authenticated
  USING ((can_manage_data(auth.uid()) OR is_enfermagem(auth.uid())) AND is_same_clinica(clinica_id));
CREATE POLICY guias_externas_insert_scoped ON public.guias_externas
  FOR INSERT TO authenticated
  WITH CHECK ((can_manage_data(auth.uid()) OR is_enfermagem(auth.uid())) AND clinica_id = get_my_clinica_id());
CREATE POLICY guias_externas_update_scoped ON public.guias_externas
  FOR UPDATE TO authenticated
  USING ((can_manage_data(auth.uid()) OR is_enfermagem(auth.uid())) AND is_same_clinica(clinica_id))
  WITH CHECK ((can_manage_data(auth.uid()) OR is_enfermagem(auth.uid())) AND clinica_id = get_my_clinica_id());
CREATE POLICY guias_externas_delete_scoped ON public.guias_externas
  FOR DELETE TO authenticated
  USING (is_admin(auth.uid()) AND is_same_clinica(clinica_id));

DROP POLICY IF EXISTS portal_tokens_select ON public.portal_guias_tokens;
DROP POLICY IF EXISTS portal_tokens_insert ON public.portal_guias_tokens;
DROP POLICY IF EXISTS portal_tokens_update ON public.portal_guias_tokens;
DROP POLICY IF EXISTS portal_tokens_delete ON public.portal_guias_tokens;
CREATE POLICY portal_guias_tokens_select_scoped ON public.portal_guias_tokens
  FOR SELECT TO authenticated
  USING ((can_manage_data(auth.uid()) OR is_enfermagem(auth.uid())) AND is_same_clinica(clinica_id));
CREATE POLICY portal_guias_tokens_insert_scoped ON public.portal_guias_tokens
  FOR INSERT TO authenticated
  WITH CHECK ((can_manage_data(auth.uid()) OR is_enfermagem(auth.uid())) AND clinica_id = get_my_clinica_id());
CREATE POLICY portal_guias_tokens_update_scoped ON public.portal_guias_tokens
  FOR UPDATE TO authenticated
  USING ((can_manage_data(auth.uid()) OR is_enfermagem(auth.uid())) AND is_same_clinica(clinica_id))
  WITH CHECK ((can_manage_data(auth.uid()) OR is_enfermagem(auth.uid())) AND clinica_id = get_my_clinica_id());
CREATE POLICY portal_guias_tokens_delete_scoped ON public.portal_guias_tokens
  FOR DELETE TO authenticated
  USING (is_admin(auth.uid()) AND is_same_clinica(clinica_id));
