BEGIN;

-- /agente-ia is an administrator-only area. Tenant membership alone must not
-- expose patient conversations or allow staff to change the clinic's agents.
DO $$
DECLARE
  item record;
BEGIN
  FOR item IN
    SELECT * FROM (VALUES
      ('whatsapp_conversations'::text, 'whatsapp_conversations_select_scoped'::text),
      ('whatsapp_conversations', 'whatsapp_conversations_insert_scoped'),
      ('whatsapp_conversations', 'whatsapp_conversations_update_scoped'),
      ('whatsapp_conversations', 'whatsapp_conversations_delete_scoped'),
      ('whatsapp_messages', 'whatsapp_messages_select_scoped'),
      ('whatsapp_messages', 'whatsapp_messages_insert_scoped'),
      ('whatsapp_messages', 'whatsapp_messages_update_scoped'),
      ('whatsapp_messages', 'whatsapp_messages_delete_scoped'),
      ('whatsapp_agents', 'whatsapp_agents_select_scoped'),
      ('whatsapp_agents', 'whatsapp_agents_insert_scoped'),
      ('whatsapp_agents', 'whatsapp_agents_update_scoped'),
      ('whatsapp_agents', 'whatsapp_agents_delete_scoped'),
      ('whatsapp_sessions', 'whatsapp_sessions_select_scoped'),
      ('whatsapp_sessions', 'whatsapp_sessions_insert_scoped'),
      ('whatsapp_sessions', 'whatsapp_sessions_update_scoped'),
      ('whatsapp_sessions', 'whatsapp_sessions_delete_scoped'),
      ('whatsapp_agent_actions', 'whatsapp_agent_actions_select_scoped'),
      ('whatsapp_agent_actions', 'whatsapp_agent_actions_insert_scoped'),
      ('whatsapp_agent_actions', 'whatsapp_agent_actions_update_scoped'),
      ('whatsapp_agent_actions', 'whatsapp_agent_actions_delete_scoped'),
      ('whatsapp_notas_internas', 'whatsapp_notas_select_scoped'),
      ('whatsapp_notas_internas', 'whatsapp_notas_insert_scoped'),
      ('whatsapp_notas_internas', 'whatsapp_notas_delete_own')
    ) AS policies(table_name, policy_name)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', item.policy_name, item.table_name);
  END LOOP;
END;
$$;

CREATE POLICY whatsapp_conversations_admin_select ON public.whatsapp_conversations
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id());
CREATE POLICY whatsapp_conversations_admin_insert ON public.whatsapp_conversations
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id());
CREATE POLICY whatsapp_conversations_admin_update ON public.whatsapp_conversations
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id())
  WITH CHECK (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id());
CREATE POLICY whatsapp_conversations_admin_delete ON public.whatsapp_conversations
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id());

CREATE POLICY whatsapp_messages_admin_select ON public.whatsapp_messages
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id());
CREATE POLICY whatsapp_messages_admin_insert ON public.whatsapp_messages
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id());
CREATE POLICY whatsapp_messages_admin_update ON public.whatsapp_messages
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id())
  WITH CHECK (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id());
CREATE POLICY whatsapp_messages_admin_delete ON public.whatsapp_messages
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id());

CREATE POLICY whatsapp_agents_admin_select ON public.whatsapp_agents
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id());
CREATE POLICY whatsapp_agents_admin_insert ON public.whatsapp_agents
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id());
CREATE POLICY whatsapp_agents_admin_update ON public.whatsapp_agents
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id())
  WITH CHECK (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id());
CREATE POLICY whatsapp_agents_admin_delete ON public.whatsapp_agents
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id());

CREATE POLICY whatsapp_sessions_admin_select ON public.whatsapp_sessions
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id());
CREATE POLICY whatsapp_sessions_admin_insert ON public.whatsapp_sessions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id());
CREATE POLICY whatsapp_sessions_admin_update ON public.whatsapp_sessions
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id())
  WITH CHECK (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id());
CREATE POLICY whatsapp_sessions_admin_delete ON public.whatsapp_sessions
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id());

CREATE POLICY whatsapp_agent_actions_admin_select ON public.whatsapp_agent_actions
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id());
CREATE POLICY whatsapp_agent_actions_admin_insert ON public.whatsapp_agent_actions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id());
CREATE POLICY whatsapp_agent_actions_admin_update ON public.whatsapp_agent_actions
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id())
  WITH CHECK (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id());
CREATE POLICY whatsapp_agent_actions_admin_delete ON public.whatsapp_agent_actions
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id());

CREATE POLICY whatsapp_notas_admin_select ON public.whatsapp_notas_internas
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id()
    AND EXISTS (SELECT 1 FROM public.whatsapp_conversations c
      WHERE c.id = conversation_id AND c.clinica_id = public.get_my_clinica_id()));
CREATE POLICY whatsapp_notas_admin_insert ON public.whatsapp_notas_internas
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id()
    AND autor_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.whatsapp_conversations c
      WHERE c.id = conversation_id AND c.clinica_id = public.get_my_clinica_id()));
CREATE POLICY whatsapp_notas_admin_delete ON public.whatsapp_notas_internas
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()) AND clinica_id = public.get_my_clinica_id()
    AND autor_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.whatsapp_conversations c
      WHERE c.id = conversation_id AND c.clinica_id = public.get_my_clinica_id()));

COMMIT;
