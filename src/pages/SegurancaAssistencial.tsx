import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, AlertTriangle, FilePlus2, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { mensagemDeErro } from '@/lib/erros';

type Report = {
  id: string; category: string; severity: string; occurred_at: string; location_label: string;
  summary: string; immediate_action: string; status: string; reporter_confidential: boolean;
  reporter_display?: string; is_reporter?: boolean; assigned_to: string | null; due_at: string | null; created_at: string; updated_at: string;
};
type Reviewer = { id: string; nome: string };
type ReportUpdate = { id: string; from_status: string | null; to_status: string; review_note: string; corrective_action: string; created_at: string; actor_user_id: string | null };
type CorrectionRequest = { id: string; previous_summary: string; previous_immediate_action: string; proposed_summary: string; proposed_immediate_action: string; reason: string; report_updated_at: string; status: 'pending' | 'approved' | 'rejected'; review_note: string | null; created_at: string; reviewed_at: string | null };
type FormState = { category: string; severity: string; occurred_at: string; location_label: string; summary: string; immediate_action: string; reporter_confidential: boolean };
const EMPTY_REPORTS: Report[] = [];

const CATEGORIES: Record<string, string> = {
  adverse_event: 'Evento adverso', near_miss: 'Quase incidente', unsafe_condition: 'Condição insegura',
  medication: 'Medicação', fall: 'Queda', infection: 'Infecção', equipment: 'Equipamento', other: 'Outro',
};
const SEVERITIES: Record<string, string> = { low: 'Baixa', moderate: 'Moderada', high: 'Alta', critical: 'Crítica' };
const STATUSES: Record<string, string> = {
  submitted: 'Recebido', triage: 'Triagem', investigating: 'Em investigação', action_required: 'Ação necessária',
  monitoring: 'Monitorando', closed: 'Encerrado', reopened: 'Reaberto',
};
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
      toast.success('Relato recebido.');
      void queryClient.invalidateQueries({ queryKey: ['clinical-safety-reports'] });
    },
    onError: (error) => toast.error('Não foi possível registrar o relato.', { description: mensagemDeErro(error) }),
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
      toast.success('Revisão e ação corretiva registradas.');
      setReviewing((current) => current ? { ...current, ...data.report } : current);
      void queryClient.invalidateQueries({ queryKey: ['clinical-safety-reports'] });
      void queryClient.invalidateQueries({ queryKey: ['clinical-safety-report'] });
      setReviewNote('');
      setCorrectiveAction('');
    },
    onError: (error) => toast.error('Não foi possível salvar a revisão.', { description: mensagemDeErro(error) }),
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
      toast.success('Pedido de retificação enviado para análise.');
      setEditingCorrection(false);
      setCorrectionSummary(''); setCorrectionAction(''); setCorrectionReason('');
      void queryClient.invalidateQueries({ queryKey: ['clinical-safety-report'] });
    },
    onError: (error) => toast.error('Não foi possível enviar o pedido.', { description: mensagemDeErro(error) }),
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
      toast.success('Decisão de retificação registrada.');
      setCorrectionReviewNote('');
      void queryClient.invalidateQueries({ queryKey: ['clinical-safety-report'] });
      void queryClient.invalidateQueries({ queryKey: ['clinical-safety-reports'] });
    },
    onError: (error) => toast.error('Não foi possível decidir a retificação.', { description: mensagemDeErro(error) }),
  });

  const reports = reportsQuery.data?.reports ?? EMPTY_REPORTS;
  const counts = useMemo(() => ({
    open: reports.filter((report) => report.status !== 'closed').length,
    critical: reports.filter((report) => report.severity === 'critical').length,
    byCategory: Object.entries(CATEGORIES).map(([key, label]) => ({ key, label, count: reports.filter((report) => report.category === key).length })).filter((item) => item.count > 0),
  }), [reports]);
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

  return <div className="space-y-6 pb-8">
    <header className="rounded-2xl border border-[#e6e2f7] bg-gradient-to-r from-[#f6f4ff] via-white to-[#f0edff] p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-primary/10 p-3 text-primary"><ShieldCheck className="h-6 w-6" /></div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">Qualidade e segurança assistencial</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Registre eventos, quase incidentes e condições inseguras para análise e melhoria do cuidado.</p>
          <p className="mt-2 text-xs text-muted-foreground">Se houver risco imediato à vida, acione os serviços de emergência e o protocolo interno antes de registrar.</p>
        </div>
        <Button variant="outline" aria-label="Atualizar relatos" onClick={() => void reportsQuery.refetch()} disabled={reportsQuery.isFetching}><RefreshCw className={`h-4 w-4 ${reportsQuery.isFetching ? 'animate-spin' : ''}`} /></Button>
      </div>
    </header>

    <section className="grid gap-3 sm:grid-cols-2" aria-label="Indicadores de segurança assistencial">
      <Card><CardContent className="flex items-center gap-3 p-4"><Activity className="h-5 w-5 text-primary" /><div><p className="text-xs text-muted-foreground">Relatos abertos</p><p className="text-xl font-semibold">{reportsQuery.isLoading ? '—' : counts.open}</p></div></CardContent></Card>
      <Card><CardContent className="flex items-center gap-3 p-4"><AlertTriangle className="h-5 w-5 text-destructive" /><div><p className="text-xs text-muted-foreground">Criticidade crítica</p><p className="text-xl font-semibold">{reportsQuery.isLoading ? '—' : counts.critical}</p></div></CardContent></Card>
    </section>
    {!!counts.byCategory.length && <section aria-label="Relatos por categoria" className="flex flex-wrap gap-2">{counts.byCategory.map((item) => <Badge key={item.key} variant="outline">{item.label}: {item.count}</Badge>)}</section>}

    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><FilePlus2 className="h-5 w-5" /> Registrar ocorrência ou risco</CardTitle><CardDescription>Não informe nome, CPF, CNS ou outros dados que identifiquem o paciente. O relato fica restrito a esta clínica.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5"><Label htmlFor="safety-category">Categoria</Label><Select value={form.category} onValueChange={(category) => setForm({ ...form, category })}><SelectTrigger id="safety-category"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(CATEGORIES).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label htmlFor="safety-severity">Gravidade</Label><Select value={form.severity} onValueChange={(severity) => setForm({ ...form, severity })}><SelectTrigger id="safety-severity"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(SEVERITIES).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label htmlFor="safety-occurred">Quando aconteceu</Label><Input id="safety-occurred" type="datetime-local" max={localDateTime(new Date().toISOString())} value={form.occurred_at} onChange={(event) => setForm({ ...form, occurred_at: event.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="safety-location">Local ou setor</Label><Input id="safety-location" maxLength={120} value={form.location_label} onChange={(event) => setForm({ ...form, location_label: event.target.value })} placeholder="Ex.: sala de coleta" /></div>
        </div>
        <div className="space-y-1.5"><Label htmlFor="safety-summary">O que aconteceu? *</Label><Textarea id="safety-summary" maxLength={4000} rows={4} value={form.summary} onChange={(event) => setForm({ ...form, summary: event.target.value })} placeholder="Descreva os fatos sem identificar pacientes ou outras pessoas." /><p className="text-right text-xs text-muted-foreground">{form.summary.length}/4000</p></div>
        <div className="space-y-1.5"><Label htmlFor="safety-immediate-action">Ação imediata tomada</Label><Textarea id="safety-immediate-action" maxLength={2000} rows={2} value={form.immediate_action} onChange={(event) => setForm({ ...form, immediate_action: event.target.value })} placeholder="Quais medidas foram tomadas para reduzir o risco?" /></div>
        <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3"><Checkbox id="safety-confidential" checked={form.reporter_confidential} onCheckedChange={(checked) => setForm({ ...form, reporter_confidential: checked === true })} /><div><Label htmlFor="safety-confidential">Proteger minha identidade dos revisores</Label><p className="text-xs text-muted-foreground">{form.reporter_confidential ? 'Ativado por padrão. Seu relato continuará associado à sua conta para permitir que você acompanhe o protocolo.' : 'Seu nome será exibido para os administradores que revisarem este relato.'}</p></div></div>
        <Button disabled={!canSubmit || createReport.isPending} onClick={() => createReport.mutate()}>{createReport.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Enviar relato</Button>
      </CardContent>
    </Card>

    <section aria-labelledby="safety-reports-heading" className="space-y-3">
      <div><h2 id="safety-reports-heading" className="text-lg font-semibold">{isAdmin ? 'Relatos da clínica' : 'Meus relatos'}</h2><p className="text-sm text-muted-foreground">A lista não mostra identificação do relator quando a proteção está ativada.</p></div>
      {reportsQuery.isLoading ? <div className="space-y-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>
        : reportsQuery.isError ? <Card><CardContent className="py-8 text-center"><p role="alert" className="text-sm text-destructive">Não foi possível carregar os relatos.</p><Button variant="outline" className="mt-3" onClick={() => void reportsQuery.refetch()}>Tentar novamente</Button></CardContent></Card>
          : reports.length === 0 ? <Card><CardContent className="py-10 text-center"><ShieldCheck className="mx-auto mb-2 h-8 w-8 text-muted-foreground" /><p className="font-medium">Nenhum relato registrado</p><p className="mt-1 text-sm text-muted-foreground">Ocorrências e condições de risco aparecerão aqui.</p></CardContent></Card>
            : reports.map((report) => <Card key={report.id}><CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3"><div className="space-y-1"><p className="text-sm font-semibold">{CATEGORIES[report.category] || 'Relato assistencial'} <span className="font-normal text-muted-foreground">· {formatDate(report.occurred_at)}</span></p><p className="text-xs text-muted-foreground">{report.location_label || 'Local não informado'} · Relatado em {formatDate(report.created_at)}</p></div><div className="flex flex-wrap gap-2"><Badge variant={report.severity === 'critical' || report.severity === 'high' ? 'destructive' : 'secondary'}>{SEVERITIES[report.severity] || report.severity}</Badge><Badge variant={report.status === 'closed' ? 'outline' : 'secondary'}>{STATUSES[report.status] || report.status}</Badge>{isAdmin && report.reporter_confidential && <Badge variant="outline">Identidade protegida</Badge>}</div></div>
              <p className="whitespace-pre-wrap break-words text-sm">{report.summary}</p>
              <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted-foreground">{isAdmin && report.reporter_display ? `Relator: ${report.reporter_display}` : ''}{report.assigned_to ? ` · Responsável: ${reportsQuery.data?.reviewers.find((reviewer) => reviewer.id === report.assigned_to)?.nome || 'Definido'}` : ''}{report.due_at ? ` · Prazo ${formatDate(report.due_at)}` : ''}</p><Button variant="outline" size="sm" onClick={() => openReview(report)}>{isAdmin ? 'Revisar e acompanhar' : 'Acompanhar relato'}</Button></div>
            </CardContent></Card>)}
    </section>

    <Dialog open={!!reviewing} onOpenChange={(open) => { if (!open) setReviewing(null); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{isAdmin ? 'Revisar relato assistencial' : 'Acompanhar relato'}</DialogTitle><DialogDescription>O histórico não inclui dados do paciente e fica restrito à equipe autorizada desta clínica.</DialogDescription></DialogHeader>
        {reportDetailQuery.isLoading ? <Skeleton className="h-32 w-full" /> : reportDetailQuery.isError ? <p role="alert" className="text-sm text-destructive">Não foi possível abrir o histórico. Feche e tente novamente.</p> : <div className="space-y-4">
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{reviewing && CATEGORIES[reviewing.category]} · {reviewing && SEVERITIES[reviewing.severity]} · {reviewing && formatDate(reviewing.occurred_at)}</p><p className="mt-2 whitespace-pre-wrap text-sm">{reportDetailQuery.data?.report.summary}</p><p className="mt-3 text-xs font-semibold">Ação imediata registrada</p><p className="whitespace-pre-wrap text-sm text-muted-foreground">{reportDetailQuery.data?.report.immediate_action || 'Nenhuma ação informada.'}</p></div>
          <div><h3 className="mb-2 text-sm font-semibold">Histórico de revisão</h3>{reportDetailQuery.data?.updates.length ? <ol className="space-y-3 border-l pl-4">{reportDetailQuery.data.updates.map((update) => <li key={update.id} className="space-y-1"><p className="text-xs text-muted-foreground">{STATUSES[update.from_status || 'submitted']} → {STATUSES[update.to_status]} · {formatDate(update.created_at)}</p><p className="text-sm">{update.review_note}</p>{update.corrective_action && <p className="text-sm text-muted-foreground">Ação corretiva: {update.corrective_action}</p>}</li>)}</ol> : <p className="text-sm text-muted-foreground">Ainda não há atualizações de revisão.</p>}</div>
          <div className="space-y-3 border-t pt-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">Pedidos de retificação</h3>{reportDetailQuery.data?.report.is_reporter && !editingCorrection && !reportDetailQuery.data.correctionRequests.some((request) => request.status === 'pending') && <Button variant="outline" size="sm" onClick={() => { setCorrectionSummary(reportDetailQuery.data?.report.summary || ''); setCorrectionAction(reportDetailQuery.data?.report.immediate_action || ''); setEditingCorrection(true); }}>Solicitar retificação</Button>}</div>
            {reportDetailQuery.data?.correctionRequests.length ? reportDetailQuery.data.correctionRequests.map((request) => <div key={request.id} className="space-y-2 rounded-lg border p-3"><div className="flex flex-wrap justify-between gap-2"><Badge variant={request.status === 'approved' ? 'outline' : request.status === 'pending' ? 'secondary' : 'destructive'}>{request.status === 'pending' ? 'Aguardando análise' : request.status === 'approved' ? 'Aprovada' : 'Recusada'}</Badge><span className="text-xs text-muted-foreground">{formatDate(request.created_at)}</span></div><p className="text-xs font-semibold">Versão anterior preservada</p><p className="whitespace-pre-wrap text-sm text-muted-foreground">{request.previous_summary}</p><p className="text-xs font-semibold">Texto proposto</p><p className="whitespace-pre-wrap text-sm">{request.proposed_summary}</p><p className="text-sm"><span className="font-medium">Motivo:</span> {request.reason}</p>{request.review_note && <p className="text-sm text-muted-foreground">Decisão: {request.review_note}</p>}{isAdmin && request.status === 'pending' && <div className="space-y-2 border-t pt-3"><Label htmlFor={`correction-note-${request.id}`}>Nota da decisão *</Label><Textarea id={`correction-note-${request.id}`} value={correctionReviewNote} maxLength={2000} rows={2} onChange={(event) => setCorrectionReviewNote(event.target.value)} placeholder="Explique a aprovação ou recusa." /><div className="flex flex-wrap gap-2"><Button size="sm" disabled={correctionReviewNote.trim().length < 3 || resolveCorrection.isPending} onClick={() => resolveCorrection.mutate({ requestId: request.id, status: 'approved' })}>Aprovar e aplicar retificação</Button><Button size="sm" variant="outline" disabled={correctionReviewNote.trim().length < 3 || resolveCorrection.isPending} onClick={() => resolveCorrection.mutate({ requestId: request.id, status: 'rejected' })}>Recusar pedido</Button></div></div>}</div>) : <p className="text-sm text-muted-foreground">Não há pedidos de retificação.</p>}
            {editingCorrection && <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/[0.02] p-3"><p className="text-sm text-muted-foreground">O texto atual permanece preservado até a análise do administrador. Não inclua identificadores de pacientes.</p><div className="space-y-1.5"><Label htmlFor="correction-summary">Texto corrigido *</Label><Textarea id="correction-summary" maxLength={4000} rows={3} value={correctionSummary} onChange={(event) => setCorrectionSummary(event.target.value)} /></div><div className="space-y-1.5"><Label htmlFor="correction-action">Ação imediata corrigida</Label><Textarea id="correction-action" maxLength={2000} rows={2} value={correctionAction} onChange={(event) => setCorrectionAction(event.target.value)} /></div><div className="space-y-1.5"><Label htmlFor="correction-reason">Motivo da retificação *</Label><Textarea id="correction-reason" maxLength={1000} rows={2} value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} /></div><div className="flex gap-2"><Button disabled={correctionSummary.trim().length < 20 || correctionReason.trim().length < 3 || requestCorrection.isPending} onClick={() => requestCorrection.mutate()}>{requestCorrection.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Enviar pedido</Button><Button variant="outline" onClick={() => setEditingCorrection(false)}>Cancelar</Button></div></div>}
          </div>
          {isAdmin && <div className="space-y-4 border-t pt-4"><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="review-status">Status</Label><Select value={reviewStatus} onValueChange={setReviewStatus}><SelectTrigger id="review-status"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(STATUSES).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label htmlFor="review-assignee">Responsável</Label><Select value={reviewerId} onValueChange={setReviewerId}><SelectTrigger id="review-assignee"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sem responsável</SelectItem>{(reportsQuery.data?.reviewers ?? []).map((reviewer) => <SelectItem key={reviewer.id} value={reviewer.id}>{reviewer.nome}</SelectItem>)}</SelectContent></Select></div></div>
            <div className="space-y-1.5"><Label htmlFor="review-due">Prazo da ação</Label><Input id="review-due" type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></div>
            {reviewStatus === 'action_required' && (reviewerId === 'none' || !dueAt) && <p className="text-xs text-destructive">Atribua um responsável e um prazo para manter este status.</p>}
            <div className="space-y-1.5"><Label htmlFor="review-note">Análise da qualidade *</Label><Textarea id="review-note" maxLength={3000} rows={3} value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder="Registre a análise sem identificar pacientes." /></div>
            <div className="space-y-1.5"><Label htmlFor="review-action">Ação corretiva ou preventiva</Label><Textarea id="review-action" maxLength={3000} rows={3} value={correctiveAction} onChange={(event) => setCorrectiveAction(event.target.value)} placeholder="Descreva a medida, o controle ou o acompanhamento planejado." /></div>
          </div>}
        </div>}
        <DialogFooter>{isAdmin && <Button onClick={() => reviewReport.mutate()} disabled={reviewNote.trim().length < 3 || !canReview || reviewReport.isPending || reportDetailQuery.isLoading}>{reviewReport.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar revisão</Button>}<Button variant="outline" onClick={() => setReviewing(null)}>Fechar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
