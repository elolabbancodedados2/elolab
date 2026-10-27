import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Activity, ArrowRight, Bot, Building2, CalendarClock, Download, FileBarChart, Headphones, RefreshCw, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

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
  const raw = String(value ?? '');
  const safe = /^\s*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

export default function PlatformRelatorioExecutivo() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedPeriod = Number(searchParams.get('dias'));
  const periodo = [7, 30, 90].includes(requestedPeriod) ? requestedPeriod : 30;
  const report = useQuery({
    queryKey: ['platform-executive-report', periodo],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('platform_executive_report', { p_days: periodo });
      if (error) throw error;
      return data as Report;
    },
  });

  const mudarPeriodo = (value: string) => setSearchParams((current) => {
    const next = new URLSearchParams(current);
    next.set('dias', value);
    return next;
  }, { replace: true });

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
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    toast.success('Relatório exportado');
  };

  const d = report.data;
  const descricao = d
    ? `${d.portfolio.ativas} clínicas pagas ativas · MRR ${moeda(d.portfolio.mrr)} · ${d.portfolio.em_risco} em risco · últimos ${periodo} dias`
    : 'Receita recorrente, crescimento, suporte, adoção e IA.';

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 pb-10">
      <PageHeader
        title="Relatório Executivo"
        icon={<FileBarChart />}
        description={descricao}
        actions={<>
          <Select value={String(periodo)} onValueChange={mudarPeriodo}>
            <SelectTrigger className="h-10 w-32 rounded-full" aria-label="Período do relatório"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="7">7 dias</SelectItem><SelectItem value="30">30 dias</SelectItem><SelectItem value="90">90 dias</SelectItem></SelectContent>
          </Select>
          <Button type="button" variant="outline" size="icon" className="rounded-full" onClick={() => void report.refetch()} disabled={report.isFetching} aria-label="Atualizar dados">
            <RefreshCw className={cn('h-4 w-4', report.isFetching && 'animate-spin')} />
          </Button>
          <Button asChild variant="outline" className="gap-2 rounded-full">
            <Link to="/admin/relatorios-agendados"><CalendarClock className="h-4 w-4" />Agendar envio</Link>
          </Button>
          <Button onClick={exportar} disabled={!d || report.isFetching} className="gap-2 rounded-full">
            <Download className="h-4 w-4" />CSV
          </Button>
        </>}
      />

      {report.isError ? <ErrorState error={report.error} onRetry={() => { void report.refetch(); }} /> : report.isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-32 rounded-2xl" />)}</div>
          <div className="grid gap-4 lg:grid-cols-3">{[1, 2, 3].map((item) => <Skeleton key={item} className="h-52 rounded-2xl" />)}</div>
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      ) : null}

      {!report.isLoading && !report.isError && <>
        <section aria-labelledby="receita-title" className="space-y-3">
          <div>
            <h2 id="receita-title" className="text-base font-semibold">Receita recorrente atual</h2>
            <p className="text-xs text-muted-foreground">Fotografia estimada das assinaturas válidas; não representa faturamento reconhecido nem recebimentos.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric icon={TrendingUp} label="MRR" value={moeda(d?.portfolio.mrr || 0)} detail={`ARR ${moeda(d?.portfolio.arr || 0)}`} href="/admin/cobrancas" highlight />
            <Metric icon={Building2} label="Clínicas pagas ativas" value={d?.portfolio.ativas || 0} detail={`${d?.portfolio.trials || 0} em trial válido`} href="/admin/crm" />
            <Metric icon={Activity} label="Clientes em risco" value={d?.portfolio.em_risco || 0} detail="14+ dias sem uso" href="/admin/crm" alert={Boolean(d?.portfolio.em_risco)} />
            <Metric icon={Building2} label="Suspensas" value={d?.portfolio.suspensas || 0} detail={`${d?.portfolio.total_clinicas || 0} clínicas totais`} href="/admin/clinicas" />
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-3">
          <Section icon={TrendingUp} title={`Crescimento · ${periodo} dias`} href="/admin/onboarding" linkLabel="Ver onboarding">
            <Line label="Novas clínicas" value={d?.growth.novas_clinicas || 0} />
            <Line label="Novos pacientes" value={d?.growth.novos_pacientes || 0} />
            <Line label="Agendamentos" value={d?.growth.agendamentos || 0} />
          </Section>
          <Section icon={Headphones} title={`Suporte · ${periodo} dias`} href="/admin/suporte" linkLabel="Abrir suporte">
            <Line label="Tickets recebidos" value={d?.support.tickets || 0} />
            <Line label="Em aberto" value={d?.support.abertos || 0} />
            <Line label="SLA vencido" value={d?.support.sla_vencido || 0} alert={Boolean(d?.support.sla_vencido)} />
            <Line label="Tempo médio de resolução" value={`${d?.support.horas_resolucao || 0}h`} />
          </Section>
          <Section icon={Bot} title={`IA · ${periodo} dias`} href="/admin/ia" linkLabel="Governança da IA">
            <Line label="Chamadas" value={d?.ai.chamadas || 0} />
            <Line label="Taxa de sucesso" value={`${d?.ai.taxa_sucesso || 0}%`} />
            <Line label="Tokens" value={(d?.ai.tokens || 0).toLocaleString('pt-BR')} />
            <Line label="Custo estimado" value={moeda(d?.ai.custo || 0)} />
          </Section>
        </div>

        <Card className="rounded-2xl border-border/60 shadow-xs">
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
            <div>
              <CardTitle>Clientes com maior uso acumulado</CardTitle>
              <CardDescription>Ranking operacional atual, não uma série histórica do período.</CardDescription>
            </div>
            <Button asChild variant="outline" size="sm" className="rounded-full"><Link to="/admin/crm">Ver clientes</Link></Button>
          </CardHeader>
          <CardContent>
            {d?.top_clients.length ? (
              <div className="overflow-x-auto rounded-xl border border-border/60">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-[#F3F8FC] text-left text-xs text-muted-foreground">
                    <tr><th className="px-3 py-2 font-medium">Clínica</th><th className="px-3 py-2 font-medium">Plano</th><th className="px-3 py-2 text-right font-medium">Receita mensal</th><th className="px-3 py-2 text-right font-medium">Pacientes</th><th className="px-3 py-2 text-right font-medium">Agendamentos</th><th className="px-3 py-2 font-medium">Uso</th></tr>
                  </thead>
                  <tbody>
                    {d.top_clients.map((client, index) => (
                      <tr key={client.clinica_id} className="border-t border-border/60 hover:bg-muted/40">
                        <td className="px-3 py-2">
                          <Link to={`/admin/crm?busca=${encodeURIComponent(client.clinica_nome)}`} className="flex items-center gap-2 font-medium hover:text-[#1080CA]">
                            <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold', index === 0 ? 'bg-gradient-primary text-white' : 'bg-muted')}>{index + 1}</span>
                            {client.clinica_nome}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{client.plano_nome || 'Sem plano'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{moeda(client.plano_valor || 0)}/mês</td>
                        <td className="px-3 py-2 text-right tabular-nums">{client.total_pacientes}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{client.total_agendamentos}</td>
                        <td className="px-3 py-2"><Badge variant={(client.dias_sem_uso || 0) >= 14 ? 'destructive' : 'outline'} className="rounded-full">{client.dias_sem_uso == null ? 'Sem uso' : `${client.dias_sem_uso}d sem uso`}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex flex-col items-center py-10 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-md"><Building2 className="h-6 w-6" /></span>
                <p className="mt-3 font-medium text-foreground">Ainda não há uso acumulado</p>
                <p className="mt-1 text-sm text-muted-foreground">O ranking aparece quando as clínicas começarem a cadastrar pacientes e agendamentos.</p>
                <Button asChild className="mt-4 rounded-full bg-gradient-primary text-white shadow-md hover:brightness-110"><Link to="/admin/onboarding">Acompanhar onboarding</Link></Button>
              </div>
            )}
          </CardContent>
        </Card>
        {d?.generated_at && <p className="text-right text-xs text-muted-foreground">Gerado em {new Date(d.generated_at).toLocaleString('pt-BR')}</p>}
      </>}
    </main>
  );
}

function Metric({ icon: Icon, label, value, detail, href, alert = false, highlight = false }: { icon: typeof Activity; label: string; value: string | number; detail: string; href: string; alert?: boolean; highlight?: boolean }) {
  return (
    <Link to={href} className="group rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <div className={cn(
        'h-full rounded-2xl border border-border/60 bg-card p-4 shadow-xs transition-all group-hover:-translate-y-0.5 group-hover:shadow-md',
        highlight && 'border-transparent bg-gradient-primary text-white',
        alert && !highlight && 'border-warning/40',
      )}>
        <span className={cn('flex h-10 w-10 items-center justify-center rounded-xl', highlight ? 'bg-white/20 text-white' : alert ? 'bg-warning/10 text-warning' : 'bg-[#1080CA]/10 text-[#1080CA]')}><Icon className="h-5 w-5" /></span>
        <p className={cn('mt-3 text-xs font-medium', highlight ? 'text-white/80' : 'text-muted-foreground')}>{label}</p>
        <p className={cn('mt-1 break-words text-2xl font-bold tracking-tight tabular-nums', alert && !highlight && 'text-warning')}>{value}</p>
        <p className={cn('text-[11px]', highlight ? 'text-white/70' : 'text-muted-foreground')}>{detail}</p>
      </div>
    </Link>
  );
}

function Section({ icon: Icon, title, href, linkLabel, children }: { icon: typeof Activity; title: string; href: string; linkLabel: string; children: ReactNode }) {
  return (
    <Card className="flex flex-col rounded-2xl border-border/60 shadow-xs">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-primary text-white"><Icon className="h-4 w-4" /></span>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-2">
        {children}
        <Link to={href} className="mt-auto inline-flex items-center gap-1 pt-2 text-xs font-medium text-[#1080CA] hover:underline">{linkLabel}<ArrowRight className="h-3.5 w-3.5" /></Link>
      </CardContent>
    </Card>
  );
}

function Line({ label, value, alert = false }: { label: string; value: string | number; alert?: boolean }) {
  return <div className="flex items-center justify-between rounded-xl bg-[#F3F8FC] px-3 py-2 text-sm"><span>{label}</span><strong className={cn('tabular-nums', alert && 'text-destructive')}>{value}</strong></div>;
}
