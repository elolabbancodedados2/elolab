import { useQuery } from '@tanstack/react-query';
import { Link, Navigate } from 'react-router-dom';
import {
  Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Building2, CreditCard,
  Headset, MessageSquareText, RefreshCw, Shield, Users, Wallet,
} from 'lucide-react';

import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { ErrorState } from '@/components/ErrorState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

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
      const { data, error } = await (supabase as any).rpc('platform_executive_report', { p_days: 30 });
      if (error) throw error;
      return data as ExecutiveReport;
    },
    staleTime: 60_000,
  });

  if (!isPlatformAdmin) return <Navigate to="/dashboard" replace />;

  const data = report.data;
  const metrics = [
    { title: 'Receita mensal recorrente', value: data ? dinheiro(data.portfolio.mrr) : '—', detail: 'estimativa das assinaturas ativas', icon: Wallet, href: '/admin/cobrancas' },
    { title: 'Clientes ativos', value: data?.portfolio.ativas ?? '—', detail: `${data?.portfolio.trials ?? '—'} em período de avaliação`, icon: Building2, href: '/admin/crm' },
    { title: 'Novos clientes', value: data?.growth.novas_clinicas ?? '—', detail: 'nos últimos 30 dias', icon: ArrowUpRight, href: '/admin/onboarding' },
    { title: 'Clientes que precisam de atenção', value: data?.portfolio.em_risco ?? '—', detail: 'sem atividade recente no app', icon: ArrowDownRight, href: '/admin/crm', alert: Boolean(data?.portfolio.em_risco) },
  ];

  return (
    <main className="mx-auto w-full max-w-7xl space-y-8 pb-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
            <Shield className="h-4 w-4" /> Gestão EloLab
          </div>
          <h1 className="text-3xl font-bold tracking-tight">{saudacao}{profile?.nome ? `, ${profile.nome.split(' ')[0]}` : ''}</h1>
          <p className="mt-1 text-muted-foreground">Aqui está o que precisa da sua atenção na plataforma.</p>
        </div>
        <Button variant="outline" onClick={() => void report.refetch()} disabled={report.isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${report.isFetching ? 'animate-spin' : ''}`} /> Atualizar dados
        </Button>
      </header>

      {report.isError && <ErrorState error={report.error} onRetry={() => void report.refetch()} />}

      {!profile?.clinica_id && (
        <Card className="border-warning/50 bg-warning/5">
          <CardContent className="flex items-start gap-3 p-4">
            <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <div>
              <p className="font-medium">Acesso ao app clínico pendente</p>
              <p className="mt-1 text-sm text-muted-foreground">O perfil da conta proprietária ainda não está vinculado à clínica interna do EloLab. O botão App ficará disponível assim que esse vínculo for concluído.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {report.isLoading ? (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Carregando indicadores">
          {[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-32 rounded-xl" />)}
        </section>
      ) : data && (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores da plataforma">
          {metrics.map(({ title, value, detail, icon: Icon, href, alert }) => (
            <Link key={title} to={href} className="group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl">
              <Card className={`h-full transition-colors group-hover:border-primary/40 ${alert ? 'border-warning/40' : ''}`}>
                <CardContent className="flex items-start justify-between gap-3 p-5">
                  <div>
                    <p className="text-sm text-muted-foreground">{title}</p>
                    <p className={`mt-2 text-3xl font-semibold tracking-tight ${alert ? 'text-warning' : ''}`}>{value}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
                  </div>
                  <span className="rounded-lg bg-primary/10 p-2.5 text-primary"><Icon className="h-5 w-5" /></span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </section>
      )}

      <section aria-labelledby="acoes-title">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h2 id="acoes-title" className="text-xl font-semibold">O que você quer resolver?</h2>
            <p className="mt-1 text-sm text-muted-foreground">Acesse as áreas principais da operação do EloLab.</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {atalhos.map(({ title, description, href, icon: Icon }) => (
            <Link key={title} to={href} className="group rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Card className="h-full transition-all group-hover:-translate-y-0.5 group-hover:border-primary/40 group-hover:shadow-sm">
                <CardContent className="flex items-start gap-4 p-5">
                  <span className="rounded-lg bg-muted p-2.5 text-foreground"><Icon className="h-5 w-5" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-semibold">{title}</h3>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" />
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{description}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {data && (
        <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
              <div><CardTitle>Clientes em destaque</CardTitle><CardDescription>Atividade recente e situação da carteira.</CardDescription></div>
              <Button asChild variant="outline" size="sm"><Link to="/admin/crm">Ver clientes</Link></Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.top_clients.slice(0, 5).map((client) => {
                const semUso = client.dias_sem_uso === null || client.dias_sem_uso >= 14;
                return (
                  <Link key={client.clinica_id} to={`/admin/crm?busca=${encodeURIComponent(client.clinica_nome)}`} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/40">
                    <div className="min-w-0"><p className="truncate font-medium">{client.clinica_nome}</p><p className="text-xs text-muted-foreground">{client.plano_nome || 'Sem plano'} · {client.total_pacientes} pacientes</p></div>
                    <div className="flex items-center gap-3"><span className="text-sm text-muted-foreground">{client.dias_sem_uso === null ? 'Sem atividade' : semUso ? `${client.dias_sem_uso} dias sem uso` : `Ativa há ${client.dias_sem_uso} dias`}</span><Badge variant={semUso ? 'secondary' : 'outline'}>{semUso ? 'Acompanhar' : 'Ativa'}</Badge></div>
                  </Link>
                );
              })}
              {data.top_clients.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Ainda não há atividade suficiente para mostrar clientes.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Atendimento ao cliente</CardTitle><CardDescription>Solicitações que precisam de acompanhamento.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between rounded-lg bg-muted/40 p-4"><div><p className="text-sm text-muted-foreground">Solicitações em aberto</p><p className="mt-1 text-2xl font-semibold">{data.support.abertos}</p></div><Headset className="h-5 w-5 text-primary" /></div>
              <div className="flex items-center justify-between rounded-lg bg-muted/40 p-4"><div><p className="text-sm text-muted-foreground">Fora do prazo de resposta</p><p className="mt-1 text-2xl font-semibold">{data.support.sla_vencido}</p></div><Badge variant={data.support.sla_vencido ? 'destructive' : 'outline'}>{data.support.sla_vencido ? 'Prioridade' : 'Em dia'}</Badge></div>
              <Button asChild className="w-full"><Link to="/admin/suporte">Abrir central de suporte<ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
            </CardContent>
          </Card>
        </div>
      )}

      {data?.generated_at && <p className="text-right text-xs text-muted-foreground">Dados atualizados {new Date(data.generated_at).toLocaleString('pt-BR')}</p>}
    </main>
  );
}
