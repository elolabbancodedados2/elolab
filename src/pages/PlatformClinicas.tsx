import { useState, useMemo, useRef, useEffect } from 'react';
import { formatDateInTimeZone } from '@/lib/datePreference';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Link, Navigate } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ErrorState';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Building2, Search, Users, Stethoscope, CalendarRange, RefreshCw, Crown, LogIn, Mail, AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, Hourglass, Archive, CreditCard } from 'lucide-react';
import { toast } from 'sonner';
import { AcoesDaClinica } from '@/components/plataforma/AcoesDaClinica';
import { LogDeAcessos } from '@/components/plataforma/LogDeAcessos';
import { useNavigate } from 'react-router-dom';
import { usePlatformRealtime } from '@/hooks/usePlatformRealtime';

interface ClinicaOverview {
  clinica_id: string;
  clinica_nome: string;
  owner_id: string | null;
  owner_nome: string | null;
  owner_email: string | null;
  created_at: string;
  suspensa: boolean;
  plano_slug: string | null;
  plano_nome: string | null;
  assinatura_status: string | null;
  em_trial: boolean | null;
  trial_fim: string | null;
  data_fim: string | null;
  total_medicos: number;
  total_funcionarios: number;
  total_pacientes: number;
  total_agendamentos: number;
  arquivada?: boolean;
  arquivada_em?: string | null;
  arquivada_motivo?: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  ativa: 'bg-success/10 text-success border-success/20',
  trial: 'bg-info/10 text-info border-info/20',
  expirada: 'bg-warning/10 text-warning border-warning/20',
  cancelada: 'bg-destructive/10 text-destructive border-destructive/20',
  pendente: 'bg-warning/10 text-warning border-warning/20',
};
const STATUS_LABELS: Record<string, string> = {
  ativa: 'Ativa', trial: 'Em teste', expirada: 'Expirada', cancelada: 'Cancelada', pendente: 'Pendente',
};

type FiltroStatus = 'todas' | 'ativas' | 'trial' | 'suspensas';

function dentroDaValidade(clinica: ClinicaOverview, agora: number) {
  const fim = clinica.data_fim || clinica.trial_fim;
  return !fim || new Date(fim).getTime() >= agora;
}

function passaNoFiltro(c: ClinicaOverview, filtro: FiltroStatus, agora: number) {
  if (filtro === 'ativas') return !c.arquivada && !c.suspensa && c.assinatura_status === 'ativa' && !c.em_trial && dentroDaValidade(c, agora);
  if (filtro === 'trial') return !c.arquivada && !c.suspensa && (c.assinatura_status === 'trial' || !!c.em_trial) && dentroDaValidade(c, agora);
  if (filtro === 'suspensas') return c.suspensa;
  return true;
}

function dataFormatada(value: string | null) {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Data indisponível' : formatDateInTimeZone(parsed);
}

function dataHoraFormatada(value: string | null) {
  if (!value) return 'Data indisponível';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? 'Data indisponível'
    : parsed.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
}

export default function PlatformClinicas() {
  const { isPlatformAdmin, isLoading: authLoading, refreshProfile } = useSupabaseAuth();
  const [search, setSearch] = useState('');
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<{ id: string; nome: string } | null>(null);
  const [motivo, setMotivo] = useState('');
  const [mostrarArquivadas, setMostrarArquivadas] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>('todas');
  const [paginaOrfaos, setPaginaOrfaos] = useState(0);
  const impersonationLock = useRef(false);
  const reconcileLock = useRef(false);
  const resendLock = useRef(false);
  const navigate = useNavigate();
  usePlatformRealtime(isPlatformAdmin);

  /**
   * Entrar numa clínica é ver o prontuário de paciente de um cliente. O motivo
   * é gravado em `platform_impersonation_log` e é o que transforma o registro
   * em rastro de verdade — sem ele toda linha do log fica igual.
   */
  const handleImpersonate = async () => {
    if (impersonationLock.current || !alvo) return;
    if (motivo.trim().length < 5) {
      toast.error('Descreva o motivo do acesso', {
        description: 'Fica registrado no log de auditoria da plataforma.',
      });
      return;
    }
    impersonationLock.current = true;
    setImpersonatingId(alvo.id);
    try {
      const { error } = await (supabase as any).rpc('platform_start_impersonation', {
        _target_clinica_id: alvo.id,
        _motivo: motivo.trim(),
      });
      if (error) throw error;
      await refreshProfile();
      setAlvo(null);
      setMotivo('');
      toast.success(`Entrando como ${alvo.nome}`);
      navigate('/dashboard');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao impersonar clínica');
    } finally {
      impersonationLock.current = false;
      setImpersonatingId(null);
    }
  };

  const { data, isLoading, refetch, isFetching, error } = useQuery({
    queryKey: ['platform-clinicas-overview'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('platform_get_clinicas_overview');
      if (error) throw error;
      return (data ?? []) as ClinicaOverview[];
    },
    enabled: isPlatformAdmin,
    refetchInterval: 30_000,
  });

  const { data: orfaosData, refetch: refetchOrfaos, isError: orfaosError } = useQuery({
    queryKey: ['platform-orfaos', paginaOrfaos],
    queryFn: async () => {
      const inicio = paginaOrfaos * 50;
      const { data, error, count } = await (supabase as any)
        .from('registros_pendentes')
        .select('id, nome, email, plano_slug, updated_at, reminder_count', { count: 'exact' })
        .eq('status', 'pago')
        .is('user_id', null)
        .order('updated_at', { ascending: false })
        .order('id', { ascending: false })
        .range(inicio, inicio + 49);
      if (error) throw error;
      return { items: data ?? [], total: count ?? inicio + (data ?? []).length };
    },
    enabled: isPlatformAdmin,
    refetchInterval: 30_000,
  });
  const orfaos = orfaosData?.items ?? [];
  const totalOrfaos = orfaosData?.total ?? 0;
  const paginasOrfaos = Math.max(1, Math.ceil(totalOrfaos / 50));
  useEffect(() => {
    if (paginaOrfaos >= paginasOrfaos) setPaginaOrfaos(Math.max(0, paginasOrfaos - 1));
  }, [paginaOrfaos, paginasOrfaos]);

  const handleReconcile = async () => {
    if (reconcileLock.current) return;
    reconcileLock.current = true;
    setReconciling(true);
    try {
      const { data, error } = await supabase.functions.invoke('reconcile-pending-registrations');
      if (error) throw error;
      if (!(data as any)?.success) throw new Error((data as any)?.error || 'A reconciliação não foi concluída.');
      const resumo = `${(data as any)?.checked ?? 0} elegíveis · ${(data as any)?.resent ?? 0} lembretes enviados · ${(data as any)?.expired ?? 0} expirados`;
      if ((data as any)?.failed) {
        toast.warning('Reconciliação concluída com falhas', { description: `${resumo} · ${(data as any).failed} e-mail(s) não enviados.` });
      } else {
        toast.success('Reconciliação concluída', { description: resumo });
      }
      await refetchOrfaos();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao reconciliar');
    } finally {
      reconcileLock.current = false;
      setReconciling(false);
    }
  };

  const handleResend = async (id: string, email: string) => {
    if (resendLock.current) return;
    resendLock.current = true;
    setResendingId(id);
    try {
      const { data, error: resendError } = await supabase.functions.invoke('resend-pending-registration', {
        body: { registration_id: id },
      });
      if (resendError) throw resendError;
      if (!(data as any)?.success) throw new Error((data as any)?.error || 'Não foi possível reenviar o convite.');
      toast.success(`Código reenviado para ${email}`);
      await refetchOrfaos();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao reenviar');
    } finally {
      resendLock.current = false;
      setResendingId(null);
    }
  };

  const filtered = useMemo(() => {
    // Arquivada fica escondida por padrão: o objetivo de arquivar é justamente
    // tirar da frente. O contador ao lado do botão diz quantas estão guardadas.
    const agora = Date.now();
    const list = (data ?? []).filter(c => (mostrarArquivadas || !c.arquivada) && passaNoFiltro(c, filtroStatus, agora));
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(c =>
      c.clinica_nome?.toLowerCase().includes(q) ||
      c.owner_email?.toLowerCase().includes(q) ||
      c.owner_nome?.toLowerCase().includes(q) ||
      c.plano_nome?.toLowerCase().includes(q)
    );
  }, [data, search, mostrarArquivadas, filtroStatus]);

  const totals = useMemo(() => {
    const list = data ?? [];
    const agora = Date.now();
    return {
      clinicas: list.length,
      arquivadas: list.filter(c => c.arquivada).length,
      ativas: list.filter(c => passaNoFiltro(c, 'ativas', agora)).length,
      trial: list.filter(c => passaNoFiltro(c, 'trial', agora)).length,
      suspensas: list.filter(c => c.suspensa).length,
      pacientes: list.reduce((s, c) => s + Number(c.total_pacientes || 0), 0),
    };
  }, [data]);
  const visiveis = (data ?? []).filter(c => mostrarArquivadas || !c.arquivada).length;
  const temFiltro = filtroStatus !== 'todas' || search.trim() !== '';
  const limparFiltros = () => { setFiltroStatus('todas'); setSearch(''); };

  if (authLoading) {
    return <div className="p-6"><Skeleton className="h-64" /></div>;
  }

  if (!isPlatformAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 pb-10">
      <PageHeader
        title="Plataforma — Clínicas"
        icon={<Crown />}
        description={data
          ? `${totals.clinicas} clínicas · ${totals.ativas} assinaturas ativas · ${totals.trial} em teste${totals.suspensas ? ` · ${totals.suspensas} com acesso suspenso` : ''}${totalOrfaos ? ` · ${totalOrfaos} pagamentos aguardando ativação` : ''}`
          : 'Visão global de todas as clínicas, assinaturas e uso. Restrito a administradores da plataforma.'}
        actions={<>
          <Button asChild variant="outline" className="rounded-full gap-2">
            <Link to="/admin/cobrancas"><CreditCard className="h-4 w-4" />Cobranças</Link>
          </Button>
          {(data ?? []).some(c => c.arquivada) && (
            <Button variant="outline" className="rounded-full gap-2" onClick={() => setMostrarArquivadas(v => !v)} aria-pressed={mostrarArquivadas}>
              <Archive className="h-4 w-4" />
              {mostrarArquivadas
                ? 'Ocultar arquivadas'
                : `Ver arquivadas (${(data ?? []).filter(c => c.arquivada).length})`}
            </Button>
          )}
          <Button variant="outline" size="icon" className="rounded-full" onClick={() => refetch()} disabled={isFetching} aria-label="Atualizar">
            <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
          </Button>
        </>}
      />

      {orfaosError ? (
        <Card className="rounded-2xl border-destructive/30 shadow-xs"><CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <p className="text-sm text-destructive" role="alert">Não foi possível consultar os pagamentos que aguardam ativação.</p>
          <Button size="sm" variant="outline" className="rounded-full" onClick={() => void refetchOrfaos()}>Tentar novamente</Button>
        </CardContent></Card>
      ) : orfaos && orfaos.length > 0 && (
        <Card className="rounded-2xl border-warning/40 bg-warning/5 shadow-xs">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-base flex items-center gap-2 text-warning">
                <AlertCircle className="h-5 w-5" />
                Pagamentos órfãos ({orfaos.length} nesta página · {totalOrfaos} no total)
              </CardTitle>
              <Button size="sm" variant="outline" className="rounded-full" onClick={handleReconcile} disabled={reconciling}>
                <RefreshCw className={`h-4 w-4 mr-2 ${reconciling ? 'animate-spin' : ''}`} />
                Reconciliar agora
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Clientes que pagaram mas ainda não criaram a conta. Reenvie o código quando necessário.
            </p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-xl border border-border/60 bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead>Atualizado em</TableHead>
                    <TableHead className="text-center">Lembretes</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orfaos.map((o: any) => (
                    <TableRow key={o.id}>
                      <TableCell className="text-sm">
                        <div className="font-medium">{o.nome}</div>
                        <div className="text-xs text-muted-foreground">{o.email}</div>
                      </TableCell>
                      <TableCell><Badge variant="outline" className="rounded-full">{o.plano_slug}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {dataHoraFormatada(o.updated_at)}
                      </TableCell>
                      <TableCell className="text-center text-xs">{o.reminder_count ?? 0}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-9 rounded-full text-xs"
                          disabled={resendingId !== null}
                          onClick={() => handleResend(o.id, o.email)}
                        >
                          <Mail className="h-3.5 w-3.5 mr-1" />
                          {resendingId === o.id ? 'Enviando...' : 'Reenviar'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {totalOrfaos > 50 && (
              <div className="mt-3 flex items-center justify-between gap-3 border-t pt-3">
                <Button size="sm" variant="outline" className="rounded-full" onClick={() => setPaginaOrfaos((pagina) => Math.max(0, pagina - 1))} disabled={paginaOrfaos === 0}>
                  <ArrowLeft className="mr-1.5 h-4 w-4" />Anterior
                </Button>
                <span className="text-xs text-muted-foreground">Página {paginaOrfaos + 1} de {paginasOrfaos}</span>
                <Button size="sm" variant="outline" className="rounded-full" onClick={() => setPaginaOrfaos((pagina) => Math.min(paginasOrfaos - 1, pagina + 1))} disabled={paginaOrfaos + 1 >= paginasOrfaos}>
                  Próxima<ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* KPIs */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4" aria-label="Indicadores das clínicas">
        {([
          { key: 'todas', title: 'Clínicas', value: totals.clinicas, detail: `${totals.arquivadas} arquivada(s)`, icon: Building2, tone: 'bg-[#1080CA]/10 text-[#1080CA]', destaque: true },
          { key: 'ativas', title: 'Assinaturas Ativas', value: totals.ativas, detail: 'válidas, pagas e sem suspensão', icon: CheckCircle2, tone: 'bg-success/10 text-success', destaque: false },
          { key: 'trial', title: 'Em Trial', value: totals.trial, detail: 'em período de teste válido', icon: Hourglass, tone: 'bg-info/10 text-info', destaque: false },
          { key: null, title: 'Pacientes (total)', value: totals.pacientes, detail: 'inclui clínicas arquivadas', icon: Users, tone: 'bg-[#1080CA]/10 text-[#1080CA]', destaque: false },
        ] as const).map(({ key, title, value, detail, icon: Icon, tone, destaque }) => {
          const ativo = key !== null && filtroStatus === key;
          const conteudo = (
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
          );
          const base = cn(
            'rounded-2xl border p-4 text-left shadow-xs',
            destaque ? 'border-transparent bg-gradient-primary text-white' : 'border-border/60 bg-card',
          );
          return key === null ? (
            <div key={title} className={base}>{conteudo}</div>
          ) : (
            <button
              key={title}
              type="button"
              aria-pressed={ativo}
              onClick={() => setFiltroStatus(key === filtroStatus ? 'todas' : key)}
              className={cn(base, 'transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1080CA] focus-visible:ring-offset-2', ativo && !destaque && 'border-[#1080CA] ring-1 ring-[#1080CA]/40')}
            >
              {conteudo}
            </button>
          );
        })}
      </section>

      <Card className="rounded-2xl border-border/60 shadow-xs">
        <CardHeader className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Todas as Clínicas</CardTitle>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por clínica, dono ou plano..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-10 rounded-full pl-9 focus-visible:ring-[#1080CA]"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {([
              ['todas', 'Todas'], ['ativas', 'Ativas'], ['trial', 'Em teste'], ['suspensas', `Acesso suspenso (${totals.suspensas})`],
            ] as const).map(([valor, rotulo]) => (
              <button
                key={valor}
                type="button"
                aria-pressed={filtroStatus === valor}
                onClick={() => setFiltroStatus(valor)}
                className={cn(
                  'h-8 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1080CA]',
                  filtroStatus === valor ? 'border-transparent bg-gradient-primary text-white shadow-sm' : 'border-[#DCE6F2] bg-card text-muted-foreground hover:border-[#9CC7EC] hover:text-foreground',
                )}
              >
                {rotulo}
              </button>
            ))}
            {temFiltro && (
              <Button variant="outline" size="sm" className="h-8 rounded-full text-xs" onClick={limparFiltros}>Limpar filtros</Button>
            )}
            <span className="ml-auto text-xs text-muted-foreground tabular-nums">{filtered.length} de {visiveis}</span>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-md"><Building2 className="h-6 w-6" /></span>
              <p className="font-medium text-foreground">Nenhuma clínica encontrada.</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                {temFiltro ? 'Nenhuma clínica corresponde aos filtros atuais.' : 'Quando um cliente concluir o cadastro, a clínica aparece aqui. Acompanhe as novas contas no onboarding.'}
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
                    <TableHead>Dono</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-center"><Stethoscope className="h-4 w-4 inline" /></TableHead>
                    <TableHead className="text-center"><Users className="h-4 w-4 inline" /></TableHead>
                    <TableHead className="text-center">Pacientes</TableHead>
                    <TableHead className="text-center"><CalendarRange className="h-4 w-4 inline" /></TableHead>
                    <TableHead>Criada em</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(c => (
                    <TableRow key={c.clinica_id}>
                      <TableCell className="font-medium">
                        <span className={c.arquivada ? 'text-muted-foreground line-through' : ''}>
                          {c.clinica_nome}
                        </span>
                        {c.arquivada && (
                          <Badge variant="outline" className="ml-2 rounded-full text-[10px]" title={c.arquivada_motivo ?? ''}>
                            Arquivada
                          </Badge>
                        )}
                        {c.suspensa && <Badge variant="destructive" className="ml-2 rounded-full text-[10px]">Acesso suspenso</Badge>}
                      </TableCell>
                      <TableCell className="text-sm">
                        <div>{c.owner_nome || <span className="text-muted-foreground">—</span>}</div>
                        <div className="text-xs text-muted-foreground">{c.owner_email || '—'}</div>
                      </TableCell>
                      <TableCell>
                        {c.plano_nome ? (
                          <Badge variant="outline" className="rounded-full">{c.plano_nome}</Badge>
                        ) : <span className="text-muted-foreground text-xs">sem plano</span>}
                      </TableCell>
                      <TableCell>
                        {c.assinatura_status ? (
                          <Badge className={cn('rounded-full', STATUS_COLORS[c.assinatura_status])} variant="outline">
                            {STATUS_LABELS[c.assinatura_status] || c.assinatura_status}
                          </Badge>
                        ) : <span className="text-muted-foreground text-xs">Sem assinatura</span>}
                        {(c.data_fim || c.trial_fim) && <div className="mt-1 text-xs text-muted-foreground">{new Date((c.data_fim || c.trial_fim)!).getTime() < Date.now() ? 'Data vencida em' : 'Vencimento'} {dataFormatada(c.data_fim || c.trial_fim)}</div>}
                      </TableCell>
                      <TableCell className="text-center">{c.total_medicos}</TableCell>
                      <TableCell className="text-center">{c.total_funcionarios}</TableCell>
                      <TableCell className="text-center">{c.total_pacientes}</TableCell>
                      <TableCell className="text-center">{c.total_agendamentos}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {dataFormatada(c.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-9 rounded-full text-xs"
                          disabled={impersonatingId === c.clinica_id}
                          onClick={() => { setAlvo({ id: c.clinica_id, nome: c.clinica_nome }); setMotivo(''); }}
                        >
                          <LogIn className="h-3.5 w-3.5 mr-1" />
                          {impersonatingId === c.clinica_id ? 'Entrando...' : 'Entrar'}
                        </Button>
                        <AcoesDaClinica
                          clinicaId={c.clinica_id}
                          nome={c.clinica_nome}
                          arquivada={!!c.arquivada}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <LogDeAcessos />

      <Dialog open={!!alvo} onOpenChange={aberto => { if (!aberto && !impersonationLock.current) { setAlvo(null); setMotivo(''); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Entrar em {alvo?.nome}</DialogTitle>
            <DialogDescription>
              Você vai acessar os dados dessa clínica, inclusive prontuários de
              pacientes. O motivo fica registrado no log da plataforma, com data
              e hora de entrada e de saída.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="motivo-impersonacao">Motivo do acesso</Label>
            <Textarea
              id="motivo-impersonacao"
              value={motivo}
              maxLength={500}
              onChange={e => setMotivo(e.target.value)}
              placeholder="Ex.: chamado #142 — agenda não abre para a recepção"
              rows={3}
              disabled={!!impersonatingId}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setAlvo(null)} disabled={!!impersonatingId}>Cancelar</Button>
            <Button onClick={handleImpersonate} disabled={!!impersonatingId} className="rounded-full bg-gradient-primary text-white shadow-md hover:brightness-110">
              {impersonatingId ? 'Entrando...' : 'Entrar na clínica'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
