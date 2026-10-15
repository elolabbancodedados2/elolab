import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { WhatsAppAgent, WhatsAppSession, WhatsAppConversation, WhatsAppInternalNote, WhatsAppMessage, WhatsAppStats } from './types';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';

export function useWhatsAppAgents(allowed = true) {
  const { profile } = useSupabaseAuth();
  return useQuery({
    queryKey: ['whatsapp-agents', profile?.clinica_id, profile?.id],
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
    enabled: allowed && !!profile?.clinica_id,
  });
}

export function useWhatsAppSessions(allowed = true) {
  const { profile } = useSupabaseAuth();
  return useQuery({
    queryKey: ['whatsapp-sessions', profile?.clinica_id, profile?.id],
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
    enabled: allowed && !!profile?.clinica_id,
    refetchInterval: allowed ? 5_000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

export function useWhatsAppConversations(allowed = true) {
  const { profile } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const clinicId = profile?.clinica_id;
  const profileId = profile?.id;
  const queryKey = ['whatsapp-conversations', clinicId, profileId] as const;

  useEffect(() => {
    if (!allowed || !clinicId) return;

    const channel = supabase
      .channel(`whatsapp-conversations:${clinicId}:${profileId || 'session'}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'whatsapp_conversations',
        filter: `clinica_id=eq.${clinicId}`,
      }, () => {
        void queryClient.invalidateQueries({ queryKey: ['whatsapp-conversations', clinicId, profileId] });
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [allowed, clinicId, profileId, queryClient]);

  const query = useInfiniteQuery({
    queryKey,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      if (!clinicId) return [] as WhatsAppConversation[];
      const { data, error } = await supabase
        .from('whatsapp_conversations')
        .select('*, pacientes(nome), profiles!whatsapp_conversations_responsavel_id_fkey(nome)')
        .eq('clinica_id', clinicId)
        .order('ultima_mensagem_at', { ascending: false })
        .order('id', { ascending: false })
        .range(pageParam, pageParam + 49);
      if (error) throw error;
      return data as WhatsAppConversation[];
    },
    getNextPageParam: (lastPage, allPages) => lastPage.length === 50 ? allPages.length * 50 : undefined,
    enabled: allowed && !!clinicId,
    // Realtime acelera a atualização; polling mantém a fila confiável quando
    // a conexão do canal cai ou a tabela não está disponível na publicação.
    refetchInterval: allowed && clinicId ? 15_000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
  return { ...query, data: query.data?.pages.flat() ?? [] };
}

export function useWhatsAppInternalNotes(conversationId: string | null) {
  const { profile } = useSupabaseAuth();
  return useQuery({
    queryKey: ['whatsapp-internal-notes', profile?.clinica_id, profile?.id, conversationId],
    queryFn: async () => {
      if (!profile?.clinica_id || !conversationId) return [] as WhatsAppInternalNote[];
      const { data, error } = await (supabase as any)
        .from('whatsapp_notas_internas')
        .select('id, conteudo, created_at, autor_id, profiles!whatsapp_notas_internas_autor_id_fkey(nome)')
        .eq('clinica_id', profile.clinica_id)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as WhatsAppInternalNote[];
    },
    enabled: !!profile?.clinica_id && !!conversationId,
  });
}

export function useWhatsAppMessages(conversationId: string | null) {
  const { profile } = useSupabaseAuth();
  const [historyEnabled, setHistoryEnabled] = useState(false);
  useEffect(() => setHistoryEnabled(false), [conversationId]);

  const latestQuery = useQuery({
    queryKey: ['whatsapp-messages', profile?.clinica_id, profile?.id, conversationId],
    queryFn: async () => {
      if (!profile?.clinica_id || !conversationId) return [] as WhatsAppMessage[];
      const { data, error } = await supabase
        .from('whatsapp_messages')
        .select('id, direcao, conteudo, status, created_at, metadata')
        .eq('clinica_id', profile.clinica_id)
        .eq('conversation_id', conversationId)
        // Buscar as mais recentes; depois inverter para manter a ordem visual cronológica.
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []).reverse() as WhatsAppMessage[];
    },
    enabled: !!profile?.clinica_id && !!conversationId,
    refetchInterval: conversationId ? 3000 : false,
  });

  const latestMessages = latestQuery.data ?? [];
  const oldestLatest = latestMessages[0];
  const historyQuery = useInfiniteQuery({
    queryKey: ['whatsapp-message-history', profile?.clinica_id, profile?.id, conversationId],
    initialPageParam: oldestLatest ? { created_at: oldestLatest.created_at, id: oldestLatest.id } : null as { created_at: string; id: string } | null,
    queryFn: async ({ pageParam }) => {
      if (!profile?.clinica_id || !conversationId || !pageParam) return { messages: [] as WhatsAppMessage[], nextCursor: null as { created_at: string; id: string } | null };
      const cursor = pageParam as { created_at: string; id: string };
      const { data, error } = await supabase
        .from('whatsapp_messages')
        .select('id, direcao, conteudo, status, created_at, metadata')
        .eq('clinica_id', profile.clinica_id)
        .eq('conversation_id', conversationId)
        .or(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(200);
      if (error) throw error;
      const rows = (data || []) as WhatsAppMessage[];
      const oldest = rows.at(-1);
      return {
        messages: rows.reverse(),
        nextCursor: rows.length === 200 && oldest ? { created_at: oldest.created_at, id: oldest.id } : null,
      };
    },
    getNextPageParam: lastPage => lastPage.nextCursor ?? undefined,
    enabled: historyEnabled && !!profile?.clinica_id && !!conversationId && !!oldestLatest,
  });

  const olderMessages = historyQuery.data?.pages.flatMap(page => page.messages).reverse() ?? [];
  const hasOlderMessages = latestMessages.length === 200 && (historyQuery.data ? historyQuery.hasNextPage : true);
  const loadOlderMessages = () => {
    if (!historyQuery.data) setHistoryEnabled(true);
    else if (historyQuery.hasNextPage && !historyQuery.isFetchingNextPage) void historyQuery.fetchNextPage();
  };

  return {
    ...latestQuery,
    data: [...olderMessages, ...latestMessages],
    latestError: latestQuery.error,
    historyError: historyEnabled ? historyQuery.error : null,
    error: latestQuery.error || (historyEnabled ? historyQuery.error : null),
    isError: latestQuery.isError || (historyEnabled && historyQuery.isError),
    hasOlderMessages: Boolean(hasOlderMessages),
    loadOlderMessages,
    isLoadingOlderMessages: historyQuery.isFetching,
  };
}

export function useWhatsAppStats(allowed = true) {
  const { profile } = useSupabaseAuth();
  return useQuery({
    queryKey: ['whatsapp-stats', profile?.clinica_id, profile?.id],
    queryFn: async (): Promise<WhatsAppStats> => {
      if (!profile?.clinica_id) return { messages: 0, conversations: 0, actions: 0, ai_bookings: 0, confirmed_today: 0, no_shows_today: 0, delivery_failures: 0 };
      const { data, error } = await (supabase as any).rpc('whatsapp_dashboard_stats');
      if (error) throw error;
      return data as WhatsAppStats;
    },
    enabled: allowed && !!profile?.clinica_id,
    refetchInterval: allowed && profile?.clinica_id ? 15_000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}
