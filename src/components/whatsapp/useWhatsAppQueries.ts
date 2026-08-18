import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { WhatsAppAgent, WhatsAppSession, WhatsAppConversation, WhatsAppMessage, WhatsAppStats } from './types';
import { todayDateOnly } from '@/lib/dateOnly';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';

export function useWhatsAppAgents() {
  const { profile } = useSupabaseAuth();
  return useQuery({
    queryKey: ['whatsapp-agents', profile?.clinica_id],
    queryFn: async () => {
      if (!profile?.clinica_id) return [] as WhatsAppAgent[];
      const { data, error } = await supabase
        .from('whatsapp_agents')
        .select('*')
        .eq('clinica_id', profile.clinica_id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as WhatsAppAgent[];
    },
    enabled: !!profile?.clinica_id,
  });
}

export function useWhatsAppSessions() {
  const { profile } = useSupabaseAuth();
  return useQuery({
    queryKey: ['whatsapp-sessions', profile?.clinica_id],
    queryFn: async () => {
      if (!profile?.clinica_id) return [] as WhatsAppSession[];
      const { data, error } = await supabase
        .from('whatsapp_sessions')
        .select('*, whatsapp_agents(*)')
        .eq('clinica_id', profile.clinica_id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as WhatsAppSession[];
    },
    enabled: !!profile?.clinica_id,
  });
}

export function useWhatsAppConversations() {
  const { profile } = useSupabaseAuth();
  return useQuery({
    queryKey: ['whatsapp-conversations', profile?.clinica_id],
    queryFn: async () => {
      if (!profile?.clinica_id) return [] as WhatsAppConversation[];
      const { data, error } = await supabase
        .from('whatsapp_conversations')
        .select('*, pacientes(nome)')
        .eq('clinica_id', profile.clinica_id)
        .order('ultima_mensagem_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as WhatsAppConversation[];
    },
    enabled: !!profile?.clinica_id,
  });
}

export function useWhatsAppMessages(conversationId: string | null) {
  const { profile } = useSupabaseAuth();
  return useQuery({
    queryKey: ['whatsapp-messages', profile?.clinica_id, conversationId],
    queryFn: async () => {
      if (!profile?.clinica_id || !conversationId) return [] as WhatsAppMessage[];
      const { data, error } = await supabase
        .from('whatsapp_messages')
        .select('id, direcao, conteudo, status, created_at, metadata')
        .eq('clinica_id', profile.clinica_id)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(200);
      if (error) throw error;
      return data as WhatsAppMessage[];
    },
    enabled: !!profile?.clinica_id && !!conversationId,
    refetchInterval: conversationId ? 3000 : false,
  });
}

export function useWhatsAppStats() {
  const { profile } = useSupabaseAuth();
  return useQuery({
    queryKey: ['whatsapp-stats', profile?.clinica_id],
    queryFn: async (): Promise<WhatsAppStats> => {
      if (!profile?.clinica_id) return { messages: 0, conversations: 0, actions: 0 };
      const today = todayDateOnly();
      
      const { count: messagesCount } = await supabase
        .from('whatsapp_messages')
        .select('*', { count: 'exact', head: true })
        .eq('clinica_id', profile.clinica_id)
        .gte('created_at', today);

      const { count: conversationsCount } = await supabase
        .from('whatsapp_conversations')
        .select('*', { count: 'exact', head: true })
        .eq('clinica_id', profile.clinica_id)
        .gte('created_at', today);

      const { count: actionsCount } = await supabase
        .from('whatsapp_agent_actions')
        .select('*', { count: 'exact', head: true })
        .eq('clinica_id', profile.clinica_id)
        .gte('created_at', today);

      return {
        messages: messagesCount || 0,
        conversations: conversationsCount || 0,
        actions: actionsCount || 0,
      };
    },
    enabled: !!profile?.clinica_id,
  });
}
