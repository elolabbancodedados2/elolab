import { useQuery } from '@tanstack/react-query';
import { Link, Navigate } from 'react-router-dom';
import {
  Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Building2, CreditCard,
  Headset, MessageSquareText, RefreshCw, Shield, Users, Wallet,
} from 'lucide-react';

import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PlatformRuntimeStatus } from '@/components/admin/PlatformRuntimeStatus';
import { cn } from '@/lib/utils';

type ExecutiveReport = {
  generated_at: string;
  days: number;
  portfolio: {
    total_clinicas: number;
    ativas: number;
    trials: number;
    suspensas: number;
    em_risco: number;
    mrr: number;
    arr: number;
  };
  growth: { novas_clinicas: number; novos_pacientes: number; agendamentos: number };
  support: { tickets: number; abertos: number; sla_vencido: number; horas_resolucao: number };
  top_clients: Array<{
    clinica_id: string;
    clinica_nome: string;
    plano_nome: string | null;
    plano_valor: number | null;
    assinatura_status: string | null;
    total_pacientes: number;
    total_agendamentos: number;
    dias_sem_uso: number | null;
  }>;
};

const dinheiro = (valor: number) => Number(valor || 0).toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

const atalhos = [
  { title: 'Clientes e clínicas', description: 'Acompanhe a carteira, os planos e o uso de cada cliente.', href: '/admin/crm', icon: Building2 },
  { title: 'Contas e acessos', description: 'Localize usuários e ajude clientes com acesso ao EloLab.', href: '/usuarios', icon: Users },
  { title: 'Cobranças', description: 'Consulte assinaturas, pagamentos e pendências.', href: '/admin/cobrancas', icon: CreditCard },
  { title: 'Atendimento', description: 'Responda solicitações e acompanhe a fila de suporte.', href: '/admin/suporte', icon: Headset },
  { title: 'Comunicados', description: 'Publique avisos para clientes do produto.', href: '/admin/comunicacao', icon: MessageSquareText },
  { title: 'Desempenho do negócio', description: 'Veja crescimento, receita e adoção do app.', href: '/admin/relatorio-executivo', icon: Activity },
];

export default function PainelAdmin() {
  const { profile, isPlatformAdmin } = useSupabaseAuth();
  const hora = new Date().getHours();
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
  const report = useQuery({
    queryKey: ['platform-owner-dashboard', 30],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('platform_executive_report', { p_days: 30 });
      if (error) throw error;
      return data as ExecutiveReport;
    },
    staleTime: 60_000,
  });

  if (!isPlatformAdmin) return <Navigate to="/dashboard" replace />;

  const data = report.data;
  const metrics = [
    { title: 'Receita mensal recorrente', value: data ? dinheiro(data.portfolio.mrr) : '—', detail: 'estimativa das assinaturas ativas', icon: Wallet, href: '/admin/cobrancas', dark: true },
    { title: 'Clientes ativos', value: data?.portfolio.ativas ?? '—', detail: `${data?.portfolio.trials ?? '—'} em período de avaliação`, icon: Building2, href: '/admin/crm' },
    { title: 'Novos clientes', value: data?.growth.novas_clinicas ?? '—', detail: 'nos últimos 30 dias', icon: ArrowUpRight, href: '/admin/onboarding' },
    { title: 'Clientes que precisam de atenção', value: data?.portfolio.em_risco ?? '—', detail: 'sem atividade recente no app', icon: ArrowDownRight, href: '/admin/crm', alert: Boolean(data?.portfolio.em_risco) },
  ];
  const descricao = data
    ? `${data.portfolio.ativas} clientes ativos · ${data.portfolio.em_risco} precisam de atenção · ${data.support.abertos} solicitações de suporte em aberto`
    : 'Aqui está o que precisa da sua atenção na plataforma.';

  return (
    <main className="mx-auto w-full max-w-7xl space-y-8 pb-10">
      <PageHeader
        title="Visão geral"
        icon={<Shield />}
        description={`${saudacao}${profile?.nome ? `, ${profile.nome.split(' ')[0]}` : ''} — ${descricao}`}
        actions={
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="rounded-full"
            onClick={() => void report.refetch()}
            disabled={report.isFetching}
            aria-label="Atualizar dados"
          >
            <RefreshCw className={cn('h-4 w-4', report.isFetching && 'animate-spin')} />
          </Button>
        }
      />

      {report.isError && <ErrorState error={report.error} onRetry={() => void report.refetch()} />}

      {!profile?.clinica_id && (
        <Card className="rounded-2xl border-warning/50 bg-warning/5 shadow-xs">
          <CardContent className="flex items-start gap-3 p-4">
            <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <div>
              <p className="font-medium">Acesso ao app clínico pendente</p>
              <p className="mt-1 text-sm text-muted-foreground">O perfil da conta proprietária ainda não está vinculado à clínica interna do EloLab. O botão App ficará disponível assim que esse vínculo for concluído.</p>
            </div>
          </CardContent>
        </Card>
      )}

      <PlatformRuntimeStatus />

      {report.isLoading ? (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Carregando indicadores">
          {[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-32 rounded-2xl" />)}
        </section>
      ) : data && (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores da plataforma">
          {metrics.map(({ title, value, detail, icon: Icon, href, alert, dark }) => (
            <Link key={title} to={href} className="group rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Card
                className={cn(
                  'h-full rounded-2xl border-border/60 shadow-xs transition-all group-hover:-translate-y-0.5 group-hover:shadow-md',
                  dark && 'border-transparent bg-gradient-primary text-white',
                  alert && !dark && 'border-warning/40',
                )}
              >
                <CardContent className="flex items-start justify-between gap-3 p-5">
                  <div>
                    <p className={cn('text-sm', dark ? 'text-white/70' : 'text-muted-foreground')}>{title}</p>
                    <p className={cn(
                      'mt-2 text-3xl font-bold tracking-tight tabular-nums',
                      dark && 'text-white',
                      alert && !dark && 'text-warning',
                    )}>{value}</p>
                    <p className={cn('mt-1 text-xs', dark ? 'text-white/60' : 'text-muted-foreground')}>{detail}</p>
                  </div>
                  <span className={cn('rounded-xl p-2.5', dark ? 'bg-white/20 text-white' : 'bg-primary/10 text-primary')}>
                    <Icon className="h-5 w-5" />
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </section>
      )}

      <section aria-labelledby="acoes-title">
        <div className="mb-4">
          <h2 id="acoes-title" className="text-xl font-semibold">O que você quer resolver?</h2>
          <p className="mt-1 text-sm text-muted-foreground">Acesse as áreas principais da operação do EloLab.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {atalhos.map(({ title, href, icon: Icon }) => (
            <Link
              key={title}
              to={href}
              className="group inline-flex items-center gap-2 rounded-full border border-border/60 bg-card px-4 py-2 text-sm font-medium shadow-xs transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Icon className="h-4 w-4" />
              {title}
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          ))}
        </div>
      </section>

      {data && (
        <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
          <Card className="rounded-2xl border-border/60 shadow-xs">
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
              <div><CardTitle>Clientes em destaque</CardTitle><CardDescription>Atividade recente e situação da carteira.</CardDescription></div>
              <Button asChild variant="outline" size="sm" className="rounded-full"><Link to="/admin/crm">Ver clientes</Link></Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.top_clients.slice(0, 5).map((client) => {
                const semUso = client.dias_sem_uso === null || client.dias_sem_uso >= 14;
                return (
                  <Link key={client.clinica_id} to={`/admin/crm?busca=${encodeURIComponent(client.clinica_nome)}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 p-3 transition-colors hover:border-primary/30 hover:bg-muted/40">
                    <div className="min-w-0"><p className="truncate font-medium">{client.clinica_nome}</p><p className="text-xs text-muted-foreground">{client.plano_nome || 'Sem plano'} · {client.total_pacientes} pacientes</p></div>
                    <div className="flex items-center gap-3"><span className="text-sm text-muted-foreground">{client.dias_sem_uso === null ? 'Sem atividade' : semUso ? `${client.dias_sem_uso} dias sem uso` : `Ativa há ${client.dias_sem_uso} dias`}</span><Badge variant={semUso ? 'secondary' : 'outline'} className="rounded-full">{semUso ? 'Acompanhar' : 'Ativa'}</Badge></div>
                  </Link>
                );
              })}
              {data.top_clients.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Ainda não há atividade suficiente para mostrar clientes.</p>}
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border/60 shadow-xs">
            <CardHeader><CardTitle>Atendimento ao cliente</CardTitle><CardDescription>Solicitações que precisam de acompanhamento.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between rounded-xl bg-muted/40 p-4"><div><p className="text-sm text-muted-foreground">Solicitações em aberto</p><p className="mt-1 text-2xl font-semibold tabular-nums">{data.support.abertos}</p></div><Headset className="h-5 w-5 text-primary" /></div>
              <div className="flex items-center justify-between rounded-xl bg-muted/40 p-4"><div><p className="text-sm text-muted-foreground">Fora do prazo de resposta</p><p className="mt-1 text-2xl font-semibold tabular-nums">{data.support.sla_vencido}</p></div><Badge variant={data.support.sla_vencido ? 'destructive' : 'outline'} className="rounded-full">{data.support.sla_vencido ? 'Prioridade' : 'Em dia'}</Badge></div>
              <Button asChild className="w-full rounded-full bg-gradient-primary text-white shadow-[0_4px_12px_rgba(16,128,202,0.35)] hover:brightness-110"><Link to="/admin/suporte">Abrir central de suporte<ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
            </CardContent>
          </Card>
        </div>
      )}

      {data?.generated_at && <p className="text-right text-xs text-muted-foreground">Dados atualizados {new Date(data.generated_at).toLocaleString('pt-BR')}</p>}
    </main>
  );
}
