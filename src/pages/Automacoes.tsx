import { useRef, useState } from 'react';
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
  type LucideIcon,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { cn } from '@/lib/utils';

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
  destinatario_email: string | null; destinatario_telefone: string | null;
  assunto: string | null; status: string; tentativas: number;
  max_tentativas: number; erro_mensagem: string | null;
  agendado_para: string; created_at: string;
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
    description: 'Cria lançamentos ao finalizar consultas',
    icon: CheckCircle2,
    color: 'text-success',
    endpoint: null,
    available: false,
    unavailableReason: 'Ainda não existe um fluxo conectado para gerar a cobrança automaticamente.',
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
    description: 'Envia resultado de exame para paciente quando liberado',
    icon: Stethoscope,
    color: 'text-primary',
    endpoint: null,
    available: false,
    unavailableReason: 'O aviso automático após liberar o resultado ainda não está conectado.',
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
  const [isRunning, setIsRunning] = useState<Record<string, boolean>>({});
  const [isToggling, setIsToggling] = useState<Record<string, boolean>>({});
  const [updatingQueue, setUpdatingQueue] = useState<Record<string, boolean>>({});
  const runningLocks = useRef(new Set<string>());
  const togglingLocks = useRef(new Set<string>());
  const queueLocks = useRef(new Set<string>());
  const { profile } = useSupabaseAuth();

  const logsQuery = useSupabaseQuery<AutomationLog>('automation_logs', {
    orderBy: { column: 'created_at', ascending: false }, limit: 50, page: 0,
  });

  const settingsQuery = useSupabaseQuery<AutomationSetting>('automation_settings', {
    orderBy: { column: 'chave', ascending: true }
  });

  const queueQuery = useSupabaseQuery<QueueItem>('notification_queue', {
    orderBy: { column: 'created_at', ascending: false }, limit: 100, page: 0,
  });
  const clientErrorsQuery = useSupabaseQuery<ClientErrorEvent>('client_error_events', {
    orderBy: { column: 'created_at', ascending: false }, limit: 100, page: 0,
  });
  const logs = logsQuery.data ?? [];
  const settings = settingsQuery.data ?? [];
  const queue = queueQuery.data ?? [];
  const clientErrors = clientErrorsQuery.data ?? [];
  const allQueries = [logsQuery, settingsQuery, queueQuery, clientErrorsQuery];
  const isLoading = allQueries.some(query => query.isLoading);
  const failedQuery = allQueries.find(query => query.isError);

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

  const toggleAutomation = async (key: string, currentState: boolean) => {
    if (togglingLocks.current.has(key)) return;
    const automation = AUTOMATIONS.find(a => a.key === key);
    if (automation?.available === false) {
      toast.info('Esta automação ainda não está disponível.', { description: automation.unavailableReason });
      return;
    }
    if (!profile?.clinica_id) { toast.error('Clínica não identificada.'); return; }
    if (settingsQuery.isError || settingsQuery.isLoading) { toast.error('Carregue as configurações antes de alterar a automação.'); return; }
    togglingLocks.current.add(key);
    setIsToggling(prev => ({ ...prev, [key]: true }));
    try {
      const existing = getSettingByKey(key);
      let error: any = null;
      let updated: { id: string } | null = null;

      if (existing) {
        ({ data: updated, error } = await supabase
          .from('automation_settings')
          .update({ ativo: !currentState })
          .eq('id', existing.id).eq('clinica_id', profile.clinica_id).select('id').maybeSingle());
        if (!error && !updated) throw new Error('Configuração não encontrada ou sem permissão para alterar. Atualize a página.');
      } else {
        if (!profile?.clinica_id) throw new Error('Clínica não identificada. Recarregue a página e tente novamente.');
        ({ error } = await supabase
          .from('automation_settings')
          .insert({
            chave: key,
            ativo: !currentState,
            descricao: automation?.description ?? null,
            valor: {},
            clinica_id: profile.clinica_id,
          }));
      }

      if (error) throw error;

      toast.success(!currentState ? 'Automação ativada' : 'Automação desativada', { description: `A automação "${AUTOMATIONS.find(a => a.key === key)?.name}" foi ${!currentState ? 'ativada' : 'desativada'}.` });
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
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Automações</h1>
          <p className="text-muted-foreground">Gerencie as automações do sistema</p>
        </div>
        <Button variant="outline" disabled={allQueries.some(query => query.isFetching)} onClick={() => { for (const query of allQueries) void query.refetch(); }}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Atualizar
        </Button>
      </div>

      <Tabs defaultValue="automacoes" className="space-y-6">
        <TabsList>
          <TabsTrigger value="automacoes">Automações</TabsTrigger>
          <TabsTrigger value="logs">Logs de Execução</TabsTrigger>
          <TabsTrigger value="fila">Fila de envios</TabsTrigger>
          <TabsTrigger value="erros-app">Erros do app</TabsTrigger>
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
              const isActive = setting?.ativo ?? true;
              const available = automation.available !== false;
              const Icon = automation.icon;

              return (
                <Card key={automation.key} className={!isActive ? 'opacity-60' : ''}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg bg-muted ${automation.color}`}>
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
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={available && isActive}
                          aria-label={available
                            ? `${isActive ? 'Desativar' : 'Ativar'} ${automation.name}`
                            : `${automation.name} indisponível`}
                          disabled={!available || isToggling[automation.key]}
                          onCheckedChange={() => toggleAutomation(automation.key, isActive)}
                        />
                        <span className="text-sm text-muted-foreground">
                          {!available ? 'Em desenvolvimento' : isActive ? 'Ativo' : 'Inativo'}
                        </span>
                      </div>
                      {automation.endpoint && (
                        <Button
                          variant="outline"
                          size="sm"
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
          <Card>
            <CardHeader>
              <CardTitle>Histórico de Execuções</CardTitle>
              <CardDescription>Até 50 execuções recentes, com o detalhe de falhas quando disponível.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
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
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
                          <p>Nenhum log de execução encontrado</p>
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {[
              ['Pendentes', 'pendente', Clock], ['Enviando', 'enviando', RefreshCw],
              ['Com erro', 'erro', AlertTriangle], ['Enviados', 'enviado', CheckCircle2],
              ['Cancelados', 'cancelado', XCircle],
            ].map(([label, status, Icon]) => (
              <Card key={String(status)}><CardContent className="flex items-center justify-between p-5">
                <div><p className="text-sm text-muted-foreground">{String(label)}</p><p className="text-2xl font-bold">{queue.filter(item => item.status === status).length}</p></div>
                <Icon className="h-5 w-5 text-muted-foreground" />
              </CardContent></Card>
            ))}
          </div>
          <Card>
            <CardHeader><CardTitle>Últimos envios</CardTitle><CardDescription>Até 100 mensagens recentes, com tentativas e detalhes de falha.</CardDescription></CardHeader>
            <CardContent><div className="overflow-x-auto rounded-md border"><Table>
              <TableHeader><TableRow><TableHead>Agendado</TableHead><TableHead>Canal</TableHead><TableHead>Destinatário</TableHead><TableHead>Status</TableHead><TableHead>Tentativas</TableHead><TableHead>Detalhe</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
              <TableBody>{queue.length === 0 ? <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Nenhum envio na fila</TableCell></TableRow> : queue.map(item => (
                <TableRow key={item.id}>
                  <TableCell className="whitespace-nowrap text-sm">{formatarDataHora(item.agendado_para)}</TableCell>
                  <TableCell><Badge variant="outline">{item.tipo}</Badge></TableCell>
                  <TableCell><div className="max-w-48 truncate font-medium">{item.destinatario_nome || item.destinatario_email || item.destinatario_telefone || 'Não informado'}</div></TableCell>
                  <TableCell><Badge variant={item.status === 'erro' ? 'destructive' : item.status === 'enviado' ? 'default' : 'secondary'}>{item.status}</Badge></TableCell>
                  <TableCell>{item.tentativas}/{item.max_tentativas}</TableCell>
                  <TableCell><p className="max-w-64 truncate text-xs text-muted-foreground" title={item.erro_mensagem || item.assunto || ''}>{item.erro_mensagem || item.assunto || '—'}</p></TableCell>
                  <TableCell><div className="flex justify-end gap-1">
                    {(item.status === 'erro' || item.status === 'cancelado') && <Button size="sm" variant="outline" disabled={updatingQueue[item.id]} onClick={() => updateQueueItem(item.id, 'retry')}><RefreshCw className={cn('mr-1 h-3 w-3', updatingQueue[item.id] && 'animate-spin')} />Repetir</Button>}
                    {(item.status === 'pendente' || item.status === 'erro') && <Button size="icon" variant="ghost" title="Cancelar" aria-label={`Cancelar envio para ${item.destinatario_nome || item.destinatario_email || item.destinatario_telefone || 'destinatário'}`} disabled={updatingQueue[item.id]} onClick={() => updateQueueItem(item.id, 'cancel')}><XCircle className="h-4 w-4" /></Button>}
                  </div></TableCell>
                </TableRow>
              ))}</TableBody>
            </Table></div></CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="erros-app">
          <Card><CardHeader><CardTitle>Erros reais do navegador</CardTitle><CardDescription>Falhas não tratadas registradas em produção, sem e-mails, documentos ou stack traces sensíveis.</CardDescription></CardHeader>
            <CardContent><div className="overflow-x-auto rounded-md border"><Table>
              <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Tipo</TableHead><TableHead>Rota</TableHead><TableHead>Mensagem</TableHead><TableHead>Versão</TableHead></TableRow></TableHeader>
              <TableBody>{clientErrors.length === 0 ? <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Nenhum erro capturado</TableCell></TableRow> : clientErrors.map(item => <TableRow key={item.id}>
                <TableCell className="whitespace-nowrap">{formatarDataHora(item.created_at)}</TableCell>
                <TableCell><Badge variant="destructive">{item.tipo}</Badge></TableCell><TableCell>{item.rota || '—'}</TableCell>
                <TableCell><p className="max-w-xl truncate" title={item.mensagem}>{item.mensagem}</p></TableCell><TableCell className="max-w-32 truncate text-xs">{item.release || '—'}</TableCell>
              </TableRow>)}</TableBody>
            </Table></div></CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
