import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity, AlertTriangle, CalendarDays, CheckCircle2, ClipboardList, FilePlus2, FolderOpen, Loader2,
  MapPin, Plus, RefreshCw, Search, ShieldCheck, Siren, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { normalizarTexto } from '@/lib/buscaPaciente';
import { mensagemDeErro } from '@/lib/erros';
import { cn } from '@/lib/utils';

type Report = {
  id: string; category: string; severity: string; occurred_at: string; location_label: string;
  summary: string; immediate_action: string; status: string; reporter_confidential: boolean;
  reporter_display?: string; is_reporter?: boolean; assigned_to: string | null; due_at: string | null; created_at: string; updated_at: string;
};
type Reviewer = { id: string; nome: string };
type ReportUpdate = { id: string; from_status: string | null; to_status: string; review_note: string; corrective_action: string; created_at: string; actor_user_id: string | null };
type CorrectionRequest = { id: string; previous_summary: string; previous_immediate_action: string; proposed_summary: string; proposed_immediate_action: string; reason: string; report_updated_at: string; status: 'pending' | 'approved' | 'rejected'; review_note: string | null; created_at: string; reviewed_at: string | null };
type FormState = { category: string; severity: string; occurred_at: string; location_label: string; summary: string; immediate_action: string; reporter_confidential: boolean };
type IndicadorKey = 'critical_open' | 'open' | 'action_required' | 'month' | 'closed';
type Ordenacao = 'gravidade' | 'mais_recentes' | 'mais_antigos';
const EMPTY_REPORTS: Report[] = [];

const CATEGORIES: Record<string, string> = {
  adverse_event: 'Evento adverso', near_miss: 'Quase incidente', unsafe_condition: 'Condição insegura',
  medication: 'Medicação', fall: 'Queda', infection: 'Infecção', equipment: 'Equipamento', other: 'Outro',
};
const SEVERITIES: Record<string, string> = { low: 'Baixa', moderate: 'Moderada', high: 'Alta', critical: 'Crítica' };
const SEVERITY_WEIGHT: Record<string, number> = { critical: 0, high: 1, moderate: 2, low: 3 };
const SEVERITY_CLASSES: Record<string, string> = {
  critical: 'border-transparent bg-destructive text-white hover:bg-destructive',
  high: 'border-destructive/30 bg-destructive/10 text-destructive',
  moderate: 'border-warning/40 bg-warning/10 text-warning-foreground',
  low: 'border-border bg-muted text-muted-foreground',
};
const STATUSES: Record<string, string> = {
  submitted: 'Recebido', triage: 'Triagem', investigating: 'Em investigação', action_required: 'Ação necessária',
  monitoring: 'Monitorando', closed: 'Encerrado', reopened: 'Reaberto',
};
const STATUS_CLASSES: Record<string, string> = {
  submitted: 'border-info/30 bg-info/10 text-info',
  triage: 'border-info/30 bg-info/10 text-info',
  investigating: 'border-primary/30 bg-primary/10 text-primary',
  action_required: 'border-warning/40 bg-warning/10 text-warning-foreground',
  monitoring: 'border-warning/40 bg-warning/10 text-warning-foreground',
  reopened: 'border-warning/40 bg-warning/10 text-warning-foreground',
  closed: 'border-success/30 bg-success/10 text-success',
};
const SAFETY_TOAST_OPTIONS = { id: 'seguranca-assistencial', duration: 3500 };
const EMPTY_FORM: FormState = {
  category: 'near_miss', severity: 'moderate', occurred_at: localDateTime(new Date().toISOString()),
  location_label: '', summary: '', immediate_action: '', reporter_confidential: true,
};

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Data indisponível' : date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}
function localDateTime(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
const isOpen = (report: Report) => report.status !== 'closed';
const isOverdue = (report: Report, now: number) => isOpen(report) && !!report.due_at && new Date(report.due_at).getTime() < now;
function inCurrentMonth(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}
const byOldestOccurrence = (a: Report, b: Report) => String(a.occurred_at).localeCompare(String(b.occurred_at));
const plural = (n: number, singular: string, pluralForm: string) => (n === 1 ? singular : pluralForm);

export default function SegurancaAssistencial() {
  const { profile, user } = useSupabaseAuth();
  const isAdmin = profile?.roles?.includes('admin') ?? false;
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [reviewing, setReviewing] = useState<Report | null>(null);
  const [reviewStatus, setReviewStatus] = useState('triage');
  const [reviewerId, setReviewerId] = useState('none');
  const [dueAt, setDueAt] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [correctiveAction, setCorrectiveAction] = useState('');
  const [editingCorrection, setEditingCorrection] = useState(false);
  const [correctionSummary, setCorrectionSummary] = useState('');
  const [correctionAction, setCorrectionAction] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');
  const [correctionReviewNote, setCorrectionReviewNote] = useState('');
  const [search, setSearch] = useState('');
  const [indicador, setIndicador] = useState<IndicadorKey | 'todos'>('todos');
  const [severityFilter, setSeverityFilter] = useState('todas');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [ordenacao, setOrdenacao] = useState<Ordenacao>('gravidade');

  const reportsQuery = useQuery({
    queryKey: ['clinical-safety-reports', profile?.clinica_id, user?.id],
    enabled: Boolean(profile?.clinica_id && user?.id),
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('seguranca-assistencial', { body: { action: 'list' } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return { reports: (data?.reports ?? []) as Report[], reviewers: (data?.reviewers ?? []) as Reviewer[] };
    },
  });

  const reportDetailQuery = useQuery({
    queryKey: ['clinical-safety-report', profile?.clinica_id, user?.id, reviewing?.id],
    enabled: Boolean(reviewing?.id),
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('seguranca-assistencial', { body: { action: 'get', report_id: reviewing?.id } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return { report: data.report as Report, updates: (data.updates ?? []) as ReportUpdate[], correctionRequests: (data.correction_requests ?? []) as CorrectionRequest[] };
    },
  });

  const createReport = useMutation({
    mutationFn: async () => {
      const occurred = new Date(form.occurred_at);
      if (Number.isNaN(occurred.getTime())) throw new Error('Informe uma data válida.');
      const { data, error } = await supabase.functions.invoke('seguranca-assistencial', {
        body: { action: 'create', report: { ...form, occurred_at: occurred.toISOString() } },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      setForm({ ...EMPTY_FORM, occurred_at: localDateTime(new Date().toISOString()) });
      toast.success('Relato recebido.', SAFETY_TOAST_OPTIONS);
      void queryClient.invalidateQueries({ queryKey: ['clinical-safety-reports'] });
    },
    onError: (error) => toast.error('Não foi possível registrar o relato.', { ...SAFETY_TOAST_OPTIONS, description: mensagemDeErro(error) }),
  });

  const reviewReport = useMutation({
    mutationFn: async () => {
      if (!reviewing) throw new Error('Selecione um relato para revisar.');
      const { data, error } = await supabase.functions.invoke('seguranca-assistencial', {
        body: { action: 'update', report_id: reviewing.id, update: {
          status: reviewStatus, assigned_to: reviewerId === 'none' ? null : reviewerId,
          due_at: dueAt ? new Date(dueAt).toISOString() : null, expected_updated_at: reviewing.updated_at,
          review_note: reviewNote.trim(), corrective_action: correctiveAction.trim(),
        } },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      toast.success('Revisão e ação corretiva registradas.', SAFETY_TOAST_OPTIONS);
      setReviewing((current) => current ? { ...current, ...data.report } : current);
      void queryClient.invalidateQueries({ queryKey: ['clinical-safety-reports'] });
      void queryClient.invalidateQueries({ queryKey: ['clinical-safety-report'] });
      setReviewNote('');
      setCorrectiveAction('');
    },
    onError: (error) => toast.error('Não foi possível salvar a revisão.', { ...SAFETY_TOAST_OPTIONS, description: mensagemDeErro(error) }),
  });

  const requestCorrection = useMutation({
    mutationFn: async () => {
      if (!reviewing) throw new Error('Selecione um relato.');
      const { data, error } = await supabase.functions.invoke('seguranca-assistencial', {
        body: { action: 'request_correction', report_id: reviewing.id, request: {
          proposed_summary: correctionSummary.trim(), proposed_immediate_action: correctionAction.trim(), reason: correctionReason.trim(),
        } },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success('Pedido de retificação enviado para análise.', SAFETY_TOAST_OPTIONS);
      setEditingCorrection(false);
      setCorrectionSummary(''); setCorrectionAction(''); setCorrectionReason('');
      void queryClient.invalidateQueries({ queryKey: ['clinical-safety-report'] });
    },
    onError: (error) => toast.error('Não foi possível enviar o pedido.', { ...SAFETY_TOAST_OPTIONS, description: mensagemDeErro(error) }),
  });

  const resolveCorrection = useMutation({
    mutationFn: async ({ requestId, status }: { requestId: string; status: 'approved' | 'rejected' }) => {
      if (!reviewing) throw new Error('Selecione um relato.');
      const { data, error } = await supabase.functions.invoke('seguranca-assistencial', {
        body: { action: 'resolve_correction', report_id: reviewing.id, correction_id: requestId, decision: {
          status, expected_report_updated_at: reportDetailQuery.data?.report.updated_at || reviewing.updated_at, review_note: correctionReviewNote.trim(),
        } },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success('Decisão de retificação registrada.', SAFETY_TOAST_OPTIONS);
      setCorrectionReviewNote('');
      void queryClient.invalidateQueries({ queryKey: ['clinical-safety-report'] });
      void queryClient.invalidateQueries({ queryKey: ['clinical-safety-reports'] });
    },
    onError: (error) => toast.error('Não foi possível decidir a retificação.', { ...SAFETY_TOAST_OPTIONS, description: mensagemDeErro(error) }),
  });

  const reports = reportsQuery.data?.reports ?? EMPTY_REPORTS;
  const reviewers = reportsQuery.data?.reviewers ?? [];
  const reviewerNome = (id: string | null) => (id ? reviewers.find((reviewer) => reviewer.id === id)?.nome || 'Definido' : null);

  const counts = useMemo(() => {
    const now = Date.now();
    return {
      open: reports.filter(isOpen).length,
      criticalOpen: reports.filter((report) => report.severity === 'critical' && isOpen(report)).length,
      actionRequired: reports.filter((report) => report.status === 'action_required').length,
      month: reports.filter((report) => inCurrentMonth(report.occurred_at)).length,
      closed: reports.filter((report) => !isOpen(report)).length,
      overdue: reports.filter((report) => isOverdue(report, now)).length,
      byCategory: Object.entries(CATEGORIES).map(([key, label]) => ({ key, label, count: reports.filter((report) => report.category === key).length })).filter((item) => item.count > 0),
    };
  }, [reports]);

  const maisUrgente = useMemo(() => {
    const abertos = reports.filter(isOpen);
    return [...abertos.filter((report) => report.severity === 'critical')].sort(byOldestOccurrence)[0]
      ?? [...abertos.filter((report) => report.severity === 'high')].sort(byOldestOccurrence)[0]
      ?? null;
  }, [reports]);

  const filtrados = useMemo(() => {
    const q = normalizarTexto(search);
    const lista = reports.filter((report) => {
      if (indicador === 'critical_open' && !(report.severity === 'critical' && isOpen(report))) return false;
      if (indicador === 'open' && !isOpen(report)) return false;
      if (indicador === 'action_required' && report.status !== 'action_required') return false;
      if (indicador === 'month' && !inCurrentMonth(report.occurred_at)) return false;
      if (indicador === 'closed' && isOpen(report)) return false;
      if (severityFilter !== 'todas' && report.severity !== severityFilter) return false;
      if (statusFilter !== 'todos' && report.status !== statusFilter) return false;
      if (q) {
        const campos = [report.summary, report.immediate_action, report.location_label, CATEGORIES[report.category], SEVERITIES[report.severity], STATUSES[report.status], report.reporter_display, reviewerNome(report.assigned_to)];
        if (!campos.some((valor) => normalizarTexto(String(valor ?? '')).includes(q))) return false;
      }
      return true;
    });
    if (ordenacao === 'gravidade') {
      lista.sort((a, b) => (SEVERITY_WEIGHT[a.severity] ?? 9) - (SEVERITY_WEIGHT[b.severity] ?? 9) || byOldestOccurrence(a, b));
    } else if (ordenacao === 'mais_antigos') {
      lista.sort(byOldestOccurrence);
    } else {
      lista.sort((a, b) => byOldestOccurrence(b, a));
    }
    return lista;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reports, reviewers, search, indicador, severityFilter, statusFilter, ordenacao]);
  const abertosFiltrados = filtrados.filter(isOpen);
  const encerradosFiltrados = filtrados.filter((report) => !isOpen(report));
  const temFiltro = search.trim() !== '' || indicador !== 'todos' || severityFilter !== 'todas' || statusFilter !== 'todos';
  const limparFiltros = () => { setSearch(''); setIndicador('todos'); setSeverityFilter('todas'); setStatusFilter('todos'); };

  const canSubmit = form.summary.trim().length >= 20 && form.summary.trim().length <= 4000 && form.immediate_action.length <= 2000 && form.location_label.length <= 120;
  const canReview = reviewNote.trim().length >= 3 && reviewNote.trim().length <= 3000 && correctiveAction.length <= 3000 && (reviewStatus !== 'action_required' || (reviewerId !== 'none' && !!dueAt));

  const openReview = (report: Report) => {
    setReviewing(report);
    setReviewStatus(report.status === 'submitted' ? 'triage' : report.status);
    setReviewerId(report.assigned_to || 'none');
    setDueAt(localDateTime(report.due_at));
    setReviewNote('');
    setCorrectiveAction('');
    setEditingCorrection(false);
    setCorrectionReviewNote('');
  };
  const irParaFormulario = () => {
    const campo = document.getElementById('safety-summary');
    document.getElementById('safety-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    campo?.focus({ preventScroll: true });
  };

  const descricao = reportsQuery.isLoading
    ? 'Carregando relatos…'
    : reports.length === 0
      ? 'Registre eventos, quase incidentes e condições inseguras para análise e melhoria do cuidado.'
      : `${counts.open} ${plural(counts.open, 'relato aberto', 'relatos abertos')} · ${counts.month} neste mês${counts.criticalOpen > 0 ? ` · ${counts.criticalOpen} ${plural(counts.criticalOpen, 'crítico pendente', 'críticos pendentes')}` : ''}${counts.overdue > 0 ? ` · ${counts.overdue} com prazo vencido` : ''}`;

  const indicadores: { key: IndicadorKey; icon: typeof Siren; label: string; caption: string; value: number; color: string }[] = [
    { key: 'critical_open', icon: Siren, label: 'Críticos pendentes', caption: 'exigem revisão imediata', value: counts.criticalOpen, color: 'text-destructive' },
    { key: 'open', icon: Activity, label: 'Em aberto', caption: 'ainda não encerrados', value: counts.open, color: 'text-primary' },
    { key: 'action_required', icon: AlertTriangle, label: 'Ação necessária', caption: counts.overdue > 0 ? `${counts.overdue} com prazo vencido` : 'com responsável e prazo', value: counts.actionRequired, color: 'text-warning-foreground' },
    { key: 'month', icon: CalendarDays, label: 'Neste mês', caption: 'ocorridos no mês atual', value: counts.month, color: 'text-muted-foreground' },
    { key: 'closed', icon: CheckCircle2, label: 'Encerrados', caption: `${reports.length} no total`, value: counts.closed, color: 'text-success' },
  ];

  const renderReport = (report: Report) => {
    const atrasado = isOverdue(report, Date.now());
    const critico = (report.severity === 'critical' && isOpen(report)) || atrasado;
    return (
      <Card key={report.id} className={cn('rounded-xl border-border/60 shadow-xs', critico && 'border-destructive/30')}>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-semibold text-foreground">{CATEGORIES[report.category] || 'Relato assistencial'} <span className="font-normal text-muted-foreground">· {formatDate(report.occurred_at)}</span></p>
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><MapPin aria-hidden="true" className="h-3 w-3" />{report.location_label || 'Local não informado'}</span>
                <span>Relatado em {formatDate(report.created_at)}</span>
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className={cn('rounded-full', SEVERITY_CLASSES[report.severity] ?? SEVERITY_CLASSES.low)}>{SEVERITIES[report.severity] || report.severity}</Badge>
              <Badge variant="outline" className={cn('rounded-full', STATUS_CLASSES[report.status] ?? STATUS_CLASSES.submitted)}>{STATUSES[report.status] || report.status}</Badge>
              {atrasado && <Badge variant="outline" className="rounded-full border-destructive/30 bg-destructive/10 text-destructive">Prazo vencido</Badge>}
              {isAdmin && report.reporter_confidential && <Badge variant="outline" className="rounded-full">Identidade protegida</Badge>}
            </div>
          </div>
          <p className="whitespace-pre-wrap break-words text-sm">{report.summary}</p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">{isAdmin && report.reporter_display ? `Relator: ${report.reporter_display}` : ''}{report.assigned_to ? ` · Responsável: ${reviewerNome(report.assigned_to)}` : ''}{report.due_at ? ` · Prazo ${formatDate(report.due_at)}` : ''}</p>
            <Button variant="outline" className="h-9 rounded-full text-xs" onClick={() => openReview(report)}>{isAdmin ? 'Revisar e acompanhar' : 'Acompanhar relato'}</Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderGrupo = (id: string, titulo: string, Icon: typeof FolderOpen, lista: Report[]) => lista.length > 0 && (
    <section key={id} aria-labelledby={id} className="space-y-3">
      <div className="flex items-center gap-2.5">
        <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span>
        <h3 id={id} className="text-base font-semibold text-foreground">{titulo}</h3>
        <Badge variant="outline" className="h-5 rounded-full border-border bg-card text-xs tabular-nums text-primary">{lista.length}</Badge>
      </div>
      <div className="space-y-3">{lista.map(renderReport)}</div>
    </section>
  );

  return <div className="space-y-6 pb-8">
    <PageHeader
      title="Qualidade e segurança assistencial"
      description={descricao}
      icon={<ShieldCheck />}
      actions={<>
        <Button variant="outline" size="icon" className="shrink-0 rounded-full" aria-label="Atualizar relatos" title="Atualizar relatos" onClick={() => void reportsQuery.refetch()} disabled={reportsQuery.isFetching}><RefreshCw className={`h-4 w-4 ${reportsQuery.isFetching ? 'animate-spin' : ''}`} /></Button>
        <Button className="shrink-0 gap-2 rounded-full" onClick={irParaFormulario}><Plus className="h-4 w-4" /> Registrar relato</Button>
      </>}
    />

    <section role="group" aria-label="Indicadores de segurança assistencial" className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">Situação agora</h2>
        <p className="text-xs text-muted-foreground">{indicador === 'todos' ? 'Clique em um indicador para filtrar os relatos.' : `Mostrando apenas ${indicadores.find((item) => item.key === indicador)?.label.toLowerCase()}.`}</p>
      </div>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3 xl:grid-cols-5 [&>button:last-child]:col-span-2 sm:[&>button:last-child]:col-span-1">
        {indicadores.map((s) => {
          const Icon = s.icon;
          const ativo = indicador === s.key;
          return (
            <button
              key={s.key}
              type="button"
              aria-pressed={ativo}
              onClick={() => setIndicador(ativo ? 'todos' : s.key)}
              aria-label={`${s.label}: ${reportsQuery.isLoading ? 'carregando' : s.value}. ${s.caption}`}
              className={cn('min-w-0 bg-card p-3 text-left transition-colors hover:bg-muted/50 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary', ativo && 'bg-primary/5')}
            >
              <div className="flex min-h-[72px] items-start gap-2.5">
                <div className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/70', s.value > 0 ? s.color : 'text-muted-foreground')}><Icon aria-hidden="true" className="h-4 w-4" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-xs font-semibold leading-5 text-foreground">{s.label}</h3>
                    <span data-testid={`safety-indicator-value-${s.key}`} className={cn('text-xl font-bold tabular-nums', s.value > 0 ? s.color : 'text-muted-foreground')}>{reportsQuery.isLoading ? '—' : s.value}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{s.caption}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      {!!counts.byCategory.length && <div aria-label="Relatos por categoria" className="flex flex-wrap gap-2 pt-1">{counts.byCategory.map((item) => <Badge key={item.key} variant="outline" className="rounded-full border-primary/20 bg-primary/5 text-primary">{item.label}: {item.count}</Badge>)}</div>}
    </section>

    {maisUrgente && (() => {
      const atrasado = isOverdue(maisUrgente, Date.now());
      const critico = maisUrgente.severity === 'critical';
      const destaque = atrasado || critico ? 'border-destructive/40' : 'border-warning/40';
      const tom = atrasado || critico ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning-foreground';
      return (
        <Card className={cn('overflow-hidden rounded-xl', destaque)}>
          <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <span aria-hidden="true" className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl', tom)}><Siren className="h-5 w-5" /></span>
              <div className="min-w-0">
                <p className={cn('text-[11px] font-semibold uppercase tracking-wide', atrasado ? 'text-destructive' : critico ? 'text-destructive' : 'text-warning-foreground')}>{atrasado ? 'Prazo vencido' : critico ? 'Risco crítico em aberto' : 'Risco alto em aberto'}</p>
                <h2 className="text-lg font-bold text-foreground">{CATEGORIES[maisUrgente.category] || 'Relato assistencial'} · {SEVERITIES[maisUrgente.severity]}</h2>
                <p className="mt-1 line-clamp-2 text-sm text-foreground/90">{maisUrgente.summary}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><CalendarDays aria-hidden="true" className="h-3 w-3" />{formatDate(maisUrgente.occurred_at)}</span>
                  <span className="inline-flex items-center gap-1"><MapPin aria-hidden="true" className="h-3 w-3" />{maisUrgente.location_label || 'Local não informado'}</span>
                  <Badge variant="outline" className={cn('rounded-full text-[10px]', STATUS_CLASSES[maisUrgente.status] ?? STATUS_CLASSES.submitted)}>{STATUSES[maisUrgente.status] || maisUrgente.status}</Badge>
                  {maisUrgente.assigned_to && <span>Responsável: {reviewerNome(maisUrgente.assigned_to)}</span>}
                  {maisUrgente.due_at && <span className={cn('font-medium', atrasado && 'text-destructive')}>{atrasado ? 'Prazo vencido em' : 'Prazo'} {formatDate(maisUrgente.due_at)}</span>}
                  {!maisUrgente.assigned_to && isAdmin && <span className="font-medium text-warning-foreground">Sem responsável definido</span>}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <Button className="h-10 gap-1.5 rounded-full" onClick={() => openReview(maisUrgente)}>
                <ClipboardList aria-hidden="true" className="h-4 w-4" />{isAdmin ? 'Revisar agora' : 'Acompanhar agora'}
              </Button>
            </div>
          </CardContent>
        </Card>
      );
    })()}

    <Card id="safety-form" className="scroll-mt-4 rounded-2xl border-border/60 shadow-xs">
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex items-start gap-2.5">
          <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><FilePlus2 className="h-4 w-4" /></span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground">Registrar ocorrência ou risco</h2>
            <p className="text-sm text-muted-foreground">Não informe nome, CPF, CNS ou outros dados que identifiquem o paciente. O relato fica restrito a esta clínica.</p>
          </div>
        </div>
        <div className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-foreground"><AlertTriangle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" /><p>Se houver risco imediato à vida, acione os serviços de emergência e o protocolo interno antes de registrar.</p></div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5"><Label htmlFor="safety-category">Categoria</Label><Select value={form.category} onValueChange={(category) => setForm({ ...form, category })}><SelectTrigger id="safety-category" className="h-10 rounded-full"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(CATEGORIES).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label htmlFor="safety-severity">Gravidade</Label><Select value={form.severity} onValueChange={(severity) => setForm({ ...form, severity })}><SelectTrigger id="safety-severity" className="h-10 rounded-full"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(SEVERITIES).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label htmlFor="safety-occurred">Quando aconteceu</Label><Input id="safety-occurred" type="datetime-local" className="h-10 rounded-full" max={localDateTime(new Date().toISOString())} value={form.occurred_at} onChange={(event) => setForm({ ...form, occurred_at: event.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="safety-location">Local ou setor</Label><Input id="safety-location" className="h-10 rounded-full" maxLength={120} value={form.location_label} onChange={(event) => setForm({ ...form, location_label: event.target.value })} placeholder="Ex.: sala de coleta" /></div>
        </div>
        <div className="space-y-1.5"><Label htmlFor="safety-summary">O que aconteceu? *</Label><Textarea id="safety-summary" className="rounded-xl" maxLength={4000} rows={4} value={form.summary} onChange={(event) => setForm({ ...form, summary: event.target.value })} placeholder="Descreva os fatos sem identificar pacientes ou outras pessoas." /><p className="text-right text-xs text-muted-foreground">{form.summary.length}/4000{form.summary.trim().length > 0 && form.summary.trim().length < 20 ? ' · mínimo de 20 caracteres' : ''}</p></div>
        <div className="space-y-1.5"><Label htmlFor="safety-immediate-action">Ação imediata tomada</Label><Textarea id="safety-immediate-action" className="rounded-xl" maxLength={2000} rows={2} value={form.immediate_action} onChange={(event) => setForm({ ...form, immediate_action: event.target.value })} placeholder="Quais medidas foram tomadas para reduzir o risco?" /></div>
        <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-3"><Checkbox id="safety-confidential" checked={form.reporter_confidential} onCheckedChange={(checked) => setForm({ ...form, reporter_confidential: checked === true })} /><div><Label htmlFor="safety-confidential">Proteger minha identidade dos revisores</Label><p className="text-xs text-muted-foreground">{form.reporter_confidential ? 'Ativado por padrão. Seu relato continuará associado à sua conta para permitir que você acompanhe o protocolo.' : 'Seu nome será exibido para os administradores que revisarem este relato.'}</p></div></div>
        <div className="flex justify-end"><Button className="h-10 rounded-full px-5" disabled={!canSubmit || createReport.isPending} onClick={() => createReport.mutate()}>{createReport.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Enviar relato</Button></div>
      </CardContent>
    </Card>

    <section aria-labelledby="safety-reports-heading" className="space-y-4">
      <div><h2 id="safety-reports-heading" className="text-lg font-semibold">{isAdmin ? 'Relatos da clínica' : 'Meus relatos'}</h2><p className="text-sm text-muted-foreground">A lista não mostra identificação do relator quando a proteção está ativada.</p></div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Buscar relatos" className="h-10 rounded-full pl-9" placeholder="Descrição, local, categoria, responsável..." value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger aria-label="Filtrar por status do relato" className="h-10 w-full rounded-full sm:w-48"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent><SelectItem value="todos">Todos os status</SelectItem>{Object.entries(STATUSES).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={ordenacao} onValueChange={(value) => setOrdenacao(value as Ordenacao)}>
          <SelectTrigger aria-label="Ordenar relatos" className="h-10 w-full rounded-full sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="gravidade">Por gravidade</SelectItem><SelectItem value="mais_recentes">Mais recentes</SelectItem><SelectItem value="mais_antigos">Mais antigos</SelectItem></SelectContent>
        </Select>
        {temFiltro && <Button variant="ghost" size="sm" className="h-10 gap-1.5 rounded-full text-muted-foreground" onClick={limparFiltros}><X aria-hidden="true" className="h-3.5 w-3.5" /> Limpar filtros</Button>}
        <p className="ml-auto text-xs text-muted-foreground" aria-live="polite">{filtrados.length} de {reports.length} {plural(reports.length, 'relato', 'relatos')}</p>
      </div>
      <div role="group" aria-label="Filtrar por gravidade" className="flex flex-wrap gap-1.5">
        {[['todas', 'Todas as gravidades'], ...Object.entries(SEVERITIES)].map(([value, label]) => {
          const ativo = severityFilter === value;
            return <button key={value} type="button" aria-pressed={ativo} onClick={() => setSeverityFilter(value)} className={cn('min-h-11 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2', ativo ? 'border-transparent bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground')}>{label}</button>;
        })}
      </div>

      {reportsQuery.isLoading ? <div className="space-y-3"><Skeleton className="h-24 w-full rounded-2xl" /><Skeleton className="h-24 w-full rounded-2xl" /></div>
        : reportsQuery.isError ? <Card className="rounded-2xl border-border/60 shadow-xs"><CardContent className="py-8 text-center"><p role="alert" className="text-sm text-destructive">Não foi possível carregar os relatos.</p><Button variant="outline" className="mt-3 rounded-full" onClick={() => void reportsQuery.refetch()}>Tentar novamente</Button></CardContent></Card>
          : reports.length === 0 ? <Card className="rounded-xl border-border shadow-xs"><CardContent className="flex flex-col items-center py-12 text-center"><span aria-hidden="true" className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary"><ShieldCheck className="h-6 w-6" /></span><p className="font-medium text-foreground">Nenhum relato registrado</p><p className="mt-1 max-w-sm text-sm text-muted-foreground">Ocorrências e condições de risco aparecerão aqui. Registre o primeiro relato no formulário acima.</p><Button className="mt-4 gap-2" onClick={irParaFormulario}><Plus className="h-4 w-4" /> Registrar relato</Button></CardContent></Card>
            : filtrados.length === 0 ? <Card className="rounded-xl border-border shadow-xs"><CardContent className="flex flex-col items-center py-12 text-center"><span aria-hidden="true" className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Search className="h-6 w-6" /></span><p className="font-medium text-foreground">Nenhum relato corresponde aos filtros</p><p className="mt-1 max-w-sm text-sm text-muted-foreground">Ajuste a busca, a gravidade ou o status para ver outros relatos.</p><Button variant="outline" className="mt-4 gap-1.5" onClick={limparFiltros}><X aria-hidden="true" className="h-3.5 w-3.5" /> Limpar filtros</Button></CardContent></Card>
              : <>
                {renderGrupo('safety-group-open', 'Em acompanhamento', FolderOpen, abertosFiltrados)}
                {renderGrupo('safety-group-closed', 'Encerrados', CheckCircle2, encerradosFiltrados)}
              </>}
    </section>

    <Dialog open={!!reviewing} onOpenChange={(open) => { if (!open) setReviewing(null); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-2xl">
        <DialogHeader><DialogTitle>{isAdmin ? 'Revisar relato assistencial' : 'Acompanhar relato'}</DialogTitle><DialogDescription>O histórico não inclui dados do paciente e fica restrito à equipe autorizada desta clínica.</DialogDescription></DialogHeader>
        {reportDetailQuery.isLoading ? <Skeleton className="h-32 w-full rounded-xl" /> : reportDetailQuery.isError ? <p role="alert" className="text-sm text-destructive">Não foi possível abrir o histórico. Feche e tente novamente.</p> : <div className="space-y-4">
          <div className="rounded-xl border border-border bg-muted/30 p-3"><div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">{reviewing && <Badge variant="outline" className={cn('rounded-full', SEVERITY_CLASSES[reviewing.severity] ?? SEVERITY_CLASSES.low)}>{SEVERITIES[reviewing.severity]}</Badge>}<span>{reviewing && CATEGORIES[reviewing.category]} · {reviewing && formatDate(reviewing.occurred_at)}</span></div><p className="mt-2 whitespace-pre-wrap text-sm">{reportDetailQuery.data?.report.summary}</p><p className="mt-3 text-xs font-semibold">Ação imediata registrada</p><p className="whitespace-pre-wrap text-sm text-muted-foreground">{reportDetailQuery.data?.report.immediate_action || 'Nenhuma ação informada.'}</p></div>
          <div><h3 className="mb-2 text-sm font-semibold">Histórico de revisão</h3>{reportDetailQuery.data?.updates.length ? <ol className="space-y-3 border-l-2 border-border pl-4">{reportDetailQuery.data.updates.map((update) => <li key={update.id} className="space-y-1"><p className="text-xs text-muted-foreground">{STATUSES[update.from_status || 'submitted']} → {STATUSES[update.to_status]} · {formatDate(update.created_at)}</p><p className="text-sm">{update.review_note}</p>{update.corrective_action && <p className="text-sm text-muted-foreground">Ação corretiva: {update.corrective_action}</p>}</li>)}</ol> : <p className="text-sm text-muted-foreground">Ainda não há atualizações de revisão.</p>}</div>
          <div className="space-y-3 border-t pt-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">Pedidos de retificação</h3>{reportDetailQuery.data?.report.is_reporter && !editingCorrection && !reportDetailQuery.data.correctionRequests.some((request) => request.status === 'pending') && <Button variant="outline" className="h-9 rounded-full text-xs" onClick={() => { setCorrectionSummary(reportDetailQuery.data?.report.summary || ''); setCorrectionAction(reportDetailQuery.data?.report.immediate_action || ''); setEditingCorrection(true); }}>Solicitar retificação</Button>}</div>
            {reportDetailQuery.data?.correctionRequests.length ? reportDetailQuery.data.correctionRequests.map((request) => <div key={request.id} className="space-y-2 rounded-xl border border-border/60 p-3"><div className="flex flex-wrap justify-between gap-2"><Badge variant="outline" className={cn('rounded-full', request.status === 'approved' ? 'border-success/30 bg-success/10 text-success' : request.status === 'pending' ? 'border-warning/40 bg-warning/10 text-warning-foreground' : 'border-destructive/30 bg-destructive/10 text-destructive')}>{request.status === 'pending' ? 'Aguardando análise' : request.status === 'approved' ? 'Aprovada' : 'Recusada'}</Badge><span className="text-xs text-muted-foreground">{formatDate(request.created_at)}</span></div><p className="text-xs font-semibold">Versão anterior preservada</p><p className="whitespace-pre-wrap text-sm text-muted-foreground">{request.previous_summary}</p><p className="text-xs font-semibold">Texto proposto</p><p className="whitespace-pre-wrap text-sm">{request.proposed_summary}</p><p className="text-sm"><span className="font-medium">Motivo:</span> {request.reason}</p>{request.review_note && <p className="text-sm text-muted-foreground">Decisão: {request.review_note}</p>}{isAdmin && request.status === 'pending' && <div className="space-y-2 border-t pt-3"><Label htmlFor={`correction-note-${request.id}`}>Nota da decisão *</Label><Textarea id={`correction-note-${request.id}`} value={correctionReviewNote} maxLength={2000} rows={2} onChange={(event) => setCorrectionReviewNote(event.target.value)} placeholder="Explique a aprovação ou recusa." /><div className="flex flex-wrap gap-2"><Button className="h-9 rounded-full text-xs" disabled={correctionReviewNote.trim().length < 3 || resolveCorrection.isPending} onClick={() => resolveCorrection.mutate({ requestId: request.id, status: 'approved' })}>Aprovar e aplicar retificação</Button><Button variant="ghost" className="h-9 rounded-full text-xs text-destructive hover:text-destructive" disabled={correctionReviewNote.trim().length < 3 || resolveCorrection.isPending} onClick={() => resolveCorrection.mutate({ requestId: request.id, status: 'rejected' })}>Recusar pedido</Button></div></div>}</div>) : <p className="text-sm text-muted-foreground">Não há pedidos de retificação.</p>}
            {editingCorrection && <div className="space-y-3 rounded-xl border border-primary/20 bg-muted/30 p-3"><p className="text-sm text-muted-foreground">O texto atual permanece preservado até a análise do administrador. Não inclua identificadores de pacientes.</p><div className="space-y-1.5"><Label htmlFor="correction-summary">Texto corrigido *</Label><Textarea id="correction-summary" maxLength={4000} rows={3} value={correctionSummary} onChange={(event) => setCorrectionSummary(event.target.value)} /></div><div className="space-y-1.5"><Label htmlFor="correction-action">Ação imediata corrigida</Label><Textarea id="correction-action" maxLength={2000} rows={2} value={correctionAction} onChange={(event) => setCorrectionAction(event.target.value)} /></div><div className="space-y-1.5"><Label htmlFor="correction-reason">Motivo da retificação *</Label><Textarea id="correction-reason" maxLength={1000} rows={2} value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} /></div><div className="flex gap-2"><Button disabled={correctionSummary.trim().length < 20 || correctionReason.trim().length < 3 || requestCorrection.isPending} onClick={() => requestCorrection.mutate()}>{requestCorrection.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Enviar pedido</Button><Button variant="outline" onClick={() => setEditingCorrection(false)}>Cancelar</Button></div></div>}
          </div>
          {isAdmin && <div className="space-y-4 border-t pt-4"><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="review-status">Status da revisão</Label><Select value={reviewStatus} onValueChange={setReviewStatus}><SelectTrigger id="review-status" className="h-10 rounded-full"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(STATUSES).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label htmlFor="review-assignee">Responsável</Label><Select value={reviewerId} onValueChange={setReviewerId}><SelectTrigger id="review-assignee" className="h-10 rounded-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sem responsável</SelectItem>{reviewers.map((reviewer) => <SelectItem key={reviewer.id} value={reviewer.id}>{reviewer.nome}</SelectItem>)}</SelectContent></Select></div></div>
            <div className="space-y-1.5"><Label htmlFor="review-due">Prazo da ação</Label><Input id="review-due" type="datetime-local" className="h-10 rounded-full" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></div>
            {reviewStatus === 'action_required' && (reviewerId === 'none' || !dueAt) && <p className="text-xs text-destructive">Atribua um responsável e um prazo para manter este status.</p>}
            <div className="space-y-1.5"><Label htmlFor="review-note">Análise da qualidade *</Label><Textarea id="review-note" maxLength={3000} rows={3} value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder="Registre a análise sem identificar pacientes." /></div>
            <div className="space-y-1.5"><Label htmlFor="review-action">Ação corretiva ou preventiva</Label><Textarea id="review-action" maxLength={3000} rows={3} value={correctiveAction} onChange={(event) => setCorrectiveAction(event.target.value)} placeholder="Descreva a medida, o controle ou o acompanhamento planejado." /></div>
          </div>}
        </div>}
        <DialogFooter><div className="flex flex-col-reverse gap-2 sm:flex-row">{isAdmin && <Button onClick={() => reviewReport.mutate()} disabled={reviewNote.trim().length < 3 || !canReview || reviewReport.isPending || reportDetailQuery.isLoading}>{reviewReport.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar revisão</Button>}<Button variant="outline" onClick={() => setReviewing(null)}>Fechar</Button></div></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
