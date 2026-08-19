import { useQuery } from '@tanstack/react-query';
import { Activity, Bot, Building2, Download, FileBarChart, Headphones, RefreshCw, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';

type Report = {
  generated_at: string;
  days: number;
  portfolio: { total_clinicas: number; ativas: number; trials: number; suspensas: number; em_risco: number; mrr: number; arr: number };
  growth: { novas_clinicas: number; novos_pacientes: number; agendamentos: number };
  support: { tickets: number; abertos: number; sla_vencido: number; horas_resolucao: number };
  ai: { chamadas: number; sucessos: number; taxa_sucesso: number; tokens: number; custo: number };
  top_clients: Array<{ clinica_id: string; clinica_nome: string; plano_nome: string | null; plano_valor: number | null; assinatura_status: string | null; total_pacientes: number; total_agendamentos: number; dias_sem_uso: number | null }>;
};

const moeda = (value: number) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function csvCell(value: unknown) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

export default function PlatformRelatorioExecutivo() {
  const periodo = Number(new URLSearchParams(location.search).get('dias') || 30);
  const report = useQuery({
    queryKey: ['platform-executive-report', periodo],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('platform_executive_report', { p_days: periodo });
      if (error) throw error;
      return data as Report;
    },
  });

  const mudarPeriodo = (value: string) => {
    const url = new URL(location.href);
    url.searchParams.set('dias', value);
    history.replaceState({}, '', url);
    location.reload();
  };

  const exportar = () => {
    if (!report.data) return;
    const d = report.data;
    const rows = [
      ['Métrica', 'Valor'], ['Período (dias)', d.days], ['MRR', d.portfolio.mrr], ['ARR', d.portfolio.arr],
      ['Clínicas ativas', d.portfolio.ativas], ['Trials', d.portfolio.trials], ['Clínicas em risco', d.portfolio.em_risco],
      ['Novas clínicas', d.growth.novas_clinicas], ['Novos pacientes', d.growth.novos_pacientes], ['Agendamentos', d.growth.agendamentos],
      ['Tickets', d.support.tickets], ['SLA vencido', d.support.sla_vencido], ['Chamadas IA', d.ai.chamadas], ['Taxa sucesso IA (%)', d.ai.taxa_sucesso],
      [], ['Clínica', 'Plano', 'Receita mensal', 'Pacientes', 'Agendamentos', 'Dias sem uso'],
      ...d.top_clients.map((c) => [c.clinica_nome, c.plano_nome, c.plano_valor, c.total_pacientes, c.total_agendamentos, c.dias_sem_uso]),
    ];
    const blob = new Blob([`\ufeff${rows.map((row) => row.map(csvCell).join(';')).join('\n')}`], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `relatorio-executivo-${d.days}d-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    toast.success('Relatório exportado');
  };

  const d = report.data;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="flex items-center gap-2 text-2xl font-bold"><FileBarChart /> Relatório Executivo</h1><p className="text-muted-foreground">Receita recorrente, crescimento, suporte, adoção e IA.</p></div>
        <div className="flex gap-2">
          <Select value={String(periodo)} onValueChange={mudarPeriodo}><SelectTrigger className="w-32" aria-label="Período do relatório"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="7">7 dias</SelectItem><SelectItem value="30">30 dias</SelectItem><SelectItem value="90">90 dias</SelectItem></SelectContent></Select>
          <Button variant="outline" onClick={() => report.refetch()}><RefreshCw className={`mr-2 h-4 w-4 ${report.isFetching ? 'animate-spin' : ''}`} />Atualizar</Button>
          <Button onClick={exportar} disabled={!d}><Download className="mr-2 h-4 w-4" />CSV</Button>
        </div>
      </div>

      <Card><CardHeader><CardTitle>Receita recorrente atual</CardTitle><CardDescription>Fotografia das assinaturas ativas; não representa faturamento reconhecido.</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric icon={TrendingUp} label="MRR" value={moeda(d?.portfolio.mrr || 0)} detail={`ARR ${moeda(d?.portfolio.arr || 0)}`} />
        <Metric icon={Building2} label="Clínicas ativas" value={d?.portfolio.ativas || 0} detail={`${d?.portfolio.trials || 0} em trial`} />
        <Metric icon={Activity} label="Clientes em risco" value={d?.portfolio.em_risco || 0} detail="14+ dias sem uso" alert={Boolean(d?.portfolio.em_risco)} />
        <Metric icon={Building2} label="Suspensas" value={d?.portfolio.suspensas || 0} detail={`${d?.portfolio.total_clinicas || 0} clínicas totais`} />
      </CardContent></Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="h-4 w-4" />Crescimento · {periodo} dias</CardTitle></CardHeader><CardContent className="space-y-2"><Line label="Novas clínicas" value={d?.growth.novas_clinicas || 0} /><Line label="Novos pacientes" value={d?.growth.novos_pacientes || 0} /><Line label="Agendamentos" value={d?.growth.agendamentos || 0} /></CardContent></Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Headphones className="h-4 w-4" />Suporte · {periodo} dias</CardTitle></CardHeader><CardContent className="space-y-2"><Line label="Tickets recebidos" value={d?.support.tickets || 0} /><Line label="Em aberto" value={d?.support.abertos || 0} /><Line label="SLA vencido" value={d?.support.sla_vencido || 0} alert={Boolean(d?.support.sla_vencido)} /><Line label="Tempo médio de resolução" value={`${d?.support.horas_resolucao || 0}h`} /></CardContent></Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Bot className="h-4 w-4" />IA · {periodo} dias</CardTitle></CardHeader><CardContent className="space-y-2"><Line label="Chamadas" value={d?.ai.chamadas || 0} /><Line label="Taxa de sucesso" value={`${d?.ai.taxa_sucesso || 0}%`} /><Line label="Tokens" value={(d?.ai.tokens || 0).toLocaleString('pt-BR')} /><Line label="Custo estimado" value={moeda(d?.ai.custo || 0)} /></CardContent></Card>
      </div>

      <Card><CardHeader><CardTitle>Clientes com maior uso acumulado</CardTitle><CardDescription>Ranking operacional atual, não uma série histórica do período.</CardDescription></CardHeader><CardContent className="space-y-2">
        {(d?.top_clients || []).map((client, index) => <div key={client.clinica_id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-6 sm:items-center"><span className="text-sm font-semibold">#{index + 1} {client.clinica_nome}</span><span className="text-xs">{client.plano_nome || 'Sem plano'}</span><span className="text-xs">{moeda(client.plano_valor || 0)}/mês</span><span className="text-xs">{client.total_pacientes} pacientes</span><span className="text-xs">{client.total_agendamentos} agendamentos</span><Badge variant={(client.dias_sem_uso || 0) >= 14 ? 'destructive' : 'outline'}>{client.dias_sem_uso == null ? 'Sem uso' : `${client.dias_sem_uso}d sem uso`}</Badge></div>)}
      </CardContent></Card>
      {d?.generated_at && <p className="text-right text-xs text-muted-foreground">Gerado em {new Date(d.generated_at).toLocaleString('pt-BR')}</p>}
    </div>
  );
}

function Metric({ icon: Icon, label, value, detail, alert = false }: { icon: typeof Activity; label: string; value: string | number; detail: string; alert?: boolean }) {
  return <div className="rounded-lg border p-3"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-4 w-4" />{label}</div><p className={alert ? 'mt-2 text-2xl font-bold text-destructive' : 'mt-2 text-2xl font-bold'}>{value}</p><p className="text-xs text-muted-foreground">{detail}</p></div>;
}
function Line({ label, value, alert = false }: { label: string; value: string | number; alert?: boolean }) {
  return <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-sm"><span>{label}</span><strong className={alert ? 'text-destructive' : ''}>{value}</strong></div>;
}
