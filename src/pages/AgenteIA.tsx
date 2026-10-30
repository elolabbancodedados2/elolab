import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bot, Smartphone, MessageSquare, RefreshCw, Users, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { NewWhatsAppSessionPage } from '@/components/whatsapp/NewWhatsAppSessionPage';
import { FeatureGate } from '@/components/FeatureGate';
import { useUserPlan } from '@/hooks/useSubscriptionPlan';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { PageSkeleton } from '@/components/ui/loading-skeleton';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { cn } from '@/lib/utils';

export default function AgenteIA() {
  const [activeTab, setActiveTab] = useState('sessions');
  const location = useLocation();
  const navigate = useNavigate();
  const isSessionCreatePage = location.pathname === '/agente-ia/sessoes/nova';
  const focusId = (location.state as { focusId?: unknown } | null)?.focusId;
  const { profile } = useSupabaseAuth();
  const { hasFeature, isLoading: planLoading, isError: planError, error: planQueryError, refetch: refetchPlan } = useUserPlan();
  const acessoLiberado = !planLoading && hasFeature('agente_ia');
  const agentsQuery = useWhatsAppAgents(acessoLiberado);
  const sessionsQuery = useWhatsAppSessions(acessoLiberado);
  const conversationsQuery = useWhatsAppConversations(acessoLiberado);
  const statsQuery = useWhatsAppStats(acessoLiberado);
  const agents = agentsQuery.data || [];
  const sessions = sessionsQuery.data || [];
  const conversations = conversationsQuery.data || [];
  const stats = statsQuery.data;
  const queries = [agentsQuery, sessionsQuery, conversationsQuery, statsQuery];

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
    sendHumanMedia,
    requestSatisfaction,
  } = useWhatsAppMutations();

  useEffect(() => {
    if (typeof focusId !== 'string') return;
    const timeout = window.setTimeout(() => {
      document.getElementById(focusId)?.focus();
      navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [focusId, location.pathname, location.search, navigate]);

  if (planLoading) {
    return <PageSkeleton />;
  }

  if (planError) {
    return <ErrorState title="Não foi possível confirmar o acesso ao Agente IA" description="Atualize a assinatura antes de continuar. Nenhuma ação de contratação ou alteração será iniciada enquanto o plano não for confirmado." error={planQueryError} onRetry={() => void refetchPlan()} />;
  }

  if (!profile?.clinica_id) {
    return <ErrorState title="Clínica não identificada" description="Vincule seu usuário a uma clínica para carregar as sessões, os agentes e as conversas." />;
  }

  if (queries.some(query => query.isLoading)) {
    return <div role="status" aria-label="Carregando sessões, agentes e conversas"><PageSkeleton /></div>;
  }

  const failedQuery = queries.find(query => query.isError);
  if (failedQuery) {
    return <ErrorState title="Não foi possível carregar o painel de WhatsApp" error={failedQuery.error} onRetry={() => { for (const query of queries) void query.refetch(); }} />;
  }

  const sessoesConectadas = sessions.filter(s => s.status === 'connected').length;
  const aguardandoHumano = conversations.filter(c => c.status === 'aguardando_humano').length;
  const conversasAtivas = conversations.filter(c => c.status === 'ativo').length;
  const agentesConfigurados = agents.length;

  const indicadores = [
    { key: 'conversations', label: 'Aguardando atendimento', value: aguardandoHumano, icon: Clock, escuro: true, color: '', bg: '' },
    { key: 'sessions', label: 'Sessões conectadas', value: sessoesConectadas, icon: Smartphone, escuro: false, color: 'text-[#1080CA]', bg: 'bg-[#1080CA]/10' },
    { key: 'conversations', label: 'Conversas ativas', value: conversasAtivas, icon: MessageSquare, escuro: false, color: 'text-success', bg: 'bg-success/10' },
    { key: 'agents', label: 'Agentes configurados', value: agentesConfigurados, icon: Users, escuro: false, color: 'text-muted-foreground', bg: 'bg-muted' },
  ];

  return (
    <FeatureGate feature="agente_ia" hasAccess={hasFeature('agente_ia')} requiredPlan="EloLab Ultra">
    {isSessionCreatePage ? (
      <NewWhatsAppSessionPage
        isCreating={createSession.isPending}
        onCreate={async (instanceName) => {
          await createSession.mutateAsync(instanceName);
          await sessionsQuery.refetch();
        }}
      />
    ) : <div className="space-y-6">
      <PageHeader
        title="Agente de IA - WhatsApp"
        description={`${sessoesConectadas} sessão(ões) conectada(s) · ${aguardandoHumano} conversa(s) aguardando atendimento humano`}
        icon={<Bot />}
        actions={(
          <>
            <Button
              variant="outline"
              size="icon"
              className="shrink-0 rounded-full"
              disabled={queries.some(query => query.isFetching)}
              onClick={() => { for (const query of queries) void query.refetch(); }}
              aria-label="Atualizar painel de WhatsApp"
              title="Atualizar painel de WhatsApp"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              className="rounded-full gap-2 bg-gradient-primary text-white shadow-md hover:brightness-110"
              onClick={() => setActiveTab('conversations')}
            >
              <MessageSquare className="h-4 w-4" /> Ver conversas
            </Button>
          </>
        )}
      />

      {/* ─── Indicator strip ─── */}
      <section aria-label="Indicadores do atendimento por WhatsApp">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {indicadores.map((indicator, index) => {
            const isActive = activeTab === indicator.key;
            const Icon = indicator.icon;
            return (
              <button
                key={`${indicator.key}-${index}`}
                type="button"
                aria-pressed={isActive}
                onClick={() => setActiveTab(indicator.key)}
                className={cn(
                  'rounded-2xl border border-border/60 bg-card p-3 text-left shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1080CA] focus-visible:ring-offset-2',
                  indicator.escuro && 'border-transparent bg-gradient-primary text-white',
                  !indicator.escuro && isActive && 'ring-2 ring-[#1080CA]',
                  indicator.escuro && isActive && 'ring-2 ring-[#1080CA]',
                )}
              >
                <div className="flex items-center gap-3">
                  <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', indicator.escuro ? 'bg-white/15' : indicator.bg)}>
                    <Icon className={cn('h-5 w-5', indicator.escuro ? 'text-white' : indicator.color)} />
                  </div>
                  <div>
                    <p className={cn('text-2xl font-bold tabular-nums', indicator.escuro ? 'text-white' : indicator.color)}>{indicator.value}</p>
                    <p className={cn('text-[11px]', indicator.escuro ? 'text-white/70' : 'text-muted-foreground')}>{indicator.label}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <StatsCards sessions={sessions} stats={stats} />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-2xl border border-border bg-muted/60 p-1.5 text-muted-foreground">
          <TabsTrigger value="sessions" className="min-h-11 gap-2 rounded-xl">
            <Smartphone className="h-4 w-4" />
            Sessões WhatsApp
          </TabsTrigger>
          <TabsTrigger value="agents" className="min-h-11 gap-2 rounded-xl">
            <Bot className="h-4 w-4" />
            Configurar Agentes
          </TabsTrigger>
          <TabsTrigger value="conversations" className="min-h-11 gap-2 rounded-xl">
            <MessageSquare className="h-4 w-4" />
            Conversas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sessions">
          <SessionsTab
            sessions={sessions}
            agents={agents}
            isLoading={sessionsQuery.isLoading}
            onCreateSessionPage={(returnFocusId) => navigate('/agente-ia/sessoes/nova', { state: { returnFocusId } })}
            onRefreshQR={(id, name) => refreshQR.mutate({ sessionId: id, instanceName: name })}
            onCheckStatus={(id) => checkStatus.mutate(id)}
            onDeleteSession={(id) => deleteSession.mutate(id)}
            onLinkAgent={(sessionId, agentId) => linkAgentToSession.mutate({ sessionId, agentId })}
            isRefreshing={refreshQR.isPending}
            isChecking={checkStatus.isPending}
          />
        </TabsContent>

        <TabsContent value="agents">
          <AgentsTab
            agents={agents}
            isLoading={agentsQuery.isLoading}
            onCreateAgent={(agent) => createAgent.mutateAsync(agent)}
            onUpdateAgent={(agent) => updateAgent.mutate(agent)}
            onDeleteAgent={(id) => deleteAgent.mutate(id)}
            isCreating={createAgent.isPending}
          />
        </TabsContent>

        <TabsContent value="conversations">
          <ConversationsTab
            conversations={conversations}
            hasMoreConversations={Boolean(conversationsQuery.hasNextPage)}
            isLoadingMoreConversations={conversationsQuery.isFetchingNextPage}
            onLoadMoreConversations={() => void conversationsQuery.fetchNextPage()}
            onStatusChange={(conversationId, status) => updateConversationStatus.mutate({ conversationId, status })}
            isUpdating={updateConversationStatus.isPending}
            onSendMessage={async (conversation, message) => { await sendHumanMessage.mutateAsync({
              conversationId: conversation.id,
              sessionId: conversation.session_id,
              to: conversation.remote_jid,
              message,
            }); }}
            isSending={sendHumanMessage.isPending}
            onMarkRead={(conversationId) => markConversationRead.mutate(conversationId)}
            onAddInternalNote={(conversationId, content) => addInternalNote.mutateAsync({ conversationId, content })}
            isAddingNote={addInternalNote.isPending}
            onPriorityChange={(conversationId, priority) => updateConversationPriority.mutate({ conversationId, priority })}
            onGenerateSummary={(conversationId) => generateConversationSummary.mutate(conversationId)}
            isGeneratingSummary={generateConversationSummary.isPending}
            onSendMedia={async (conversation, file) => { await sendHumanMedia.mutateAsync({ conversationId: conversation.id, sessionId: conversation.session_id, to: conversation.remote_jid, file }); }}
            isSendingMedia={sendHumanMedia.isPending}
            isClosing={requestSatisfaction.isPending}
            onCloseConversation={(conversation) => requestSatisfaction.mutate({ conversationId: conversation.id, sessionId: conversation.session_id, to: conversation.remote_jid })}
          />
        </TabsContent>
      </Tabs>
    </div>}
    </FeatureGate>
  );
}
