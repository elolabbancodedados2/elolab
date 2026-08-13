import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Settings,
  Play,
  Pause,
  Zap,
  Mail,
  DollarSign,
  Stethoscope
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
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
import { useSupabaseQuery, useSupabaseUpdate } from '@/hooks/useSupabaseData';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';

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

const AUTOMATIONS = [
  {
    key: 'lembrete_consulta_24h',
    name: 'Lembrete de Consulta (24h)',
    description: 'Envia lembretes 24 horas antes da consulta',
    icon: Clock,
    color: 'text-info',
    endpoint: 'send-appointment-reminder',
  },
  {
    key: 'lembrete_consulta_2h',
    name: 'Lembrete de Consulta (2h)',
    description: 'Envia lembretes 2 horas antes da consulta',
    icon: Clock,
    color: 'text-info',
    endpoint: 'send-appointment-reminder',
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
    description: 'Envia confirmação por email e WhatsApp quando consulta é confirmada',
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
  },
  {
    key: 'recibo_pagamento',
    name: 'Recibo de Pagamento',
    description: 'Envia recibo de pagamento por email para paciente',
    icon: DollarSign,
    color: 'text-success',
    endpoint: null,
  },
];

export default function Automacoes() {
  const [isRunning, setIsRunning] = useState<Record<string, boolean>>({});
  const { profile } = useSupabaseAuth();

  const { data: logs = [], isLoading: loadingLogs, refetch: refetchLogs } = useSupabaseQuery<AutomationLog>('automation_logs', {
    orderBy: { column: 'created_at', ascending: false }
  });

  const { data: settings = [], isLoading: loadingSettings, refetch: refetchSettings } = useSupabaseQuery<AutomationSetting>('automation_settings', {
    orderBy: { column: 'chave', ascending: true }
  });

  const getSettingByKey = (key: string): AutomationSetting | undefined => {
    return settings.find(s => s.chave === key);
  };

  const toggleAutomation = async (key: string, currentState: boolean) => {
    try {
      const automation = AUTOMATIONS.find(a => a.key === key);
      const existing = getSettingByKey(key);
      let error: any = null;

      if (existing) {
        ({ error } = await supabase
          .from('automation_settings')
          .update({ ativo: !currentState })
          .eq('id', existing.id));
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
      refetchSettings();
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error toggling automation:', error);
      toast.error('Erro', { description: (error as Error)?.message || 'Erro ao alterar status da automação.' });
    }
  };

  const runAutomation = async (key: string, endpoint: string | null) => {
    if (!endpoint) {
      toast.info('Automação baseada em trigger', { description: 'Esta automação é executada automaticamente pelo banco de dados.' });
      return;
    }

    setIsRunning(prev => ({ ...prev, [key]: true }));

    try {
      const { data, error } = await supabase.functions.invoke(endpoint);

      if (error) throw error;

      toast.success('Automação executada', { description: `A automação foi executada com sucesso.` });
      refetchLogs();
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error running automation:', error);
      toast.error('Erro', { description: 'Erro ao executar automação.' });
    } finally {
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

  if (loadingLogs || loadingSettings) {
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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Automações</h1>
          <p className="text-muted-foreground">Gerencie as automações do sistema</p>
        </div>
        <Button variant="outline" onClick={() => { refetchLogs(); refetchSettings(); }}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Atualizar
        </Button>
      </div>

      <Tabs defaultValue="automacoes" className="space-y-6">
        <TabsList>
          <TabsTrigger value="automacoes">Automações</TabsTrigger>
          <TabsTrigger value="logs">Logs de Execução</TabsTrigger>
        </TabsList>

        <TabsContent value="automacoes">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {AUTOMATIONS.map((automation) => {
              const setting = getSettingByKey(automation.key);
              const isActive = setting?.ativo ?? false;
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
                            {automation.description}
                          </CardDescription>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={isActive}
                          onCheckedChange={() => toggleAutomation(automation.key, isActive)}
                        />
                        <span className="text-sm text-muted-foreground">
                          {isActive ? 'Ativo' : 'Inativo'}
                        </span>
                      </div>
                      {automation.endpoint && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!isActive || isRunning[automation.key]}
                          onClick={() => runAutomation(automation.key, automation.endpoint)}
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
                        Atualizado: {format(new Date(setting.updated_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
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
              <CardDescription>Últimas execuções das automações</CardDescription>
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
                      <TableHead className="hidden md:table-cell">Processados</TableHead>
                      <TableHead className="hidden lg:table-cell">Duração</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
                          <p>Nenhum log de execução encontrado</p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      logs.slice(0, 50).map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="text-sm">
                            {format(new Date(log.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                          </TableCell>
                          <TableCell>{getTypeBadge(log.tipo)}</TableCell>
                          <TableCell className="font-medium">{log.nome}</TableCell>
                          <TableCell>{getStatusBadge(log.status)}</TableCell>
                          <TableCell className="hidden md:table-cell">
                            {log.registros_processados !== null && (
                              <span className="text-sm">
                                {log.registros_sucesso}/{log.registros_processados}
                                {log.registros_erro ? (
                                  <span className="text-destructive ml-1">({log.registros_erro} erros)</span>
                                ) : null}
                              </span>
                            )}
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
      </Tabs>
    </div>
  );
}
