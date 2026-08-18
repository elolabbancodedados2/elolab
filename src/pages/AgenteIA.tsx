import { Bot, Smartphone, MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useWhatsAppAgents,
  useWhatsAppSessions,
  useWhatsAppConversations,
  useWhatsAppStats,
  useWhatsAppMutations,
} from '@/components/whatsapp';
import { StatsCards } from '@/components/whatsapp/StatsCards';
import { SessionsTab } from '@/components/whatsapp/SessionsTab';
import { AgentsTab } from '@/components/whatsapp/AgentsTab';
import { ConversationsTab } from '@/components/whatsapp/ConversationsTab';
import { FeatureGate } from '@/components/FeatureGate';
import { useUserPlan } from '@/hooks/useSubscriptionPlan';

export default function AgenteIA() {
  const { hasFeature, isLoading: planLoading } = useUserPlan();
  const { data: agents = [], isLoading: loadingAgents } = useWhatsAppAgents();
  const { data: sessions = [], isLoading: loadingSessions } = useWhatsAppSessions();
  const { data: conversations = [] } = useWhatsAppConversations();
  const { data: stats } = useWhatsAppStats();

  const {
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
  } = useWhatsAppMutations();

  if (planLoading) {
    return <div className="p-6 text-muted-foreground">Verificando plano...</div>;
  }

  return (
    <FeatureGate feature="agente_ia" hasAccess={hasFeature('agente_ia')} requiredPlan="EloLab Ultra">
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Bot className="h-8 w-8 text-primary" />
            Agente de IA - WhatsApp
          </h1>
          <p className="text-muted-foreground">
            Configure e gerencie o atendimento automatizado via WhatsApp
          </p>
        </div>
      </div>

      <StatsCards sessions={sessions} stats={stats} />

      <Tabs defaultValue="sessions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="sessions" className="flex items-center gap-2">
            <Smartphone className="h-4 w-4" />
            Sessões WhatsApp
          </TabsTrigger>
          <TabsTrigger value="agents" className="flex items-center gap-2">
            <Bot className="h-4 w-4" />
            Configurar Agentes
          </TabsTrigger>
          <TabsTrigger value="conversations" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Conversas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sessions">
          <SessionsTab
            sessions={sessions}
            agents={agents}
            isLoading={loadingSessions}
            onCreateSession={(name) => createSession.mutate(name)}
            onRefreshQR={(id, name) => refreshQR.mutate({ sessionId: id, instanceName: name })}
            onCheckStatus={(id) => checkStatus.mutate(id)}
            onDeleteSession={(id) => deleteSession.mutate(id)}
            onLinkAgent={(sessionId, agentId) => linkAgentToSession.mutate({ sessionId, agentId })}
            isCreating={createSession.isPending}
            isRefreshing={refreshQR.isPending}
            isChecking={checkStatus.isPending}
          />
        </TabsContent>

        <TabsContent value="agents">
          <AgentsTab
            agents={agents}
            isLoading={loadingAgents}
            onCreateAgent={(agent) => createAgent.mutate(agent)}
            onUpdateAgent={(agent) => updateAgent.mutate(agent)}
            onDeleteAgent={(id) => deleteAgent.mutate(id)}
            isCreating={createAgent.isPending}
          />
        </TabsContent>

        <TabsContent value="conversations">
          <ConversationsTab
            conversations={conversations}
            onStatusChange={(conversationId, status) => updateConversationStatus.mutate({ conversationId, status })}
            isUpdating={updateConversationStatus.isPending}
            onSendMessage={(conversation, message) => sendHumanMessage.mutateAsync({
              conversationId: conversation.id,
              sessionId: conversation.session_id,
              to: conversation.remote_jid,
              message,
            })}
            isSending={sendHumanMessage.isPending}
            onMarkRead={(conversationId) => markConversationRead.mutate(conversationId)}
            onAddInternalNote={(conversationId, content) => addInternalNote.mutateAsync({ conversationId, content })}
            isAddingNote={addInternalNote.isPending}
            onPriorityChange={(conversationId, priority) => updateConversationPriority.mutate({ conversationId, priority })}
            onGenerateSummary={(conversationId) => generateConversationSummary.mutate(conversationId)}
            isGeneratingSummary={generateConversationSummary.isPending}
          />
        </TabsContent>
      </Tabs>
    </div>
    </FeatureGate>
  );
}
