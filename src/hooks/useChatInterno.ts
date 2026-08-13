import { useState, useCallback, useEffect, useRef } from 'react';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ChatUsuario {
  id: string;
  user_id: string;
  nome: string;
  email: string;
  avatar_url?: string | null;
  online?: boolean;
  roles?: string[];
}

export interface ChatConversa {
  id: string;
  participante_1_id: string;
  participante_2_id: string;
  ultima_mensagem_em: string | null;
  preview: string | null;
  outro_usuario?: ChatUsuario;
  nao_lidas: number;
  urgente_nao_lida: boolean;
}

export interface ChatMensagem {
  id: string;
  conversa_id: string;
  remetente_id: string;
  destinatario_id: string;
  texto: string;
  urgente: boolean;
  lida_em: string | null;
  created_at: string;
}

export function useChatInterno() {
  const { user, profile } = useSupabaseAuth();
  const [usuarios, setUsuarios] = useState<ChatUsuario[]>([]);
  const [conversas, setConversas] = useState<ChatConversa[]>([]);
  const [mensagens, setMensagens] = useState<ChatMensagem[]>([]);
  const [conversaAtiva, setConversaAtiva] = useState<ChatConversa | null>(null);
  const [loading, setLoading] = useState(false);
  const [totalNaoLidas, setTotalNaoLidas] = useState(0);
  const conversaAtivaRef = useRef<ChatConversa | null>(null);
  const usuariosRef = useRef<ChatUsuario[]>([]);

  // Keep refs in sync
  useEffect(() => { conversaAtivaRef.current = conversaAtiva; }, [conversaAtiva]);
  useEffect(() => { usuariosRef.current = usuarios; }, [usuarios]);

  // Fetch all users (profiles) in same clinic except current user
  const fetchUsuarios = useCallback(async () => {
    if (!user) return;
    let query = supabase
      .from('profiles')
      .select('id, nome, email, avatar')
      .neq('id', user.id)
      .eq('ativo', true)
      .order('nome');

    if (profile?.clinica_id) {
      query = query.eq('clinica_id', profile.clinica_id);
    }

    const { data } = await query;

    if (data) {
      const mapped = data.map(p => ({
        id: p.id,
        user_id: p.id,
        nome: p.nome,
        email: p.email,
        avatar_url: p.avatar,
      }));
      setUsuarios(mapped);
      usuariosRef.current = mapped;
    }
  }, [user, profile?.clinica_id]);

  // Fetch conversations for current user
  const fetchConversas = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('chat_conversations')
      .select('*')
      .or(`participante_1_id.eq.${user.id},participante_2_id.eq.${user.id}`)
      .order('ultima_mensagem_em', { ascending: false });

    if (!data) return;

    // Batch unread counts in parallel
    const enriched: ChatConversa[] = await Promise.all(
      data.map(async (conv: any) => {
        const outroId = conv.participante_1_id === user.id
          ? conv.participante_2_id
          : conv.participante_1_id;

        const [{ count }, { count: urgCount }] = await Promise.all([
          supabase
            .from('chat_messages')
            .select('*', { count: 'exact', head: true })
            .eq('conversa_id', conv.id)
            .eq('destinatario_id', user.id)
            .is('lida_em', null),
          supabase
            .from('chat_messages')
            .select('*', { count: 'exact', head: true })
            .eq('conversa_id', conv.id)
            .eq('destinatario_id', user.id)
            .eq('urgente', true)
            .is('lida_em', null),
        ]);

        const outroUsuario = usuariosRef.current.find(u => u.id === outroId);

        return {
          id: conv.id,
          participante_1_id: conv.participante_1_id,
          participante_2_id: conv.participante_2_id,
          ultima_mensagem_em: conv.ultima_mensagem_em,
          preview: conv.preview,
          outro_usuario: outroUsuario,
          nao_lidas: count || 0,
          urgente_nao_lida: (urgCount || 0) > 0,
        };
      })
    );
    setConversas(enriched);
    setTotalNaoLidas(enriched.reduce((sum, c) => sum + c.nao_lidas, 0));
  }, [user]);

  // Fetch messages for a specific conversation
  const fetchMensagens = useCallback(async (conversaId: string) => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('conversa_id', conversaId)
      .order('created_at', { ascending: true });

    if (data) {
      setMensagens(data as ChatMensagem[]);
      // Mark unread messages as read
      const unread = data.filter(
        (m: any) => m.destinatario_id === user.id && !m.lida_em
      );
      if (unread.length > 0) {
        await supabase
          .from('chat_messages')
          .update({ lida_em: new Date().toISOString() })
          .eq('conversa_id', conversaId)
          .eq('destinatario_id', user.id)
          .is('lida_em', null);
        // Refresh unread counts
        fetchConversas();
      }
    }
    setLoading(false);
  }, [user, fetchConversas]);

  // Start or find existing conversation
  const iniciarConversa = useCallback(async (outroUserId: string): Promise<ChatConversa | null> => {
    if (!user) return null;

    // Check for existing conversation (in either direction)
    const { data: existing } = await supabase
      .from('chat_conversations')
      .select('*')
      .or(
        `and(participante_1_id.eq.${user.id},participante_2_id.eq.${outroUserId}),and(participante_1_id.eq.${outroUserId},participante_2_id.eq.${user.id})`
      )
      .maybeSingle();

    if (existing) {
      const outroUsuario = usuariosRef.current.find(u => u.id === outroUserId);
      const conv: ChatConversa = {
        id: existing.id,
        participante_1_id: existing.participante_1_id,
        participante_2_id: existing.participante_2_id,
        ultima_mensagem_em: existing.ultima_mensagem_em,
        preview: existing.preview,
        outro_usuario: outroUsuario,
        nao_lidas: 0,
        urgente_nao_lida: false,
      };
      setConversaAtiva(conv);
      return conv;
    }

    // Create new conversation
    const { data: newConv, error } = await supabase
      .from('chat_conversations')
      .insert({
        participante_1_id: user.id,
        participante_2_id: outroUserId,
        clinica_id: profile?.clinica_id || null,
      })
      .select()
      .maybeSingle();

    if (error || !newConv) return null;

    const outroUsuario = usuariosRef.current.find(u => u.id === outroUserId);
    const conv: ChatConversa = {
      id: newConv.id,
      participante_1_id: newConv.participante_1_id,
      participante_2_id: newConv.participante_2_id,
      ultima_mensagem_em: null,
      preview: null,
      outro_usuario: outroUsuario,
      nao_lidas: 0,
      urgente_nao_lida: false,
    };
    setConversaAtiva(conv);
    fetchConversas();
    return conv;
  }, [user, profile?.clinica_id, fetchConversas]);

  // Send a message
  const enviarMensagem = useCallback(async (texto: string, urgente = false) => {
    if (!user || !conversaAtivaRef.current || !texto.trim()) return;
    const conv = conversaAtivaRef.current;

    const outroId = conv.participante_1_id === user.id
      ? conv.participante_2_id
      : conv.participante_1_id;

    const { data: msg, error } = await supabase
      .from('chat_messages')
      .insert({
        conversa_id: conv.id,
        remetente_id: user.id,
        destinatario_id: outroId,
        texto: texto.trim(),
        urgente,
        clinica_id: profile?.clinica_id || null,
      })
      .select()
      .maybeSingle();

    if (error || !msg) return;

    // Update conversation preview
    await supabase
      .from('chat_conversations')
      .update({
        ultima_mensagem_em: new Date().toISOString(),
        preview: texto.trim().slice(0, 100),
      })
      .eq('id', conv.id);

    if (msg) {
      setMensagens(prev => [...prev, msg as ChatMensagem]);
    }
    fetchConversas();
  }, [user, profile?.clinica_id, fetchConversas]);

  // Marcar todas mensagens de uma conversa como lidas
  const marcarComoLida = useCallback(async (conversaId: string) => {
    if (!user) return;
    await supabase
      .from('chat_messages')
      .update({ lida_em: new Date().toISOString() })
      .eq('conversa_id', conversaId)
      .eq('destinatario_id', user.id)
      .is('lida_em', null);
    fetchConversas();
  }, [user, fetchConversas]);

  // Initial data fetch
  useEffect(() => {
    fetchUsuarios();
  }, [fetchUsuarios]);

  useEffect(() => {
    if (usuarios.length > 0) fetchConversas();
  }, [usuarios, fetchConversas]);

  // Realtime subscription for new messages
  useEffect(() => {
    if (!user) return;

    const channelName = `chat-realtime-${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        (payload) => {
          const newMsg = payload.new as ChatMensagem;
          const activeConv = conversaAtivaRef.current;

          // If this message is for the active conversation, add it
          if (activeConv && newMsg.conversa_id === activeConv.id) {
            setMensagens(prev => {
              if (prev.find(m => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });
            // Auto-mark as read if we're viewing
            if (newMsg.destinatario_id === user.id) {
              supabase
                .from('chat_messages')
                .update({ lida_em: new Date().toISOString() })
                .eq('id', newMsg.id);
            }
          }

          // Show toast notification for incoming messages (not from self, not in active conversation)
          if (newMsg.destinatario_id === user.id) {
            const isActiveConv = activeConv && newMsg.conversa_id === activeConv.id;
            if (!isActiveConv) {
              const remetente = usuariosRef.current.find(u => u.id === newMsg.remetente_id);
              const nomeRemetente = remetente?.nome || 'Alguém';
              const previewTexto = newMsg.texto.length > 60
                ? newMsg.texto.substring(0, 60) + '...'
                : newMsg.texto;

              toast.info(`💬 ${nomeRemetente}`, {
                description: newMsg.urgente ? `🔴 URGENTE: ${previewTexto}` : previewTexto,
                duration: newMsg.urgente ? 10000 : 5000,
              });
            }
          }

          // Refresh conversations list
          fetchConversas();
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chat_messages' },
        () => {
          // Refresh on read receipts
          fetchConversas();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchConversas]);

  return {
    usuarios,
    conversas,
    mensagens,
    conversaAtiva,
    setConversaAtiva,
    loading,
    totalNaoLidas,
    fetchMensagens,
    iniciarConversa,
    enviarMensagem,
    marcarComoLida,
  };
}
