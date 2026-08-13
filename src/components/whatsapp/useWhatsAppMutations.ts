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

  return {
    createAgent,
    updateAgent,
    deleteAgent,
    createSession,
    refreshQR,
    checkStatus,
    deleteSession,
    linkAgentToSession,
  };
}
