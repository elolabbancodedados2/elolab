import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Bot,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Play,
  DollarSign,
  Stethoscope,
  ListChecks,
  History,
  Search,
  type LucideIcon,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { useSupabaseQuery } from '@/hooks/useSupabaseData';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { cn } from '@/lib/utils';
import { resumirErroFilaNotificacao } from '@/lib/notificationQueueErrorSummary';
import { logAudit } from '@/lib/auditTrail';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface AutomationLog {
  id: string;
  tipo: string;
  nome: string;
  status: string;
  registros_processados: number | null;
  registros_sucesso: number | null;
  registros_erro: number | null;
  erro_mensagem: string | null;
  duracao_ms: number | null;
  created_at: string;
  detalhes: Record<string, unknown> | null;
}

interface AutomationSetting {
  id: string;
  chave: string;
  valor: Record<string, unknown>;
  descricao: string | null;
  ativo: boolean | null;
  updated_at: string;
}

interface QueueItem {
  id: string; tipo: string; destinatario_nome: string | null;
  status: string; tentativas: number;
  max_tentativas: number; erro_mensagem: string | null;
  agendado_para: string; created_at: string;
}

interface AutomationDeliveryClaim {
  chave: string;
  estado: 'claimed' | 'completed' | 'uncertain';
  criado_em: string;
  atualizado_em: string;
}

interface AutomationChangeRequest {
  key: string;
  name: string;
  clinicId: string;
  currentState: boolean;
  nextState: boolean;
}

interface ClientErrorEvent {
  id: string; tipo: string; mensagem: string; origem: string | null;
  rota: string | null; release: string | null; created_at: string;
}

const AUTOMATIONS: Array<{
  key: string;
  name: string;
  description: string;
  icon: LucideIcon;
  color: string;
  endpoint: string | null;
  automationKey?: string;
  available?: boolean;
  configurable?: boolean;
  unavailableReason?: string;
}> = [
  {
    key: 'lembrete_consulta_24h',
    name: 'Lembrete de Consulta (24h)',
    description: 'Envia lembretes 24 horas antes da consulta',
    icon: Clock,
    color: 'text-info',
    endpoint: 'send-appointment-reminder',
    automationKey: 'lembrete_consulta_24h',
  },
  {
    key: 'lembrete_consulta_2h',
    name: 'Lembrete de Consulta (2h)',
    description: 'Envia lembretes 2 horas antes da consulta',
    icon: Clock,
    color: 'text-info',
    endpoint: 'send-appointment-reminder',
    automationKey: 'lembrete_consulta_2h',
  },
  {
    key: 'alerta_estoque_critico',
    name: 'Alerta de Estoque Crítico',
    description: 'Notifica quando itens estão abaixo do mínimo',
    icon: AlertTriangle,
    color: 'text-warning',
    endpoint: 'stock-alert',
  },
  {
    key: 'faturamento_automatico',
    name: 'Faturamento Automático',
    description: 'Gera a cobrança no check-in ou ao finalizar o atendimento quando há preço cadastrado',
    icon: CheckCircle2,
    color: 'text-success',
    endpoint: null,
    configurable: false,
  },
  {
    key: 'aniversariantes',
    name: 'Mensagens de Aniversário',
    description: 'Envia felicitações para pacientes',
    icon: Bot,
    color: 'text-accent-foreground',
    endpoint: 'birthday-greetings',
  },
  {
    key: 'confirmacao_agendamento',
    name: 'Confirmação de Agendamento',
    description: 'Envia confirmação por WhatsApp quando o agendamento é criado',
    icon: CheckCircle2,
    color: 'text-success',
    endpoint: null,
  },
  {
    key: 'notificacao_resultado_exame',
    name: 'Notificação de Resultado de Exame',
    description: 'Envia aviso ao liberar o laudo por e-mail com modelo ativo ou WhatsApp com sessão conectada',
    icon: Stethoscope,
    color: 'text-primary',
    endpoint: null,
    configurable: false,
  },
  {
    key: 'recibo_pagamento',
    name: 'Recibo de Pagamento',
    description: 'Envia o recibo por e-mail quando um pagamento é confirmado',
    icon: DollarSign,
    color: 'text-success',
    endpoint: null,
  },
];

const formatarDataHora = (valor: string | null | undefined, ano: 'numeric' | '2-digit' | false = false) => {
  if (!valor) return 'Data indisponível';
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return 'Data indisponível';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    ...(ano ? { year: ano } : {}),
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(data);
};

export default function Automacoes() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const activeTab = ['logs', 'fila', 'erros-app'].includes(requestedTab || '') ? requestedTab! : 'automacoes';
  const changeTab = (value: string) => setSearchParams(previous => {
    const next = new URLSearchParams(previous);
    if (value === 'automacoes') next.delete('tab');
    else next.set('tab', value);
    return next;
  }, { replace: true });
  const [isRunning, setIsRunning] = useState<Record<string, boolean>>({});
  const [isToggling, setIsToggling] = useState<Record<string, boolean>>({});
  const [updatingQueue, setUpdatingQueue] = useState<Record<string, boolean>>({});
  const [automationChange, setAutomationChange] = useState<AutomationChangeRequest | null>(null);
  const [automationImpact, setAutomationImpact] = useState<{ pendingCount: number | null; loading: boolean; error: boolean }>({ pendingCount: null, loading: false, error: false });
  const [deliveryClaimsPage, setDeliveryClaimsPage] = useState(0);
  const [filaStatusFilter, setFilaStatusFilter] = useState<string>('todos');
  const [filaSearch, setFilaSearch] = useState('');
  const deliveryClaimsPageSize = 50;
  const runningLocks = useRef(new Set<string>());
  const togglingLocks = useRef(new Set<string>());
  const queueLocks = useRef(new Set<string>());
  const impactRequestVersion = useRef(0);
  const { profile } = useSupabaseAuth();
  useEffect(() => { setDeliveryClaimsPage(0); }, [profile?.clinica_id]);

  const logsQuery = useSupabaseQuery<AutomationLog>('automation_logs', {
    orderBy: { column: 'created_at', ascending: false }, limit: 50, page: 0,
  });

  const settingsQuery = useSupabaseQuery<AutomationSetting>('automation_settings', {
    orderBy: { column: 'chave', ascending: true }
  });

  const queueQuery = useSupabaseQuery<QueueItem>('notification_queue', {
    select: 'id, tipo, destinatario_nome, status, tentativas, max_tentativas, erro_mensagem, agendado_para, created_at',
    orderBy: { column: 'created_at', ascending: false }, limit: 100, page: 0,
  });
  const deliveryClaimsQuery = useSupabaseQuery<AutomationDeliveryClaim>('automation_delivery_claims', {
    select: 'chave, estado, criado_em, atualizado_em',
    orderBy: { column: 'atualizado_em', ascending: false }, limit: deliveryClaimsPageSize, page: deliveryClaimsPage,
    filters: [
      { column: 'estado', operator: 'in', value: '("claimed","uncertain")' },
      { column: 'clinica_id', operator: 'eq', value: profile?.clinica_id },
    ],
    enabled: Boolean(profile?.clinica_id),
  });
  const clientErrorsQuery = useSupabaseQuery<ClientErrorEvent>('client_error_events', {
    orderBy: { column: 'created_at', ascending: false }, limit: 100, page: 0,
  });
  const logs = logsQuery.data ?? [];
  const settings = settingsQuery.data ?? [];
  const queue = queueQuery.data ?? [];
  const deliveryClaims = deliveryClaimsQuery.data ?? [];
  const claimsHaveNextPage = deliveryClaims.length === deliveryClaimsPageSize;
  const claimsNeedingReview = deliveryClaims
    .filter((claim) => claim.estado === 'uncertain' || Date.now() - new Date(claim.criado_em).getTime() >= 10 * 60_000);
  const clientErrors = clientErrorsQuery.data ?? [];
  const allQueries = [logsQuery, settingsQuery, queueQuery, deliveryClaimsQuery, clientErrorsQuery];
  const isLoading = allQueries.some(query => query.isLoading);
  const failedQuery = allQueries.find(query => query.isError);

  const getSettingByKeyForIndicator = (key: string) => settings.find(s => s.chave === key);
  const automacoesAtivasCount = AUTOMATIONS.filter(automation => automation.available !== false).filter(automation => (
    automation.configurable === false ? true : (getSettingByKeyForIndicator(automation.key)?.ativo ?? true)
  )).length;
  const filaPendenteCount = queue.filter(item => ['pendente', 'erro', 'incerto'].includes(item.status)).length;
  const logsComErroCount = logs.filter(log => log.status === 'erro').length;
  const errosAppCount = clientErrors.length;

  const filaSearchTermo = filaSearch.trim().toLowerCase();
  const filaFiltrada = queue.filter(item => {
    if (filaStatusFilter !== 'todos' && item.status !== filaStatusFilter) return false;
    if (filaSearchTermo && !(item.destinatario_nome || '').toLowerCase().includes(filaSearchTermo)) return false;
    return true;
  });
  const filaTemFiltro = filaStatusFilter !== 'todos' || filaSearch.trim() !== '';
  const limparFiltrosFila = () => { setFilaStatusFilter('todos'); setFilaSearch(''); };

  const updateQueueItem = async (id: string, action: 'retry' | 'cancel') => {
    if (queueLocks.current.has(id)) return;
    if (!profile?.clinica_id) { toast.error('Clínica não identificada.'); return; }
    const item = queue.find((candidate) => candidate.id === id);
    if (!item || (action === 'retry' && !['erro', 'cancelado'].includes(item.status)) || (action === 'cancel' && !['pendente', 'erro'].includes(item.status))) {
      toast.error('O envio mudou de estado. Atualize a fila antes de continuar.');
      return;
    }
    const changes = action === 'retry'
      ? { status: 'pendente', tentativas: 0, erro_mensagem: null, agendado_para: new Date().toISOString(), iniciado_em: null }
      : { status: 'cancelado', iniciado_em: null };
    queueLocks.current.add(id);
    setUpdatingQueue(prev => ({ ...prev, [id]: true }));
    try {
      const { data, error } = await (supabase.from('notification_queue') as any).update(changes)
        .eq('id', id).eq('clinica_id', profile.clinica_id).eq('status', item.status).select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('O envio mudou de estado ou não está disponível nesta clínica. Atualize a fila.');
      toast.success(action === 'retry' ? 'Envio devolvido à fila' : 'Envio cancelado');
      await queueQuery.refetch();
    } catch (error) {
      toast.error('Não foi possível atualizar o envio', { description: (error as Error)?.message || 'Tente novamente.' });
    } finally {
      queueLocks.current.delete(id);
      setUpdatingQueue(prev => ({ ...prev, [id]: false }));
    }
  };

  const getSettingByKey = (key: string): AutomationSetting | undefined => {
    return settings.find(s => s.chave === key);
  };

  const requestAutomationChange = async (key: string, currentState: boolean) => {
    if (togglingLocks.current.has(key)) return;
    const automation = AUTOMATIONS.find(a => a.key === key);
    if (automation?.configurable === false) {
      toast.info('Esta automação é executada pelo fluxo clínico.', {
        description: 'O comportamento é automático e ainda não possui controle individual nesta tela.',
      });
      return;
    }
    if (automation?.available === false) {
      toast.info('Esta automação ainda não está disponível.', { description: automation.unavailableReason });
      return;
    }
    if (!profile?.clinica_id) { toast.error('Clínica não identificada.'); return; }
    if (settingsQuery.isError || settingsQuery.isLoading) { toast.error('Carregue as configurações antes de alterar a automação.'); return; }
    const requestVersion = ++impactRequestVersion.current;
    const clinicId = profile.clinica_id;
    setAutomationChange({ key, name: automation?.name ?? key, clinicId, currentState, nextState: !currentState });
    setAutomationImpact({ pendingCount: null, loading: true, error: false });
    try {
      const { count, error } = await supabase.from('notification_queue')
        .select('id', { count: 'exact', head: true })
        .eq('clinica_id', clinicId)
        .in('status', ['pendente', 'enviando', 'incerto', 'erro']);
      if (requestVersion !== impactRequestVersion.current) return;
      if (error || count === null) throw error ?? new Error('A contagem de envios não foi confirmada.');
      setAutomationImpact({ pendingCount: count, loading: false, error: false });
    } catch {
      if (requestVersion === impactRequestVersion.current) setAutomationImpact({ pendingCount: null, loading: false, error: true });
    }
  };

  const toggleAutomation = async () => {
    const change = automationChange;
    if (!change || togglingLocks.current.has(change.key) || automationImpact.pendingCount === null || automationImpact.error || automationImpact.loading) return;
    const { key, name, currentState, nextState } = change;
    const automation = AUTOMATIONS.find(item => item.key === key);
    if (!profile?.clinica_id) { toast.error('Clínica não identificada.'); return; }
    if (profile.clinica_id !== change.clinicId) {
      setAutomationChange(null);
      toast.error('A clínica ativa mudou durante a prévia. Confira a automação novamente antes de salvar.');
      return;
    }
    togglingLocks.current.add(key);
    setIsToggling(prev => ({ ...prev, [key]: true }));
    try {
      const existing = getSettingByKey(key);
      let error: any = null;
      let updated: { id: string } | null = null;

      if (existing) {
        ({ data: updated, error } = await supabase
          .from('automation_settings')
          .update({ ativo: nextState })
          .eq('id', existing.id).eq('clinica_id', change.clinicId).eq('ativo', currentState).select('id').maybeSingle());
        if (!error && !updated) throw new Error('A configuração mudou desde a prévia. Atualize a tela e confira o estado atual.');
      } else {
        if (!profile?.clinica_id) throw new Error('Clínica não identificada. Recarregue a página e tente novamente.');
        ({ error } = await supabase
          .from('automation_settings')
          .insert({
            chave: key,
            ativo: nextState,
            descricao: automation?.description ?? null,
            valor: {},
            clinica_id: change.clinicId,
          }));
      }

      if (error) throw error;

      let auditRecorded = false;
      try {
        auditRecorded = await logAudit({
          action: 'update', collection: 'automation_settings', recordId: existing?.id ?? key, recordName: name,
          userId: profile.id, userName: profile.nome,
          changes: [{ field: 'ativo', oldValue: currentState, newValue: nextState }],
        });
      } catch {
        auditRecorded = false;
      }
      toast.success(nextState ? 'Automação ativada' : 'Automação desativada', {
        description: auditRecorded
          ? `A automação "${name}" foi ${nextState ? 'ativada' : 'desativada'} para os próximos processamentos.`
          : `A automação "${name}" foi alterada. O registro de autoria ficou pendente para reenvio.`,
      });
      impactRequestVersion.current++;
      setAutomationChange(null);
      await settingsQuery.refetch();
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error toggling automation:', error);
      toast.error('Erro', { description: (error as Error)?.message || 'Erro ao alterar status da automação.' });
    } finally {
      togglingLocks.current.delete(key);
      setIsToggling(prev => ({ ...prev, [key]: false }));
    }
  };

  const runAutomation = async (key: string, endpoint: string | null, automationKey?: string) => {
    if (runningLocks.current.has(key)) return;
    if (!endpoint) {
      toast.info('Esta automação não oferece execução manual.', { description: 'Ela depende do evento associado e do estado ativo da clínica.' });
      return;
    }

    runningLocks.current.add(key);
    setIsRunning(prev => ({ ...prev, [key]: true }));

    try {
      const { data, error } = await supabase.functions.invoke(endpoint, {
        body: automationKey ? { automation_key: automationKey } : {},
      });

      if (error) throw error;
      if (data?.error || data?.success === false) {
        throw new Error(data.error || 'A automação foi recusada pelo servidor.');
      }

      const stats = data?.stats ?? {};
      const processados = Number(stats.processados ?? stats.aniversariantes ?? stats.itens_criticos ?? 0);
      const sucessos = Number(stats.sucesso ?? stats.enviados ?? stats.emails_enviados ?? 0);
      const erros = Number(stats.erros ?? stats.emails_erro ?? 0);
      if (erros > 0) {
        toast.warning('Execução concluída com falhas', { description: `${processados} processados · ${sucessos} enviados · ${erros} com erro. Consulte o log para detalhes.` });
      } else if (processados === 0) {
        toast.success('Execução concluída', { description: data?.message || 'Nenhum envio estava previsto neste momento.' });
      } else {
        toast.success('Execução concluída', { description: `${processados} processados · ${sucessos} enviados.` });
      }
      await Promise.all([logsQuery.refetch(), queueQuery.refetch()]);
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error running automation:', error);
      toast.error('Não foi possível executar a automação', { description: (error as Error)?.message || 'Tente novamente e consulte o log.' });
    } finally {
      runningLocks.current.delete(key);
      setIsRunning(prev => ({ ...prev, [key]: false }));
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'sucesso':
        return <Badge className="bg-success/10 text-success border-success/20">Sucesso</Badge>;
      case 'erro':
        return <Badge className="bg-destructive/10 text-destructive border-destructive/20">Erro</Badge>;
      case 'parcial':
        return <Badge className="bg-warning/10 text-warning border-warning/20">Parcial</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getTypeBadge = (tipo: string) => {
    const colors: Record<string, string> = {
      lembrete: 'bg-info/10 text-info border-info/20',
      estoque: 'bg-warning/10 text-warning border-warning/20',
      faturamento: 'bg-success/10 text-success border-success/20',
      exame: 'bg-primary/10 text-primary border-primary/20',
      aniversario: 'bg-accent text-accent-foreground',
    };
    return <Badge className={colors[tipo] || 'bg-muted text-muted-foreground'}>{tipo}</Badge>;
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      </div>
    );
  }

  if (failedQuery) {
    return <ErrorState title="Não foi possível carregar as automações" description="A tela foi pausada para não mostrar uma fila, um status ou um histórico incompleto." error={failedQuery.error} onRetry={() => { for (const query of allQueries) void query.refetch(); }} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Automações"
        description={`${automacoesAtivasCount} automação(ões) ativa(s) · ${filaPendenteCount} mensagem(ns) na fila de envio`}
        icon={<Bot />}
        actions={(
          <>
            <Button
              variant="outline"
              size="icon"
              className="shrink-0 rounded-full"
              disabled={allQueries.some(query => query.isFetching)}
              onClick={() => { for (const query of allQueries) void query.refetch(); }}
              aria-label="Atualizar automações"
              title="Atualizar automações"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              className="rounded-full gap-2 bg-[#111111] text-white shadow-md hover:bg-[#2b2b33]"
              onClick={() => changeTab('fila')}
            >
              <ListChecks className="h-4 w-4" /> Ver fila de envios
            </Button>
          </>
        )}
      />

      {/* ─── Indicator strip ─── */}
      <section aria-label="Indicadores de automações e mensagens">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {[
            { key: 'fila', label: 'Na fila de envio', value: filaPendenteCount, icon: ListChecks, escuro: true, color: '', bg: '' },
            { key: 'automacoes', label: 'Automações ativas', value: automacoesAtivasCount, icon: Bot, escuro: false, color: 'text-[#1080CA]', bg: 'bg-[#1080CA]/10' },
            { key: 'logs', label: 'Falhas nos logs', value: logsComErroCount, icon: AlertTriangle, escuro: false, color: 'text-warning', bg: 'bg-warning/10' },
            { key: 'erros-app', label: 'Erros do navegador', value: errosAppCount, icon: XCircle, escuro: false, color: 'text-destructive', bg: 'bg-destructive/10' },
          ].map((indicator) => {
            const isActive = activeTab === indicator.key;
            const Icon = indicator.icon;
            return (
              <button
                key={indicator.key}
                type="button"
                aria-pressed={isActive}
                onClick={() => changeTab(indicator.key)}
                className={cn(
                  'rounded-2xl border border-border/60 bg-card p-3 text-left shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1080CA] focus-visible:ring-offset-2',
                  indicator.escuro && 'border-transparent bg-[#111111] text-white',
                  !indicator.escuro && isActive && 'ring-2 ring-[#1080CA]',
                  indicator.escuro && isActive && 'ring-2 ring-[#2ED5E7]',
                )}
              >
                <div className="flex items-center gap-3">
                  <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', indicator.escuro ? 'bg-white/15' : indicator.bg)}>
                    <Icon className={cn('h-5 w-5', indicator.escuro ? 'text-[#2ED5E7]' : indicator.color)} />
                  </div>
                  <div>
                    <p className={cn('text-2xl font-bold tabular-nums', indicator.escuro ? 'text-[#2ED5E7]' : indicator.color)}>{indicator.value}</p>
                    <p className={cn('text-[11px]', indicator.escuro ? 'text-white/70' : 'text-muted-foreground')}>{indicator.label}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <Tabs value={activeTab} onValueChange={changeTab} className="space-y-6">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-2xl border border-border bg-muted/60 p-1.5 text-muted-foreground">
          <TabsTrigger value="automacoes" className="min-h-11 gap-2 rounded-xl">
            <Bot className="h-4 w-4" /> Automações
          </TabsTrigger>
          <TabsTrigger value="logs" className="min-h-11 gap-2 rounded-xl">
            <History className="h-4 w-4" /> Logs de Execução
          </TabsTrigger>
          <TabsTrigger value="fila" className="min-h-11 gap-2 rounded-xl">
            <ListChecks className="h-4 w-4" /> Fila de envios
          </TabsTrigger>
          <TabsTrigger value="erros-app" className="min-h-11 gap-2 rounded-xl">
            <AlertTriangle className="h-4 w-4" /> Erros do app
          </TabsTrigger>
        </TabsList>

        <TabsContent value="automacoes">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {AUTOMATIONS.map((automation) => {
              const setting = getSettingByKey(automation.key);
              // Sem linha no banco, o BACKEND considera a automação ligada
              // (`isAutomationActive` faz `?.ativo !== false`). Aqui estava
              // `?? false`, então a tela mostrava desligado enquanto o sistema
              // mandava e-mail de aniversário e lembrete de consulta para os
              // pacientes — a clínica não tinha como saber.
              //
              // A migration 20260814130000 dá linha explícita a toda clínica e
              // um trigger para as novas, então este `?? true` só vale no
              // intervalo entre criar a clínica e o trigger rodar. Fica assim
              // mesmo para não voltar a discordar do backend.
              // These event handlers currently do not read automation_settings;
              // reflect their actual behavior instead of a stale stored switch.
              const isActive = automation.configurable === false ? true : setting?.ativo ?? true;
              const available = automation.available !== false;
              const Icon = automation.icon;

              const statusBadge = !available
                ? <Badge variant="muted" className="font-medium">Em desenvolvimento</Badge>
                : automation.configurable === false
                  ? <Badge variant="info" className="font-medium">Automática</Badge>
                  : isActive
                    ? <Badge variant="success" className="font-medium">Ativo</Badge>
                    : <Badge variant="outline" className="font-medium text-muted-foreground">Inativo</Badge>;

              return (
                <Card key={automation.key} className={cn('shadow-xs transition-all hover:shadow-md', !isActive && 'opacity-60')}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted', automation.color)}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <CardTitle className="text-base">{automation.name}</CardTitle>
                          <CardDescription className="text-xs mt-1">
                            {available ? automation.description : automation.unavailableReason}
                          </CardDescription>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={available && isActive}
                          aria-label={available && automation.configurable !== false
                            ? `${isActive ? 'Desativar' : 'Ativar'} ${automation.name}`
                            : available
                              ? `${automation.name}, automática sem controle individual`
                            : `${automation.name} indisponível`}
                          disabled={!available || automation.configurable === false || isToggling[automation.key]}
                          onCheckedChange={() => void requestAutomationChange(automation.key, isActive)}
                        />
                        {statusBadge}
                      </div>
                      {automation.endpoint && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-full"
                          aria-label={`Executar ${automation.name}`}
                          disabled={!isActive || isRunning[automation.key]}
                          onClick={() => runAutomation(automation.key, automation.endpoint, (automation as any).automationKey)}
                        >
                          {isRunning[automation.key] ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </div>
                    {setting?.updated_at && (
                      <p className="text-xs text-muted-foreground mt-3">
                        Atualizado: {formatarDataHora(setting.updated_at, 'numeric')}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="logs">
          <Card className="shadow-xs">
            <CardHeader>
              <CardTitle>Histórico de Execuções</CardTitle>
              <CardDescription>Até 50 execuções recentes, com o detalhe de falhas quando disponível.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-hidden overflow-x-auto rounded-xl border border-border/60">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data/Hora</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden md:table-cell">Envios / registros</TableHead>
                      <TableHead>Detalhe</TableHead>
                      <TableHead className="hidden lg:table-cell">Duração</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-10 text-center">
                          <div className="flex flex-col items-center gap-3">
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-md">
                              <History className="h-6 w-6" />
                            </div>
                            <p className="text-muted-foreground">Nenhum log de execução encontrado</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      logs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="text-sm">
                            {formatarDataHora(log.created_at, 'numeric')}
                          </TableCell>
                          <TableCell>{getTypeBadge(log.tipo)}</TableCell>
                          <TableCell className="font-medium">{log.nome}</TableCell>
                          <TableCell>{getStatusBadge(log.status)}</TableCell>
                          <TableCell className="hidden md:table-cell">
                            {log.registros_processados !== null && (
                              <span className="text-sm">
                                {log.registros_sucesso} envios / {log.registros_processados} registros
                                {log.registros_erro ? (
                                  <span className="text-destructive ml-1">({log.registros_erro} erros)</span>
                                ) : null}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="max-w-72">
                            <p className={cn('truncate text-xs', log.erro_mensagem && 'text-destructive')} title={log.erro_mensagem || ''}>
                              {log.erro_mensagem || '—'}
                            </p>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                            {log.duracao_ms ? `${log.duracao_ms}ms` : '-'}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="fila" className="space-y-4">
          <p className="text-sm text-muted-foreground">Os cartões mostram o status das 100 mensagens mais recentes carregadas. Clique em um cartão para filtrar a lista.</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
            {[
              ['Pendentes', 'pendente', Clock], ['Enviando', 'enviando', RefreshCw],
              ['Resultado incerto', 'incerto', AlertTriangle], ['Com erro', 'erro', AlertTriangle], ['Enviados', 'enviado', CheckCircle2],
              ['Cancelados', 'cancelado', XCircle],
            ].map(([label, status, Icon]) => {
              const isActive = filaStatusFilter === status;
              return (
                <button
                  key={String(status)}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setFilaStatusFilter(current => current === status ? 'todos' : String(status))}
                  className={cn(
                    'rounded-2xl border border-border/60 bg-card p-4 text-left shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1080CA] focus-visible:ring-offset-2',
                    isActive && 'ring-2 ring-[#1080CA]',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div><p className="text-sm text-muted-foreground">{String(label)}</p><p className="text-2xl font-bold tabular-nums">{queue.filter(item => item.status === status).length}</p></div>
                    <Icon className="h-5 w-5 text-muted-foreground" />
                  </div>
                </button>
              );
            })}
          </div>
          {(claimsNeedingReview.length > 0 || deliveryClaimsPage > 0 || claimsHaveNextPage) && <Card className="border-amber-300 bg-amber-50/70">
            <CardHeader><CardTitle className="text-base">Reservas sem confirmação de envio</CardTitle><CardDescription>Confira os registros do provedor antes de repetir: o envio pode ter sido aceito antes de a função parar.</CardDescription></CardHeader>
            <CardContent className="space-y-2">
              {claimsNeedingReview.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma reserva vencida precisa de conferência nesta página.</p> : claimsNeedingReview.map((claim) => <div key={claim.chave} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-white/80 px-3 py-2 text-sm">
                  <code className="break-all">{claim.chave}</code>
                  <span className="text-muted-foreground">{formatarDataHora(claim.atualizado_em, '2-digit')}</span>
                </div>)}
              <div className="flex items-center justify-between pt-2">
                <Button variant="outline" size="sm" disabled={deliveryClaimsPage === 0 || deliveryClaimsQuery.isFetching} onClick={() => setDeliveryClaimsPage(page => Math.max(0, page - 1))}>Anteriores</Button>
                <span className="text-xs text-muted-foreground">Página {deliveryClaimsPage + 1}</span>
                <Button variant="outline" size="sm" disabled={!claimsHaveNextPage || deliveryClaimsQuery.isFetching} onClick={() => setDeliveryClaimsPage(page => page + 1)}>Mais reservas</Button>
              </div>
            </CardContent>
          </Card>}
          <Card className="shadow-xs">
            <CardHeader>
              <CardTitle>Últimos envios</CardTitle>
              <CardDescription>
                {filaTemFiltro ? `${filaFiltrada.length} de ${queue.length} mensagens` : 'Até 100 mensagens recentes, com tentativas e detalhes de falha.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 sm:max-w-xs">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    aria-label="Buscar envios por destinatário"
                    placeholder="Buscar por destinatário..."
                    value={filaSearch}
                    onChange={(event) => setFilaSearch(event.target.value)}
                    className="h-10 rounded-full pl-9 focus-visible:ring-[#1080CA]"
                  />
                </div>
                {filaTemFiltro && (
                  <Button variant="ghost" size="sm" className="rounded-full text-muted-foreground" onClick={limparFiltrosFila}>
                    Limpar filtros
                  </Button>
                )}
              </div>
              <div className="overflow-hidden overflow-x-auto rounded-xl border border-border/60"><Table>
              <TableHeader><TableRow><TableHead>Próxima tentativa / agendado</TableHead><TableHead>Canal</TableHead><TableHead>Destinatário</TableHead><TableHead>Status</TableHead><TableHead>Tentativas</TableHead><TableHead>Detalhe</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
              <TableBody>{filaFiltrada.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="py-10 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-md">
                      <ListChecks className="h-6 w-6" />
                    </div>
                    <p className="text-muted-foreground">{filaTemFiltro ? 'Nenhum envio corresponde à busca ou ao filtro selecionado' : 'Nenhum envio na fila'}</p>
                    {filaTemFiltro && <Button variant="link" onClick={limparFiltrosFila} className="h-auto">Limpar busca e filtro</Button>}
                  </div>
                </TableCell></TableRow>
              ) : filaFiltrada.map(item => (
                <TableRow key={item.id}>
                  <TableCell className="whitespace-nowrap text-sm">{formatarDataHora(item.agendado_para)}</TableCell>
                  <TableCell><Badge variant="outline">{item.tipo}</Badge></TableCell>
                  <TableCell><div className="max-w-48 truncate font-medium">{item.destinatario_nome || 'Destinatário'}</div></TableCell>
                  <TableCell><Badge className={item.status === 'incerto' ? 'border-amber-500 text-amber-700' : undefined} variant={item.status === 'erro' ? 'destructive' : item.status === 'enviado' ? 'default' : 'secondary'}>{item.status === 'incerto' ? 'incerto · verificar' : item.status}</Badge></TableCell>
                  <TableCell>{item.tentativas}/{item.max_tentativas}</TableCell>
                  <TableCell><p className="max-w-64 truncate text-xs text-muted-foreground" title={item.erro_mensagem ? resumirErroFilaNotificacao(item.erro_mensagem) : ''}>{item.erro_mensagem ? resumirErroFilaNotificacao(item.erro_mensagem) : '—'}</p></TableCell>
                  <TableCell><div className="flex justify-end gap-1">
                    {(item.status === 'erro' || item.status === 'cancelado') && <Button size="sm" variant="outline" className="rounded-full" disabled={updatingQueue[item.id]} onClick={() => updateQueueItem(item.id, 'retry')}><RefreshCw className={cn('mr-1 h-3 w-3', updatingQueue[item.id] && 'animate-spin')} />Repetir</Button>}
                    {(item.status === 'pendente' || item.status === 'erro') && <Button size="icon" variant="ghost" className="rounded-full" title="Cancelar" aria-label={`Cancelar envio para ${item.destinatario_nome || 'destinatário'}`} disabled={updatingQueue[item.id]} onClick={() => updateQueueItem(item.id, 'cancel')}><XCircle className="h-4 w-4" /></Button>}
                  </div></TableCell>
                </TableRow>
              ))}</TableBody>
            </Table></div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="erros-app">
          <Card className="shadow-xs"><CardHeader><CardTitle>Erros reais do navegador</CardTitle><CardDescription>Falhas não tratadas registradas em produção, sem e-mails, documentos ou stack traces sensíveis.</CardDescription></CardHeader>
            <CardContent><div className="overflow-hidden overflow-x-auto rounded-xl border border-border/60"><Table>
              <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Tipo</TableHead><TableHead>Rota</TableHead><TableHead>Mensagem</TableHead><TableHead>Versão</TableHead></TableRow></TableHeader>
              <TableBody>{clientErrors.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="py-10 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-md">
                      <AlertTriangle className="h-6 w-6" />
                    </div>
                    <p className="text-muted-foreground">Nenhum erro capturado</p>
                  </div>
                </TableCell></TableRow>
              ) : clientErrors.map(item => <TableRow key={item.id}>
                <TableCell className="whitespace-nowrap">{formatarDataHora(item.created_at)}</TableCell>
                <TableCell><Badge variant="destructive">{item.tipo}</Badge></TableCell><TableCell>{item.rota || '—'}</TableCell>
                <TableCell><p className="max-w-xl truncate" title={item.mensagem}>{item.mensagem}</p></TableCell><TableCell className="max-w-32 truncate text-xs">{item.release || '—'}</TableCell>
              </TableRow>)}</TableBody>
            </Table></div></CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      <AlertDialog
        open={Boolean(automationChange)}
        onOpenChange={(open) => {
          const key = automationChange?.key;
          if (!open && (!key || !isToggling[key])) {
            impactRequestVersion.current++;
            setAutomationChange(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{automationChange?.nextState ? 'Confirmar ativação' : 'Confirmar desativação'}</AlertDialogTitle>
            <AlertDialogDescription>
              {automationChange?.nextState
                ? `A automação “${automationChange.name}” passará a participar dos próximos processamentos desta clínica.`
                : `A automação “${automationChange?.name}” deixará de participar dos próximos processamentos desta clínica.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-lg border bg-muted/40 p-3 text-sm" role="status" aria-live="polite">
            {automationImpact.loading && 'Calculando o alcance da alteração…'}
            {automationImpact.error && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>Não foi possível confirmar quantos envios existentes serão preservados. Recalcule a prévia para continuar.</span>
                <Button variant="outline" size="sm" onClick={() => automationChange && void requestAutomationChange(automationChange.key, automationChange.currentState)}>
                  Recalcular prévia
                </Button>
              </div>
            )}
            {!automationImpact.loading && !automationImpact.error && automationImpact.pendingCount !== null && (
              automationImpact.pendingCount === 0
                ? 'Não há envios pendentes ou em conferência nesta clínica; a fila existente não será alterada.'
                : `Há ${automationImpact.pendingCount} envios pendentes ou em conferência nesta clínica; eles não serão alterados por esta mudança.`
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(automationChange && isToggling[automationChange.key])}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={!automationChange || automationImpact.loading || automationImpact.error || automationImpact.pendingCount === null || isToggling[automationChange?.key ?? '']}
              onClick={(event) => { event.preventDefault(); void toggleAutomation(); }}
            >
              {automationChange && isToggling[automationChange.key]
                ? 'Salvando…'
                : automationChange?.nextState ? 'Ativar automação' : 'Desativar automação'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
