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
      if (!profile?.clinica_id) throw new Error('Clínica não identificada.');
      const { data, error } = await supabase
        .from('whatsapp_agents')
        .update(updates)
        .eq('id', id)
        .eq('clinica_id', profile.clinica_id)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Agente não encontrado nesta clínica.');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-agents'] });
      toast.success('Agente atualizado!');
    },
    onError: (error) => toast.error('Erro ao atualizar agente: ' + error.message),
  });

  const deleteAgent = useMutation({
    mutationFn: async (id: string) => {
      if (!profile?.clinica_id) throw new Error('Clínica não identificada.');
      const { data, error } = await supabase
        .from('whatsapp_agents')
        .delete()
        .eq('id', id)
        .eq('clinica_id', profile.clinica_id)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Agente não encontrado nesta clínica.');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-agents'] });
      toast.success('Agente excluído!');
    },
    onError: (error) => toast.error('Erro ao excluir agente: ' + error.message),
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
    onError: (error) => toast.error('Não foi possível atualizar o QR Code: ' + error.message),
  });

  const checkStatus = useMutation({
    mutationFn: async (sessionId: string) => {
      const { data, error } = await supabase.functions.invoke('whatsapp-evolution', {
        body: { action: 'check_status', session_id: sessionId },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'A verificação não foi concluída.');
      return data.data;
    },
    onSuccess: (status: { connected?: boolean; state?: string }) => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-sessions'] });
      if (status?.connected) {
        toast.success('WhatsApp conectado.');
      } else {
        toast.warning('WhatsApp desconectado.', {
          description: status?.state ? `Estado informado pelo provedor: ${status.state}.` : 'Conecte a sessão para voltar a enviar mensagens.',
        });
      }
    },
    onError: (error) => toast.error('Não foi possível verificar a sessão: ' + error.message),
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
    onError: (error) => toast.error('Não foi possível remover a sessão: ' + error.message),
  });

  const linkAgentToSession = useMutation({
    mutationFn: async ({ sessionId, agentId }: { sessionId: string; agentId: string | null }) => {
      if (!profile?.clinica_id) throw new Error('Clínica não identificada.');
      const { data, error } = await supabase
        .from('whatsapp_sessions')
        .update({ agent_id: agentId })
        .eq('id', sessionId)
        .eq('clinica_id', profile.clinica_id)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Sessão não encontrada nesta clínica.');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-sessions'] });
      toast.success('Agente vinculado!');
    },
    onError: (error) => toast.error('Não foi possível vincular o agente: ' + error.message),
  });

  const updateConversationStatus = useMutation({
    mutationFn: async ({ conversationId, status }: { conversationId: string; status: string }) => {
      if (!profile?.clinica_id) throw new Error('Clínica não identificada.');
      const rpcName = status === 'em_atendimento_humano'
        ? 'assumir_conversa_whatsapp'
        : 'alterar_status_conversa_whatsapp';
      const params = status === 'em_atendimento_humano'
        ? { _conversation_id: conversationId }
        : { _conversation_id: conversationId, _status: status };
      const { error } = await (supabase as any).rpc(rpcName, params);
      if (error) throw error;
    },
    onSuccess: (_data, { status }) => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-conversations'] });
      toast.success(
        status === 'em_atendimento_humano'
          ? 'Conversa assumida para atendimento.'
          : status === 'ativo'
            ? 'Conversa devolvida para a IA.'
            : 'Conversa encerrada.',
      );
    },
    onError: (error) => toast.error('Não foi possível atualizar a conversa: ' + error.message),
  });

  const markConversationRead = useMutation({
    mutationFn: async (conversationId: string) => {
      const { error } = await (supabase as any).rpc('marcar_whatsapp_como_lida', { _conversation_id: conversationId });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['whatsapp-conversations'], exact: false }),
  });

  const addInternalNote = useMutation({
    mutationFn: async ({ conversationId, content }: { conversationId: string; content: string }) => {
      if (!profile?.clinica_id || !profile.id) throw new Error('Usuário ou clínica não identificados.');
      const cleanContent = content.trim();
      if (!cleanContent || cleanContent.length > 2000) throw new Error('A nota deve ter entre 1 e 2.000 caracteres.');
      const { error } = await (supabase as any).from('whatsapp_notas_internas').insert({
        conversation_id: conversationId,
        clinica_id: profile.clinica_id,
        autor_id: profile.id,
        conteudo: cleanContent,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-internal-notes'], exact: false });
      toast.success('Nota interna adicionada.');
    },
    onError: (error) => toast.error('Não foi possível salvar a nota: ' + error.message),
  });

  const updateConversationPriority = useMutation({
    mutationFn: async ({ conversationId, priority }: { conversationId: string; priority: string }) => {
      if (!profile?.clinica_id) throw new Error('Clínica não identificada.');
      const { data, error } = await supabase.from('whatsapp_conversations')
        .update({ prioridade: priority })
        .eq('id', conversationId)
        .eq('clinica_id', profile.clinica_id)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Conversa não encontrada nesta clínica.');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['whatsapp-conversations'], exact: false }),
    onError: (error) => toast.error('Não foi possível alterar a prioridade: ' + error.message),
  });

  const generateConversationSummary = useMutation({
    mutationFn: async (conversationId: string) => {
      const { data, error } = await supabase.functions.invoke('whatsapp-evolution', {
        body: { action: 'generate_summary', conversation_id: conversationId },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Não foi possível gerar o resumo.');
      return data.data?.summary as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-conversations'], exact: false });
      toast.success('Resumo atualizado.');
    },
    onError: (error) => toast.error('Falha ao resumir a conversa: ' + error.message),
  });

  const sendHumanMedia = useMutation({
    mutationFn: async ({ conversationId, sessionId, to, file }: { conversationId: string; sessionId: string; to: string; file: File }) => {
      if (file.size > 8 * 1024 * 1024) throw new Error('O arquivo deve ter no máximo 8 MB.');
      const allowed = ['image/jpeg', 'image/png', 'image/webp', 'audio/mpeg', 'audio/ogg', 'audio/mp4', 'application/pdf'];
      if (!allowed.includes(file.type)) throw new Error('Envie JPG, PNG, WebP, MP3, OGG, M4A ou PDF.');
      const mediaBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
        reader.readAsDataURL(file);
      });
      const { data, error } = await supabase.functions.invoke('whatsapp-evolution', {
        body: { action: 'send_media', conversation_id: conversationId, session_id: sessionId, to, media_base64: mediaBase64, mime_type: file.type, file_name: file.name },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Falha ao enviar anexo.');
      return data.data as { sent?: boolean; historyRecorded?: boolean; conversationUpdated?: boolean };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-messages'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-conversations'], exact: false });
      if (result?.historyRecorded && result?.conversationUpdated) {
        toast.success('Anexo enviado pelo WhatsApp.');
      } else {
        toast.warning('O WhatsApp aceitou o anexo, mas o histórico ficou incompleto.', {
          description: 'Não envie novamente. Atualize a conversa e confira se o anexo aparece no histórico.',
          duration: 10000,
        });
      }
    },
    onError: (error) => toast.error('Não foi possível enviar o anexo: ' + error.message),
  });

  const requestSatisfaction = useMutation({
    mutationFn: async ({ conversationId, sessionId, to }: { conversationId: string; sessionId: string; to: string }) => {
      const { data, error } = await supabase.functions.invoke('whatsapp-evolution', {
        body: { action: 'request_satisfaction', conversation_id: conversationId, session_id: sessionId, to },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Falha ao encerrar atendimento.');
      return data.data as { sent?: boolean; historyRecorded?: boolean; conversationClosed?: boolean };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-conversations'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-messages'], exact: false });
      if (result?.historyRecorded && result?.conversationClosed) {
        toast.success('Atendimento encerrado e avaliação solicitada.');
      } else {
        toast.warning('A solicitação de avaliação foi enviada, mas o encerramento ficou incompleto.', {
          description: 'Não solicite a avaliação novamente. Atualize a conversa e confira o status.',
          duration: 10000,
        });
      }
    },
    onError: (error) => toast.error('Não foi possível encerrar: ' + error.message),
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
      return data.data as { sent?: boolean; historyRecorded?: boolean; conversationUpdated?: boolean };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-messages'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-conversations'], exact: false });
      if (result?.historyRecorded && result?.conversationUpdated) {
        toast.success('Mensagem enviada pelo WhatsApp.');
      } else {
        toast.warning('O WhatsApp aceitou a mensagem, mas o histórico ficou incompleto.', {
          description: 'Não envie novamente. Atualize a conversa e confira se a mensagem aparece no histórico.',
          duration: 10000,
        });
      }
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
    markConversationRead,
    addInternalNote,
    updateConversationPriority,
    generateConversationSummary,
    sendHumanMedia,
    requestSatisfaction,
  };
}
