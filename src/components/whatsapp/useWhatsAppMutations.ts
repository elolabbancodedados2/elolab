 import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
 import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { WhatsAppAgent, NewAgentForm } from './types';

export function useWhatsAppMutations() {
  const queryClient = useQueryClient();

     const { profile } = useSupabaseAuth();

   const createAgent = useMutation({
     mutationFn: async (agent: NewAgentForm) => {
       if (!profile?.clinica_id) throw new Error('Clínica não identificada. Recarregue a página e tente novamente.');
       const insertData = { ...agent, clinica_id: profile?.clinica_id };
       const { data, error } = await supabase
         .from('whatsapp_agents')
         .insert([insertData])
         .select()
         .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-agents'] });
      toast.success('Agente criado com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao criar agente: ' + error.message);
    },
  });

  const updateAgent = useMutation({
    mutationFn: async (agent: Partial<WhatsAppAgent> & { id: string }) => {
      const { id, ...updates } = agent;
      const { error } = await supabase
        .from('whatsapp_agents')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-agents'] });
      toast.success('Agente atualizado!');
    },
  });

  const deleteAgent = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('whatsapp_agents')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-agents'] });
      toast.success('Agente excluído!');
    },
  });

  const createSession = useMutation({
    mutationFn: async (instanceName: string) => {
      const { data, error } = await supabase.functions.invoke('whatsapp-evolution', {
        body: { action: 'create_instance', instance_name: instanceName },
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-sessions'] });
      toast.success('Sessão criada! Escaneie o QR Code.');
    },
    onError: (error) => {
      toast.error('Erro ao criar sessão: ' + error.message);
    },
  });

  const refreshQR = useMutation({
    mutationFn: async ({ sessionId, instanceName }: { sessionId: string; instanceName: string }) => {
      const { data, error } = await supabase.functions.invoke('whatsapp-evolution', {
        body: { action: 'get_qr_code', instance_name: instanceName },
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-sessions'] });
      toast.success('QR Code atualizado!');
    },
  });

  const checkStatus = useMutation({
    mutationFn: async (sessionId: string) => {
      const { data, error } = await supabase.functions.invoke('whatsapp-evolution', {
        body: { action: 'check_status', session_id: sessionId },
      });
      if (error) throw error;
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-sessions'] });
    },
  });

  const deleteSession = useMutation({
    mutationFn: async (sessionId: string) => {
      const { data, error } = await supabase.functions.invoke('whatsapp-evolution', {
        body: { action: 'delete_instance', session_id: sessionId },
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-sessions'] });
      toast.success('Sessão removida!');
    },
  });

  const linkAgentToSession = useMutation({
    mutationFn: async ({ sessionId, agentId }: { sessionId: string; agentId: string | null }) => {
      const { error } = await supabase
        .from('whatsapp_sessions')
        .update({ agent_id: agentId })
        .eq('id', sessionId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-sessions'] });
      toast.success('Agente vinculado!');
    },
  });

  const updateConversationStatus = useMutation({
    mutationFn: async ({ conversationId, status }: { conversationId: string; status: string }) => {
      if (!profile?.clinica_id) throw new Error('Clínica não identificada.');
      const { error } = await supabase
        .from('whatsapp_conversations')
        .update({ status })
        .eq('id', conversationId)
        .eq('clinica_id', profile.clinica_id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-conversations'] });
      toast.success('Responsável pelo atendimento atualizado.');
    },
    onError: (error) => toast.error('Não foi possível atualizar a conversa: ' + error.message),
  });

  const sendHumanMessage = useMutation({
    mutationFn: async ({ conversationId, sessionId, to, message }: { conversationId: string; sessionId: string; to: string; message: string }) => {
      const cleanMessage = message.trim();
      if (!cleanMessage) throw new Error('Digite uma mensagem.');
      if (cleanMessage.length > 4000) throw new Error('A mensagem deve ter no máximo 4.000 caracteres.');
      const { data, error } = await supabase.functions.invoke('whatsapp-evolution', {
        body: { action: 'send_message', conversation_id: conversationId, session_id: sessionId, to, message: cleanMessage },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Falha ao enviar mensagem.');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-messages'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-conversations'], exact: false });
      toast.success('Mensagem enviada pelo WhatsApp.');
    },
    onError: (error) => toast.error('Não foi possível enviar: ' + error.message),
  });

  return {
    createAgent,
    updateAgent,
    deleteAgent,
    createSession,
    refreshQR,
    checkStatus,
    deleteSession,
    linkAgentToSession,
    updateConversationStatus,
    sendHumanMessage,
  };
}
