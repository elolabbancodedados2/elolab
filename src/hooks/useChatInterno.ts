import { useState, useCallback, useEffect, useRef } from 'react';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { canalUnico } from '@/lib/realtimeCanal';

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
  clinica_id?: string | null;
}

function adicionarMensagemEmOrdem(mensagens: ChatMensagem[], nova: ChatMensagem): ChatMensagem[] {
  if (mensagens.some(mensagem => mensagem.id === nova.id)) return mensagens;
  return [...mensagens, nova].sort((a, b) =>
    a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  );
}

export function useChatInterno() {
  const { user, profile } = useSupabaseAuth();
  const [usuarios, setUsuarios] = useState<ChatUsuario[]>([]);
  const [conversas, setConversas] = useState<ChatConversa[]>([]);
  const [mensagens, setMensagens] = useState<ChatMensagem[]>([]);
  const [conversaAtiva, setConversaAtiva] = useState<ChatConversa | null>(null);
  const [loading, setLoading] = useState(false);
  const [totalNaoLidas, setTotalNaoLidas] = useState(0);
  const [erroCarregamento, setErroCarregamento] = useState<Error | null>(null);
  const conversaAtivaRef = useRef<ChatConversa | null>(null);
  const usuariosRef = useRef<ChatUsuario[]>([]);
  const fetchMensagensRequestRef = useRef(0);

  // Keep refs in sync
  useEffect(() => { conversaAtivaRef.current = conversaAtiva; }, [conversaAtiva]);
  useEffect(() => { usuariosRef.current = usuarios; }, [usuarios]);

  // Fetch all users (profiles) in same clinic except current user
  const fetchUsuarios = useCallback(async () => {
    if (!user || !profile?.clinica_id) return;
    let query = supabase
      .from('profiles')
      .select('id, nome, email, avatar')
      .neq('id', user.id)
      .eq('ativo', true)
      .order('nome');

    query = query.eq('clinica_id', profile.clinica_id);

    const { data, error } = await query;
    if (error) {
      setErroCarregamento(error);
      return;
    }

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
    if (!user || !profile?.clinica_id) return;
    const { data, error } = await supabase
      .from('chat_conversations')
      .select('*')
      .or(`participante_1_id.eq.${user.id},participante_2_id.eq.${user.id}`)
      .eq('clinica_id', profile.clinica_id)
      .order('ultima_mensagem_em', { ascending: false });

    if (error) {
      setErroCarregamento(error);
      return;
    }
    const conversationIds = (data || []).map((conv: any) => conv.id);
    const unreadByConversation = new Map<string, { count: number; urgent: boolean }>();
    if (conversationIds.length) {
      const pageSize = 1000;
      for (let offset = 0; ; offset += pageSize) {
        const { data: unreadMessages, error: unreadError } = await supabase
          .from('chat_messages')
          .select('conversa_id, urgente')
          .in('conversa_id', conversationIds)
          .eq('clinica_id', profile!.clinica_id!)
          .eq('destinatario_id', user.id)
          .is('lida_em', null)
          .order('created_at', { ascending: true })
          .range(offset, offset + pageSize - 1);
        if (unreadError) {
          setErroCarregamento(unreadError);
          return;
        }
        for (const message of unreadMessages || []) {
          const current = unreadByConversation.get(message.conversa_id) || { count: 0, urgent: false };
          unreadByConversation.set(message.conversa_id, {
            count: current.count + 1,
            urgent: current.urgent || message.urgente,
          });
        }
        if (!unreadMessages || unreadMessages.length < pageSize) break;
      }
    }
    const enriched: ChatConversa[] = (data || []).map((conv: any) => {
      const outroId = conv.participante_1_id === user.id ? conv.participante_2_id : conv.participante_1_id;
      const unread = unreadByConversation.get(conv.id);
      return {
        id: conv.id,
        participante_1_id: conv.participante_1_id,
        participante_2_id: conv.participante_2_id,
        ultima_mensagem_em: conv.ultima_mensagem_em,
        preview: conv.preview,
        outro_usuario: usuariosRef.current.find(u => u.id === outroId),
        nao_lidas: unread?.count || 0,
        urgente_nao_lida: unread?.urgent || false,
      };
    });
    setConversas(enriched);
    setTotalNaoLidas(enriched.reduce((sum, c) => sum + c.nao_lidas, 0));
  }, [user, profile?.clinica_id]);

  // Fetch messages for a specific conversation
  const fetchMensagens = useCallback(async (conversaId: string) => {
    if (!user || !profile?.clinica_id) return;
    const requestId = ++fetchMensagensRequestRef.current;
    setLoading(true);
    // Evita exibir por um instante as mensagens da conversa anterior enquanto
    // a nova conversa carrega.
    setMensagens([]);
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('conversa_id', conversaId)
        .eq('clinica_id', profile.clinica_id)
        .order('created_at', { ascending: true });

      if (error) {
        if (requestId === fetchMensagensRequestRef.current) setErroCarregamento(error);
        return;
      }
      if (requestId !== fetchMensagensRequestRef.current) return;
      if (data) {
        setMensagens(data as ChatMensagem[]);
        const unread = data.filter((m: any) => m.destinatario_id === user.id && !m.lida_em);
        if (unread.length > 0 && requestId === fetchMensagensRequestRef.current) {
          const { error: markError } = await supabase
            .from('chat_messages')
            .update({ lida_em: new Date().toISOString() })
            .eq('conversa_id', conversaId)
            .eq('clinica_id', profile.clinica_id)
            .eq('destinatario_id', user.id)
            .is('lida_em', null);
          if (markError) toast.error('Mensagens carregadas, mas não foi possível marcar a leitura.');
          else void fetchConversas();
        }
      }
    } catch (error) {
      if (requestId === fetchMensagensRequestRef.current) {
        setErroCarregamento(error instanceof Error ? error : new Error('Falha ao carregar mensagens.'));
      }
    } finally {
      if (requestId === fetchMensagensRequestRef.current) setLoading(false);
    }
  }, [user, profile?.clinica_id, fetchConversas]);

  // Start or find existing conversation
  const iniciarConversa = useCallback(async (outroUserId: string): Promise<ChatConversa | null> => {
    if (!user || !profile?.clinica_id) return null;

    // Check for existing conversation (in either direction)
    const { data: existing, error: existingError } = await supabase
      .from('chat_conversations')
      .select('*')
      .or(
        `and(participante_1_id.eq.${user.id},participante_2_id.eq.${outroUserId}),and(participante_1_id.eq.${outroUserId},participante_2_id.eq.${user.id})`
      )
      .eq('clinica_id', profile.clinica_id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (existingError) {
      toast.error('Não foi possível localizar a conversa.', { description: existingError.message });
      return null;
    }

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
        clinica_id: profile.clinica_id,
      })
      .select()
      .maybeSingle();

    if (error || !newConv) {
      toast.error('Não foi possível iniciar a conversa.', { description: error?.message });
      return null;
    }

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
  const enviarMensagem = useCallback(async (texto: string, urgente = false): Promise<boolean> => {
    if (!user || !profile?.clinica_id || !conversaAtivaRef.current || !texto.trim()) return false;
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
        clinica_id: profile.clinica_id,
      })
      .select()
      .maybeSingle();

    if (error || !msg) {
      toast.error('Não foi possível enviar a mensagem.', { description: error?.message });
      return false;
    }

    // Update conversation preview
    const { error: previewError } = await supabase
      .from('chat_conversations')
      .update({
        ultima_mensagem_em: new Date().toISOString(),
        preview: texto.trim().slice(0, 100),
      })
      .eq('id', conv.id)
      .eq('clinica_id', profile.clinica_id);

    if (previewError) toast.warning('Mensagem enviada, mas a prévia da conversa não foi atualizada.');

    if (msg && conversaAtivaRef.current?.id === conv.id) {
      setMensagens(prev => adicionarMensagemEmOrdem(prev, msg as ChatMensagem));
    }
    fetchConversas();
    return true;
  }, [user, profile?.clinica_id, fetchConversas]);

  // Marcar todas mensagens de uma conversa como lidas
  const marcarComoLida = useCallback(async (conversaId: string) => {
    if (!user || !profile?.clinica_id) return;
    const { error } = await supabase
      .from('chat_messages')
      .update({ lida_em: new Date().toISOString() })
      .eq('conversa_id', conversaId)
      .eq('clinica_id', profile.clinica_id)
      .eq('destinatario_id', user.id)
      .is('lida_em', null);
    if (error) toast.error('Não foi possível marcar as mensagens como lidas.', { description: error.message });
    else void fetchConversas();
  }, [user, profile?.clinica_id, fetchConversas]);

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

    const channelName = canalUnico('chat-realtime');
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        (payload) => {
          const newMsg = payload.new as ChatMensagem;
          if (!profile?.clinica_id || newMsg.clinica_id !== profile.clinica_id) return;
          const activeConv = conversaAtivaRef.current;

          // If this message is for the active conversation, add it
          if (activeConv && newMsg.conversa_id === activeConv.id) {
            setMensagens(prev => adicionarMensagemEmOrdem(prev, newMsg));
            // Auto-mark as read if we're viewing
            if (newMsg.destinatario_id === user.id) {
              supabase
                .from('chat_messages')
                .update({ lida_em: new Date().toISOString() })
                .eq('id', newMsg.id)
                .eq('clinica_id', profile.clinica_id);
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
  }, [user, profile?.clinica_id, fetchConversas]);

  return {
    usuarios,
    conversas,
    mensagens,
    conversaAtiva,
    setConversaAtiva,
    loading,
    totalNaoLidas,
    erroCarregamento,
    recarregar: async () => {
      setErroCarregamento(null);
      await Promise.all([fetchUsuarios(), fetchConversas()]);
      if (conversaAtivaRef.current) await fetchMensagens(conversaAtivaRef.current.id);
    },
    fetchMensagens,
    iniciarConversa,
    enviarMensagem,
    marcarComoLida,
  };
}
