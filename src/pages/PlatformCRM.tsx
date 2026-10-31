/**
 * CRM da plataforma — a visão de quem vende o EloLab, não de quem o usa.
 *
 * O Painel Admin e a tela de Clínicas mostram contagens: quantos pacientes,
 * quantos médicos. Servem para saber o tamanho de cada cliente. Não respondem
 * as perguntas de quem toca o negócio:
 *
 *   quem vence esta semana e precisa de contato agora
 *   quanto entra por mês
 *   quem parou de usar — sinal de cancelamento antes de ele acontecer
 *
 * Ordenado por vencimento porque é isso que tem prazo. Uma clínica parada há
 * 60 dias com assinatura em dia não precisa de ação hoje; uma que vence amanhã,
 * sim.
 *
 * Acesso: só o dono da plataforma. A rota barra, e a função do banco recusa por
 * conta própria — duas travas, porque esconder o menu não protege nada.
 */
import { useMemo, useState } from 'react';
import { formatDateInTimeZone } from '@/lib/datePreference';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { cn } from '@/lib/utils';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Building2, Search, Mail, Phone, TrendingUp, AlertTriangle, CalendarClock, Moon, CreditCard, RefreshCw,
} from 'lucide-react';

interface ClienteCRM {
  clinica_id: string;
  clinica_nome: string;
  cnpj: string | null;
  suspensa: boolean;
  cliente_desde: string;
  dono_nome: string | null;
  dono_email: string | null;
  dono_telefone: string | null;
  plano_nome: string | null;
  plano_valor: number | null;
  assinatura_status: string | null;
  em_trial: boolean;
  vence_em: string | null;
  dias_para_vencer: number | null;
  total_medicos: number;
  total_funcionarios: number;
  total_pacientes: number;
  total_agendamentos: number;
  ultima_atividade: string | null;
  dias_sem_uso: number | null;
}

const dinheiro = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const assinaturaLabel: Record<string, string> = {
  ativa: 'Ativa', trial: 'Em teste', pendente: 'Pendente', cancelada: 'Cancelada', expirada: 'Expirada',
};

function idadeDoCliente(desde: string) {
  const criado = new Date(desde).getTime();
  return Number.isFinite(criado) ? Math.max(0, Math.floor((Date.now() - criado) / 86_400_000)) : 0;
}

function dataValida(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'data indisponível' : formatDateInTimeZone(date);
}

function numeroWhatsApp(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits.length >= 12 && digits.length <= 13 && digits.startsWith('55') ? digits : null;
}

/** Dias até vencer, traduzido para o que a pessoa precisa decidir. */
function SinalVencimento({ dias, venceEm, status }: { dias: number | null; venceEm: string | null; status: string | null }) {
  if (status === 'cancelada') return <Badge variant="secondary" className="rounded-full">cancelada</Badge>;
  if (status === 'expirada') return <Badge variant="destructive" className="rounded-full">expirada</Badge>;
  if (dias === null) return <span className="text-muted-foreground text-sm">sem assinatura</span>;
  if (dias < 0) {
    const elapsedDays = venceEm ? (Date.now() - new Date(venceEm).getTime()) / 86_400_000 : Number.NaN;
    const label = !Number.isFinite(elapsedDays) ? `venceu há ${Math.abs(dias)}d` : elapsedDays < 1 ? 'venceu há menos de 1d' : `venceu há ${Math.floor(elapsedDays)}d`;
    return <Badge variant="destructive" className="gap-1 rounded-full"><AlertTriangle className="h-3 w-3" />{label}</Badge>;
  }
  if (dias === 0)
    return <Badge variant="destructive" className="gap-1 rounded-full"><CalendarClock className="h-3 w-3" />vence hoje</Badge>;
  if (dias <= 7)
    return <Badge className="gap-1 rounded-full border-warning/30 bg-warning/10 text-warning hover:bg-warning/10"><CalendarClock className="h-3 w-3" />vence em {dias}d</Badge>;
  return <span className="text-sm text-muted-foreground">em {dias} dias</span>;
}

/** Clínica que parou de usar cancela depois. O sinal vem antes do pedido. */
function SinalUso({ dias, idadeClienteDias, ultimaAtividade }: { dias: number | null; idadeClienteDias: number; ultimaAtividade: string | null }) {
  const detalheAtividade = ultimaAtividade
    ? `Último acesso ou registro: ${dataValida(ultimaAtividade)}`
    : null;
  const sinal = (() => {
  if (dias === null && idadeClienteDias < 30) return <span className="text-sm text-muted-foreground">sem atividade ainda · {idadeClienteDias}d de cliente</span>;
  if (dias === null) return <Badge variant="destructive" className="gap-1 rounded-full"><Moon className="h-3 w-3" />sem atividade desde o cadastro</Badge>;
  if (dias >= 30)
    return <Badge variant="destructive" className="gap-1 rounded-full"><Moon className="h-3 w-3" />{dias}d parada</Badge>;
  if (dias >= 14)
    return <Badge className="rounded-full border-warning/30 bg-warning/10 text-warning hover:bg-warning/10">{dias}d sem uso</Badge>;
  return <span className="text-sm text-muted-foreground">há {dias}d</span>;
  })();
  return <div className="space-y-1">{sinal}{dias !== null && dias >= 14 && detalheAtividade && <p className="text-[10px] text-muted-foreground">{detalheAtividade}</p>}</div>;
}

type FiltroCRM = 'todos' | 'pagantes' | 'vencendo' | 'vencidos' | 'paradas' | 'semAssinatura';

const ehPagante = (c: ClienteCRM) => c.assinatura_status === 'ativa' && !c.em_trial && !c.suspensa && (c.dias_para_vencer ?? -1) >= 0;
const ehVencendo = (c: ClienteCRM) => !['cancelada', 'expirada'].includes(c.assinatura_status || '') && (c.dias_para_vencer ?? 99) <= 7 && (c.dias_para_vencer ?? 99) >= 0;
const ehVencido = (c: ClienteCRM) => c.assinatura_status === 'expirada' || (c.assinatura_status !== 'cancelada' && (c.dias_para_vencer ?? 0) < 0);
// Ausência de atividade só indica risco após 30 dias de vida do cliente;
// onboarding recente não deve inflar a lista de risco de cancelamento.
const ehParada = (c: ClienteCRM) => (c.dias_sem_uso ?? idadeDoCliente(c.cliente_desde)) >= 30;
const FILTROS: Record<FiltroCRM, (c: ClienteCRM) => boolean> = {
  todos: () => true,
  pagantes: ehPagante,
  vencendo: ehVencendo,
  vencidos: ehVencido,
  paradas: ehParada,
  semAssinatura: (c) => c.assinatura_status === null,
};

export default function PlatformCRM() {
  const [searchParams] = useSearchParams();
  // A visão geral abre o CRM já filtrado por cliente (?busca=Nome).
  const [busca, setBusca] = useState(() => searchParams.get('busca') ?? '');
  const [filtro, setFiltro] = useState<FiltroCRM>('todos');

  const { data: clientes = [], isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['platform-crm'],
    queryFn: async (): Promise<ClienteCRM[]> => {
      const { data, error } = await (supabase as any).rpc('platform_crm_overview');
      if (error) throw error;
      return data ?? [];
    },
  });

  const resumo = useMemo(() => {
    // O valor do plano é preço de tabela, não confirmação de recebimento.
    // Exclui testes, suspensões e períodos vencidos para evitar inflar a soma.
    const ativos = clientes.filter(ehPagante);
    return {
      receitaMensal: ativos.reduce((s, c) => s + Number(c.plano_valor ?? 0), 0),
      pagantes: ativos.length,
      vencendo: clientes.filter(ehVencendo).length,
      vencidos: clientes.filter(ehVencido).length,
      paradas: clientes.filter(ehParada).length,
      semAssinatura: clientes.filter(FILTROS.semAssinatura).length,
    };
  }, [clientes]);

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const telefone = t.replace(/\D/g, '');
    const base = clientes.filter(FILTROS[filtro]);
    if (!t) return base;
    return base.filter(
      (c) =>
        c.clinica_nome?.toLowerCase().includes(t) ||
        c.dono_email?.toLowerCase().includes(t) ||
        c.dono_nome?.toLowerCase().includes(t) ||
        (telefone.length > 0 && (c.dono_telefone?.replace(/\D/g, '').includes(telefone) ?? false))
    );
  }, [clientes, busca, filtro]);
  const temFiltro = filtro !== 'todos' || busca.trim() !== '';
  const limparFiltros = () => { setFiltro('todos'); setBusca(''); };
  const alternar = (f: FiltroCRM) => setFiltro((atual) => (atual === f ? 'todos' : f));

  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 pb-10">
      <PageHeader
        title="CRM da plataforma"
        icon={<Building2 />}
        description={isLoading
          ? 'Suas clínicas clientes: receita, vencimentos e quem parou de usar.'
          : `${clientes.length} clínicas clientes · ${resumo.vencendo} vencendo em 7 dias · ${resumo.vencidos} vencidas · ${resumo.paradas} paradas há 30 dias+`}
        actions={<>
          <Button asChild variant="outline" className="rounded-full gap-2">
            <Link to="/admin/clinicas"><Building2 className="h-4 w-4" />Clínicas</Link>
          </Button>
          <Button asChild variant="outline" className="rounded-full gap-2">
            <Link to="/admin/cobrancas"><CreditCard className="h-4 w-4" />Cobranças</Link>
          </Button>
          <Button variant="outline" size="icon" className="rounded-full" onClick={() => void refetch()} disabled={isFetching} aria-label="Atualizar clientes">
            <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
          </Button>
        </>}
      />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4" aria-label="Indicadores do CRM">
        {([
          { key: 'pagantes', title: 'Soma dos valores cadastrados', value: dinheiro(resumo.receitaMensal), detail: `${resumo.pagantes} assinatura${resumo.pagantes === 1 ? '' : 's'} em dia, sem testes`, icon: TrendingUp, tone: '', destaque: true },
          { key: 'vencendo', title: 'Vencendo em 7 dias', value: resumo.vencendo, detail: 'contato antes de vencer', icon: CalendarClock, tone: 'bg-warning/10 text-warning', destaque: false },
          { key: 'vencidos', title: 'Já vencidas', value: resumo.vencidos, detail: 'bloqueiam após 7 dias de carência', icon: AlertTriangle, tone: 'bg-destructive/10 text-destructive', destaque: false },
          { key: 'paradas', title: 'Paradas há 30 dias+', value: resumo.paradas, detail: 'risco de cancelamento · inclui acessos e registros', icon: Moon, tone: 'bg-destructive/10 text-destructive', destaque: false },
        ] as const).map(({ key, title, value, detail, icon: Icon, tone, destaque }) => (
          <button
            key={key}
            type="button"
            aria-pressed={filtro === key}
            onClick={() => alternar(key)}
            className={cn(
              'rounded-2xl border p-4 text-left shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
              destaque ? 'border-transparent bg-gradient-primary text-white' : 'border-border/60 bg-card',
              filtro === key && (destaque ? 'ring-2 ring-primary/40 ring-offset-2' : 'border-primary ring-1 ring-primary/40'),
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className={cn('text-sm', destaque ? 'text-white/80' : 'text-muted-foreground')}>{title}</p>
                <p className="mt-1 text-2xl font-bold tabular-nums">{isLoading ? '…' : value}</p>
                <p className={cn('mt-0.5 text-[11px]', destaque ? 'text-white/70' : 'text-muted-foreground')}>{detail}</p>
              </div>
              <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', destaque ? 'bg-white/20 text-white' : tone)}>
                <Icon className="h-5 w-5" />
              </span>
            </div>
          </button>
        ))}
      </section>
      <p className="-mt-3 text-[11px] text-muted-foreground">
        Soma nominal dos planos ativos. Não confirma recebimentos nem converte ciclos trimestrais, semestrais ou anuais em valor mensal.
      </p>

      {resumo.semAssinatura > 0 && (
        <Card className="rounded-2xl border-warning/40 bg-warning/5 shadow-xs">
          <CardHeader className="flex flex-col gap-3 space-y-0 pb-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2 text-warning">
                <AlertTriangle className="h-4 w-4" />
                {resumo.semAssinatura} clínica{resumo.semAssinatura === 1 ? '' : 's'} sem assinatura registrada
              </CardTitle>
              <CardDescription className="mt-1.5">
                Usam o sistema e nunca são bloqueadas — a regra libera quem não tem registro de
                assinatura. Se a intenção é cobrar, elas precisam de um plano.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" className="shrink-0 rounded-full" aria-pressed={filtro === 'semAssinatura'} onClick={() => alternar('semAssinatura')}>
              {filtro === 'semAssinatura' ? 'Mostrar todas' : 'Ver na lista'}
            </Button>
          </CardHeader>
        </Card>
      )}

      <Card className="rounded-2xl border-border/60 shadow-xs">
        <CardHeader className="gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle>Clientes</CardTitle>
              <CardDescription>Ordenados por vencimento — o que tem prazo vem primeiro.</CardDescription>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar clínica, responsável, e-mail ou telefone"
                className="h-10 rounded-full pl-9 focus-visible:ring-primary"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {temFiltro && (
              <Button variant="outline" size="sm" className="h-8 rounded-full text-xs" onClick={limparFiltros}>Limpar filtros</Button>
            )}
            <span className="ml-auto text-xs text-muted-foreground tabular-nums">{visiveis.length} de {clientes.length}</span>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
            </div>
          ) : visiveis.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-md"><Building2 className="h-6 w-6" /></span>
              <p className="font-medium text-foreground">
                {busca ? `Nenhuma clínica encontrada para "${busca}".` : temFiltro ? 'Nenhuma clínica neste filtro.' : 'Nenhuma clínica cadastrada.'}
              </p>
              {temFiltro ? (
                <Button variant="outline" className="rounded-full" onClick={limparFiltros}>Limpar filtros</Button>
              ) : (
                <Button asChild className="rounded-full bg-gradient-primary text-white shadow-md hover:brightness-110"><Link to="/admin/onboarding">Ver onboarding</Link></Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Clínica</TableHead>
                    <TableHead>Contato</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Último uso</TableHead>
                    <TableHead className="text-right">Tamanho</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visiveis.map((c) => (
                    <TableRow key={c.clinica_id} className={c.suspensa ? 'opacity-60' : undefined}>
                      <TableCell>
                        <div className="font-medium flex items-center gap-2">
                          {c.clinica_nome}
                          {c.suspensa && <Badge variant="destructive" className="rounded-full text-xs">suspensa</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          cliente desde {dataValida(c.cliente_desde)}
                        </div>
                      </TableCell>

                      <TableCell>
                        {c.dono_email || c.dono_nome || c.dono_telefone ? (
                          <div className="space-y-0.5">
                            <div className="text-sm">{c.dono_nome ?? '—'}</div>
                            {c.dono_email && <a
                              href={`mailto:${c.dono_email}`}
                              className="text-xs text-primary hover:underline flex items-center gap-1"
                            >
                              <Mail className="h-3 w-3" />{c.dono_email}
                            </a>}
                            {c.dono_telefone && numeroWhatsApp(c.dono_telefone) && (
                              <a
                                href={`https://wa.me/${numeroWhatsApp(c.dono_telefone)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-primary hover:underline flex items-center gap-1"
                              >
                                <Phone className="h-3 w-3" />{c.dono_telefone}
                              </a>
                            )}
                            {c.dono_telefone && !numeroWhatsApp(c.dono_telefone) && <span className="text-xs text-muted-foreground">{c.dono_telefone}</span>}
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">sem dono definido</span>
                        )}
                      </TableCell>

                      <TableCell>
                        {c.plano_nome ? (
                          <div>
                            <div className="flex flex-wrap items-center gap-1 text-sm">{c.plano_nome}{c.assinatura_status && <Badge variant={c.assinatura_status === 'ativa' ? 'outline' : c.assinatura_status === 'cancelada' || c.assinatura_status === 'expirada' ? 'destructive' : 'secondary'} className="rounded-full">{assinaturaLabel[c.assinatura_status] || c.assinatura_status}</Badge>}</div>
                            <div className="text-xs text-muted-foreground">
                              {c.plano_valor !== null ? `${dinheiro(Number(c.plano_valor))} · valor cadastrado` : 'valor não informado'}
                              {c.em_trial && ' · teste'}
                            </div>
                          </div>
                        ) : c.assinatura_status ? (
                          <Badge variant={c.assinatura_status === 'cancelada' || c.assinatura_status === 'expirada' ? 'destructive' : 'secondary'} className="rounded-full">{assinaturaLabel[c.assinatura_status] || c.assinatura_status}</Badge>
                        ) : <span className="text-sm text-muted-foreground">sem plano</span>}
                      </TableCell>

                      <TableCell><SinalVencimento dias={c.dias_para_vencer} venceEm={c.vence_em} status={c.assinatura_status} /></TableCell>
                      <TableCell><SinalUso dias={c.dias_sem_uso} idadeClienteDias={idadeDoCliente(c.cliente_desde)} ultimaAtividade={c.ultima_atividade} /></TableCell>

                      <TableCell className="text-right text-sm text-muted-foreground whitespace-nowrap">
                        {c.total_pacientes} pac · {c.total_medicos} méd
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
