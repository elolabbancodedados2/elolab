import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CalendarDays, ClipboardList, Loader2, MapPin, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { UnsavedChangesGuard } from '@/components/UnsavedChangesGuard';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { mensagemDeErro } from '@/lib/erros';
import { cn } from '@/lib/utils';
import {
  CATEGORIES, formatDate, localDateTime, SAFETY_TOAST_OPTIONS, SEVERITIES, SEVERITY_CLASSES, STATUSES,
  STATUS_CLASSES,
} from '@/lib/seguranca-assistencial';
import type { CorrectionRequest, Report, ReportUpdate, Reviewer, SafetyFilters } from '@/lib/seguranca-assistencial';

type ReportDetail = { report: Report; updates: ReportUpdate[]; correctionRequests: CorrectionRequest[] };

function useSafetyReport(reportId?: string) {
  const { profile, user } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const location = useLocation();
  const safetyFilters = (location.state as { safetyFilters?: Partial<SafetyFilters> } | null)?.safetyFilters;
  const isAdmin = profile?.roles?.includes('admin') ?? false;
  const reportQueryKey = ['clinical-safety-report', profile?.clinica_id, user?.id, reportId] as const;
  const detailQuery = useQuery({
    queryKey: reportQueryKey,
    enabled: Boolean(profile?.clinica_id && user?.id && reportId),
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('seguranca-assistencial', { body: { action: 'get', report_id: reportId } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return {
        report: data.report as Report,
        updates: (data.updates ?? []) as ReportUpdate[],
        correctionRequests: (data.correction_requests ?? []) as CorrectionRequest[],
      } satisfies ReportDetail;
    },
  });
  return { profile, user, queryClient, detailQuery, reportQueryKey, safetyFilters, isAdmin };
}

function SafetyBackLink({ safetyFilters }: { safetyFilters?: Partial<SafetyFilters> }) {
  return <Button asChild variant="outline" className="rounded-full"><Link to="/seguranca-assistencial" state={{ safetyFilters }}><ArrowLeft aria-hidden="true" className="mr-2 h-4 w-4" />Voltar aos relatos</Link></Button>;
}

function DetailLoading() {
  return <div className="space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-36 w-full rounded-xl" /><Skeleton className="h-48 w-full rounded-xl" /></div>;
}

function DetailError({ onRetry }: { onRetry: () => void }) {
  return <Card className="rounded-xl"><CardContent className="py-10 text-center"><p role="alert" className="text-sm text-destructive">Não foi possível carregar este relato. Ele pode não existir ou você não ter acesso.</p><Button variant="outline" className="mt-4 rounded-full" onClick={onRetry}>Tentar novamente</Button></CardContent></Card>;
}

export function SegurancaAssistencialDetalhePage() {
  const { reportId } = useParams();
  const { isAdmin, detailQuery, safetyFilters, profile, user, queryClient, reportQueryKey } = useSafetyReport(reportId);
  const report = detailQuery.data?.report;
  const [reviewStatus, setReviewStatus] = useState('triage');
  const [reviewerId, setReviewerId] = useState('none');
  const [dueAt, setDueAt] = useState('');
  const [reviewExpectedUpdatedAt, setReviewExpectedUpdatedAt] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [correctiveAction, setCorrectiveAction] = useState('');
  const [correctionReviewNote, setCorrectionReviewNote] = useState('');
  const [reviewDirty, setReviewDirty] = useState(false);
  const [decisionDirty, setDecisionDirty] = useState(false);
  const completed = useRef(false);
  const initializedReportId = useRef<string | null>(null);

  useEffect(() => {
    if (!report || initializedReportId.current === report.id) return;
    initializedReportId.current = report.id;
    setReviewStatus(report.status === 'submitted' ? 'triage' : report.status);
    setReviewerId(report.assigned_to || 'none');
    setDueAt(localDateTime(report.due_at));
    setReviewExpectedUpdatedAt(report.updated_at);
  }, [report]);

  const reviewersQuery = useQuery({
    queryKey: ['clinical-safety-reports', profile?.clinica_id, user?.id],
    enabled: Boolean(isAdmin && profile?.clinica_id && user?.id),
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('seguranca-assistencial', { body: { action: 'list' } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return { reports: (data?.reports ?? []) as Report[], reviewers: (data?.reviewers ?? []) as Reviewer[] };
    },
  });
  const reviewers = reviewersQuery.data?.reviewers ?? [];

  const reviewReport = useMutation({
    mutationFn: async () => {
      if (!report) throw new Error('Relato não encontrado.');
      const { data, error } = await supabase.functions.invoke('seguranca-assistencial', {
        body: { action: 'update', report_id: report.id, update: {
          status: reviewStatus, assigned_to: reviewerId === 'none' ? null : reviewerId,
          due_at: dueAt ? new Date(dueAt).toISOString() : null, expected_updated_at: reviewExpectedUpdatedAt,
          review_note: reviewNote.trim(), corrective_action: correctiveAction.trim(),
        } },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: async (data) => {
      toast.success('Revisão e ação corretiva registradas.', SAFETY_TOAST_OPTIONS);
      setReviewNote('');
      setCorrectiveAction('');
      setReviewDirty(false);
      completed.current = true;
      if (data.report?.updated_at) setReviewExpectedUpdatedAt(data.report.updated_at);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: reportQueryKey }),
        queryClient.invalidateQueries({ queryKey: ['clinical-safety-reports'] }),
      ]);
    },
    onError: (error) => toast.error('Não foi possível salvar a revisão.', { ...SAFETY_TOAST_OPTIONS, description: mensagemDeErro(error) }),
  });

  const resolveCorrection = useMutation({
    mutationFn: async ({ requestId, status }: { requestId: string; status: 'approved' | 'rejected' }) => {
      if (!report) throw new Error('Relato não encontrado.');
      const { data, error } = await supabase.functions.invoke('seguranca-assistencial', {
        body: { action: 'resolve_correction', report_id: report.id, correction_id: requestId, decision: {
          status, expected_report_updated_at: report.updated_at, review_note: correctionReviewNote.trim(),
        } },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: async () => {
      toast.success('Decisão de retificação registrada.', SAFETY_TOAST_OPTIONS);
      setCorrectionReviewNote('');
      setDecisionDirty(false);
      completed.current = true;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: reportQueryKey }),
        queryClient.invalidateQueries({ queryKey: ['clinical-safety-reports'] }),
      ]);
    },
    onError: (error) => toast.error('Não foi possível decidir a retificação.', { ...SAFETY_TOAST_OPTIONS, description: mensagemDeErro(error) }),
  });

  const canReview = reviewNote.trim().length >= 3 && reviewNote.trim().length <= 3000 && correctiveAction.length <= 3000
    && (reviewStatus !== 'action_required' || (reviewerId !== 'none' && !!dueAt));
  const correctionPending = detailQuery.data?.correctionRequests.some((request) => request.status === 'pending') ?? false;
  const pageTitle = isAdmin ? 'Revisar relato assistencial' : 'Acompanhar relato';

  return <div className="space-y-6 pb-8">
    <PageHeader title={pageTitle} description="Histórico, responsáveis e ações deste relato, restritos à equipe autorizada da clínica." icon={<ShieldCheck />} actions={<SafetyBackLink safetyFilters={safetyFilters} />} />
    {detailQuery.isLoading ? <DetailLoading /> : detailQuery.isError || !report ? <DetailError onRetry={() => void detailQuery.refetch()} /> : <>
      <Card className="rounded-xl border-border/70 shadow-xs">
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className={cn('rounded-full', SEVERITY_CLASSES[report.severity] ?? SEVERITY_CLASSES.low)}>{SEVERITIES[report.severity] || report.severity}</Badge><Badge variant="outline" className={cn('rounded-full', STATUS_CLASSES[report.status] ?? STATUS_CLASSES.submitted)}>{STATUSES[report.status] || report.status}</Badge><span className="text-xs text-muted-foreground">Relatado em {formatDate(report.created_at)}</span></div>
              <h2 className="text-lg font-semibold">{CATEGORIES[report.category] || 'Relato assistencial'}</h2>
            </div>
            {report.reporter_confidential && isAdmin && <Badge variant="outline" className="rounded-full">Identidade protegida</Badge>}
          </div>
          <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
            <p className="inline-flex items-center gap-2 text-sm text-muted-foreground"><CalendarDays aria-hidden="true" className="h-4 w-4 shrink-0" />Ocorrência: {formatDate(report.occurred_at)}</p>
            <p className="inline-flex items-center gap-2 text-sm text-muted-foreground"><MapPin aria-hidden="true" className="h-4 w-4 shrink-0" />{report.location_label || 'Local não informado'}</p>
          </div>
          <section aria-labelledby="safety-report-summary-heading"><h3 id="safety-report-summary-heading" className="text-sm font-semibold">Descrição da ocorrência</h3><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{report.summary}</p></section>
          <section aria-labelledby="safety-report-immediate-heading"><h3 id="safety-report-immediate-heading" className="text-sm font-semibold">Ação imediata registrada</h3><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{report.immediate_action || 'Nenhuma ação informada.'}</p></section>
        </CardContent>
      </Card>

      <section aria-labelledby="safety-history-heading" className="space-y-3">
        <div className="flex items-center gap-2"><ClipboardList aria-hidden="true" className="h-4 w-4 text-primary" /><h2 id="safety-history-heading" className="text-base font-semibold">Histórico de revisão</h2></div>
        {detailQuery.data.updates.length ? <ol className="space-y-3 border-l-2 border-border pl-4">{detailQuery.data.updates.map((update) => <li key={update.id} className="space-y-1"><p className="text-xs text-muted-foreground">{STATUSES[update.from_status || 'submitted']} → {STATUSES[update.to_status]} · {formatDate(update.created_at)}</p><p className="whitespace-pre-wrap text-sm">{update.review_note}</p>{update.corrective_action && <p className="whitespace-pre-wrap text-sm text-muted-foreground">Ação corretiva: {update.corrective_action}</p>}</li>)}</ol> : <p className="text-sm text-muted-foreground">Ainda não há atualizações de revisão.</p>}
      </section>

      <section aria-labelledby="safety-corrections-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="safety-corrections-heading" className="text-base font-semibold">Pedidos de retificação</h2>{report.is_reporter && !correctionPending && <Button asChild variant="outline" className="h-9 rounded-full text-xs"><Link to={`/seguranca-assistencial/${report.id}/retificacao`} state={{ safetyFilters }}>Solicitar retificação</Link></Button>}</div>
        {detailQuery.data.correctionRequests.length ? detailQuery.data.correctionRequests.map((request) => <CorrectionRequestRecord key={request.id} request={request} isAdmin={isAdmin} correctionReviewNote={correctionReviewNote} onNoteChange={(value) => { completed.current = false; setDecisionDirty(true); setCorrectionReviewNote(value); }} onDecision={(status) => resolveCorrection.mutate({ requestId: request.id, status })} busy={resolveCorrection.isPending} />) : <p className="text-sm text-muted-foreground">Não há pedidos de retificação.</p>}
      </section>

      {isAdmin && <Card className="rounded-xl border-border/70 shadow-xs"><CardContent className="space-y-4 p-4 sm:p-5">
        <div><h2 className="text-base font-semibold">Revisão e acompanhamento</h2><p className="text-sm text-muted-foreground">A mudança de status é registrada no histórico. Para ação necessária, responsável e prazo são obrigatórios.</p></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="review-status">Status da revisão</Label><Select value={reviewStatus} onValueChange={(value) => { completed.current = false; setReviewDirty(true); setReviewStatus(value); }}><SelectTrigger id="review-status" className="h-10 rounded-full"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(STATUSES).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label htmlFor="review-assignee">Responsável</Label><Select value={reviewerId} onValueChange={(value) => { completed.current = false; setReviewDirty(true); setReviewerId(value); }}><SelectTrigger id="review-assignee" className="h-10 rounded-full"><SelectValue placeholder="Selecione um profissional" /></SelectTrigger><SelectContent><SelectItem value="none">Sem responsável</SelectItem>{reviewers.map((reviewer) => <SelectItem key={reviewer.id} value={reviewer.id}>{reviewer.nome}</SelectItem>)}</SelectContent></Select></div>
        </div>
        <div className="space-y-1.5"><Label htmlFor="review-due">Prazo da ação</Label><Input id="review-due" type="datetime-local" className="h-10 rounded-full" value={dueAt} onChange={(event) => { completed.current = false; setReviewDirty(true); setDueAt(event.target.value); }} /></div>
        {reviewStatus === 'action_required' && (reviewerId === 'none' || !dueAt) && <p className="text-xs text-destructive">Atribua um responsável e um prazo para manter este status.</p>}
        <div className="space-y-1.5"><Label htmlFor="review-note">Análise da qualidade *</Label><Textarea id="review-note" maxLength={3000} rows={3} value={reviewNote} onChange={(event) => { completed.current = false; setReviewDirty(true); setReviewNote(event.target.value); }} placeholder="Registre a análise sem identificar pacientes." /></div>
        <div className="space-y-1.5"><Label htmlFor="review-action">Ação corretiva ou preventiva</Label><Textarea id="review-action" maxLength={3000} rows={3} value={correctiveAction} onChange={(event) => { completed.current = false; setReviewDirty(true); setCorrectiveAction(event.target.value); }} placeholder="Descreva a medida, o controle ou o acompanhamento planejado." /></div>
        {reviewersQuery.isError && <p role="alert" className="text-sm text-destructive">Não foi possível carregar os profissionais responsáveis. Atualize o relato para tentar novamente.</p>}
        <div className="flex justify-end"><Button onClick={() => reviewReport.mutate()} disabled={!canReview || reviewReport.isPending || detailQuery.isFetching}>{reviewReport.isPending && <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />}Salvar revisão</Button></div>
      </CardContent></Card>}
    </>}
    <UnsavedChangesGuard dirty={reviewDirty || decisionDirty} busy={reviewReport.isPending || resolveCorrection.isPending} completed={completed} />
  </div>;
}

function CorrectionRequestRecord({ request, isAdmin, correctionReviewNote, onNoteChange, onDecision, busy }: {
  request: CorrectionRequest;
  isAdmin: boolean;
  correctionReviewNote: string;
  onNoteChange: (value: string) => void;
  onDecision: (status: 'approved' | 'rejected') => void;
  busy: boolean;
}) {
  const statusLabel = request.status === 'pending' ? 'Aguardando análise' : request.status === 'approved' ? 'Aprovada' : 'Recusada';
  const statusClass = request.status === 'approved' ? 'border-success/30 bg-success/10 text-success' : request.status === 'pending' ? 'border-warning/40 bg-warning/10 text-warning-foreground' : 'border-destructive/30 bg-destructive/10 text-destructive';
  return <Card className="rounded-xl border-border/70"><CardContent className="space-y-3 p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><Badge variant="outline" className={cn('rounded-full', statusClass)}>{statusLabel}</Badge><span className="text-xs text-muted-foreground">{formatDate(request.created_at)}</span></div>
    <div className="grid gap-3 sm:grid-cols-2"><div><h3 className="text-xs font-semibold">Versão anterior preservada</h3><p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{request.previous_summary}</p><p className="mt-2 text-xs font-medium">Ação imediata: {request.previous_immediate_action || 'não informada'}</p></div><div><h3 className="text-xs font-semibold">Texto proposto</h3><p className="mt-1 whitespace-pre-wrap text-sm">{request.proposed_summary}</p><p className="mt-2 text-xs font-medium">Ação imediata: {request.proposed_immediate_action || 'não informada'}</p></div></div>
    <p className="text-sm"><span className="font-medium">Motivo:</span> {request.reason}</p>
    {request.review_note && <p className="text-sm text-muted-foreground">Decisão: {request.review_note}</p>}
    {isAdmin && request.status === 'pending' && <div className="space-y-2 border-t pt-3"><Label htmlFor={`correction-note-${request.id}`}>Nota da decisão *</Label><Textarea id={`correction-note-${request.id}`} value={correctionReviewNote} maxLength={2000} rows={2} onChange={(event) => onNoteChange(event.target.value)} placeholder="Explique a aprovação ou recusa." /><div className="flex flex-wrap gap-2"><Button disabled={correctionReviewNote.trim().length < 3 || busy} onClick={() => onDecision('approved')}>Aprovar e aplicar retificação</Button><Button variant="ghost" className="text-destructive hover:text-destructive" disabled={correctionReviewNote.trim().length < 3 || busy} onClick={() => onDecision('rejected')}>Recusar pedido</Button></div></div>}
  </CardContent></Card>;
}

export function SolicitarRetificacaoPage() {
  const { reportId } = useParams();
  const navigate = useNavigate();
  const { detailQuery, queryClient, reportQueryKey, safetyFilters } = useSafetyReport(reportId);
  const report = detailQuery.data?.report;
  const pending = detailQuery.data?.correctionRequests.some((request) => request.status === 'pending') ?? false;
  const [summary, setSummary] = useState('');
  const [action, setAction] = useState('');
  const [reason, setReason] = useState('');
  const [dirty, setDirty] = useState(false);
  const completed = useRef(false);
  const initializedReportId = useRef<string | null>(null);

  useEffect(() => {
    if (!report || initializedReportId.current === report.id) return;
    initializedReportId.current = report.id;
    setSummary(report.summary);
    setAction(report.immediate_action || '');
  }, [report]);

  const requestCorrection = useMutation({
    mutationFn: async () => {
      if (!report) throw new Error('Relato não encontrado.');
      const { data, error } = await supabase.functions.invoke('seguranca-assistencial', {
        body: { action: 'request_correction', report_id: report.id, request: {
          proposed_summary: summary.trim(), proposed_immediate_action: action.trim(), reason: reason.trim(),
        } },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: async () => {
      toast.success('Pedido de retificação enviado para análise.', SAFETY_TOAST_OPTIONS);
      completed.current = true;
      await queryClient.invalidateQueries({ queryKey: reportQueryKey });
      navigate(`/seguranca-assistencial/${reportId}`, { replace: true, state: { safetyFilters } });
    },
    onError: (error) => toast.error('Não foi possível enviar o pedido.', { ...SAFETY_TOAST_OPTIONS, description: mensagemDeErro(error) }),
  });

  const canSubmit = summary.trim().length >= 20 && summary.trim().length <= 4000 && action.length <= 2000 && reason.trim().length >= 3 && reason.trim().length <= 1000;
  return <div className="space-y-6 pb-8">
    <PageHeader title="Solicitar retificação do relato" description="A versão original permanece registrada até a análise do administrador. Não inclua identificadores de pacientes." icon={<ShieldCheck />} actions={<SafetyBackLink safetyFilters={safetyFilters} />} />
    {detailQuery.isLoading ? <DetailLoading /> : detailQuery.isError || !report ? <DetailError onRetry={() => void detailQuery.refetch()} /> : !report.is_reporter ? <Card className="rounded-xl"><CardContent className="py-8"><p role="alert" className="text-sm text-destructive">Somente quem registrou este relato pode solicitar a retificação.</p></CardContent></Card> : pending ? <Card className="rounded-xl"><CardContent className="space-y-3 py-8"><Badge variant="outline" className="rounded-full border-warning/40 bg-warning/10 text-warning-foreground">Aguardando análise</Badge><p className="text-sm text-muted-foreground">Já existe um pedido pendente para este relato. Acompanhe a decisão no histórico.</p><SafetyBackLink safetyFilters={safetyFilters} /></CardContent></Card> : <>
      <Card className="rounded-xl border-border/70"><CardContent className="space-y-3 p-4 sm:p-5"><div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className={cn('rounded-full', SEVERITY_CLASSES[report.severity] ?? SEVERITY_CLASSES.low)}>{SEVERITIES[report.severity] || report.severity}</Badge><span className="text-sm font-semibold">{CATEGORIES[report.category] || 'Relato assistencial'}</span><span className="text-xs text-muted-foreground">{formatDate(report.occurred_at)}</span></div><h2 className="text-sm font-semibold">Texto atual</h2><p className="whitespace-pre-wrap text-sm">{report.summary}</p><p className="text-xs text-muted-foreground">Ação imediata: {report.immediate_action || 'não informada'}</p></CardContent></Card>
      <Card className="rounded-xl border-border/70"><CardContent className="space-y-4 p-4 sm:p-5">
        <div className="space-y-1.5"><Label htmlFor="correction-summary">Texto corrigido *</Label><Textarea id="correction-summary" maxLength={4000} rows={5} value={summary} onChange={(event) => { completed.current = false; setDirty(true); setSummary(event.target.value); }} /><p className="text-right text-xs text-muted-foreground">{summary.length}/4000{summary.trim().length > 0 && summary.trim().length < 20 ? ' · mínimo de 20 caracteres' : ''}</p></div>
        <div className="space-y-1.5"><Label htmlFor="correction-action">Ação imediata corrigida</Label><Textarea id="correction-action" maxLength={2000} rows={3} value={action} onChange={(event) => { completed.current = false; setDirty(true); setAction(event.target.value); }} /></div>
        <div className="space-y-1.5"><Label htmlFor="correction-reason">Motivo da retificação *</Label><Textarea id="correction-reason" maxLength={1000} rows={3} value={reason} onChange={(event) => { completed.current = false; setDirty(true); setReason(event.target.value); }} placeholder="Explique o que precisa ser corrigido." /></div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button asChild variant="outline"><Link to={`/seguranca-assistencial/${report.id}`} state={{ safetyFilters }}>Cancelar</Link></Button><Button disabled={!canSubmit || requestCorrection.isPending} onClick={() => requestCorrection.mutate()}>{requestCorrection.isPending && <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />}Enviar pedido de retificação</Button></div>
      </CardContent></Card>
    </>}
    <UnsavedChangesGuard dirty={dirty} busy={requestCorrection.isPending} completed={completed} />
  </div>;
}
