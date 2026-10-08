import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, Clock3, Eye, Loader2, RefreshCw, Search, ShieldCheck, X } from 'lucide-react';
import { toast } from 'sonner';

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { mensagemDeErro } from '@/lib/erros';

type SupportRequest = {
  id: string;
  clinica_id: string;
  reason: string;
  scopes: string[];
  status: 'requested' | 'approved' | 'denied' | 'revoked' | 'expired';
  expires_at: string | null;
  created_at: string;
};

type SupportContext = {
  request_id: string;
  clinica_id: string;
  expires_at: string;
  scopes: string[];
  active_users: number | null;
  failed_automations_24h: number | null;
  open_support_tickets: number | null;
};

type Confirmation = { request: SupportRequest; action: 'approved' | 'denied' | 'revoked' } | null;

const statusLabels: Record<SupportRequest['status'], string> = {
  requested: 'Aguardando decisão',
  approved: 'Aprovado',
  denied: 'Negado',
  revoked: 'Revogado',
  expired: 'Expirado',
};

const scopeLabels: Record<string, string> = {
  diagnostics: 'Indicadores operacionais',
  integration_logs: 'Logs de integração',
  configuration: 'Configuração',
};

function dataHora(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Data indisponível' : date.toLocaleString('pt-BR');
}

function statusAtual(request: SupportRequest): SupportRequest['status'] {
  if (request.status === 'approved' && request.expires_at && new Date(request.expires_at).getTime() <= Date.now()) return 'expired';
  return request.status;
}

export default function AcessoAssistido() {
  const { isPlatformAdmin: plataforma, profile } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const requestLock = useRef(false);
  const decisionLock = useRef(false);
  const revokeLock = useRef(false);
  const [clinicaId, setClinicaId] = useState('');
  const [reason, setReason] = useState('');
  const [requestSearch, setRequestSearch] = useState('');
  const [requestStatusFilter, setRequestStatusFilter] = useState<SupportRequest['status'] | 'all'>('all');
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [context, setContext] = useState<SupportContext | null>(null);

  const clinics = useQuery({
    queryKey: ['support-access-clinics'],
    enabled: plataforma,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('clinicas').select('id,nome').eq('arquivada', false).order('nome');
      if (error) throw error;
      return (data || []) as Array<{ id: string; nome: string }>;
    },
  });

  const requests = useQuery({
    queryKey: ['support-access-requests', plataforma ? 'platform' : 'clinic', profile?.clinica_id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('support_access_requests')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as SupportRequest[];
    },
    refetchInterval: 60_000,
  });

  const refreshRequests = () => queryClient.invalidateQueries({ queryKey: ['support-access-requests'] });

  const requestAccess = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc('request_support_access', {
        p_clinica_id: clinicaId,
        p_reason: reason.trim(),
        p_scopes: ['diagnostics'],
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      setReason('');
      toast.success('Pedido enviado para aprovação da clínica.');
      void refreshRequests();
    },
    onError: (error) => toast.error('Não foi possível criar o pedido.', { description: mensagemDeErro(error) }),
    onSettled: () => { requestLock.current = false; },
  });

  const decideAccess = useMutation({
    mutationFn: async ({ requestId, decision }: { requestId: string; decision: 'approved' | 'denied' }) => {
      const { error } = await (supabase as any).rpc('decide_support_access', {
        p_request_id: requestId,
        p_decision: decision,
        p_hours: 2,
      });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      setContext(null);
      toast.success(variables.decision === 'approved' ? 'Acesso autorizado por 2 horas.' : 'Pedido de acesso negado.');
      void refreshRequests();
    },
    onError: (error) => toast.error('Não foi possível registrar a decisão.', { description: mensagemDeErro(error) }),
    onSettled: () => { decisionLock.current = false; },
  });

  const revokeAccess = useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await (supabase as any).rpc('revoke_support_access', { p_request_id: requestId });
      if (error) throw error;
    },
    onSuccess: () => {
      setContext(null);
      toast.success('Acesso assistido revogado.');
      void refreshRequests();
    },
    onError: (error) => toast.error('Não foi possível revogar o acesso.', { description: mensagemDeErro(error) }),
    onSettled: () => { revokeLock.current = false; },
  });

  const loadContext = useMutation({
    mutationFn: async (requestId: string) => {
      const { data, error } = await (supabase as any).rpc('platform_support_context', { p_request_id: requestId });
      if (error) throw error;
      return data as SupportContext;
    },
    onSuccess: (data) => setContext(data),
    onError: (error) => toast.error('O diagnóstico não está disponível.', { description: mensagemDeErro(error) }),
  });

  const actionBusy = decideAccess.isPending || revokeAccess.isPending;
  const visibleRequests = (requests.data || []).filter((request) => {
    const currentStatus = statusAtual(request);
    if (requestStatusFilter !== 'all' && currentStatus !== requestStatusFilter) return false;
    const term = requestSearch.trim().toLocaleLowerCase('pt-BR');
    if (!term) return true;
    const clinicName = clinics.data?.find((clinic) => clinic.id === request.clinica_id)?.nome || '';
    return [request.reason, clinicName, request.clinica_id, request.id, statusLabels[currentStatus], ...(request.scopes || []).map((scope) => scopeLabels[scope] || scope)]
      .some((value) => value?.toLocaleLowerCase('pt-BR').includes(term));
  });
  useEffect(() => {
    if (!context) return;
    const expiresAt = new Date(context.expires_at).getTime();
    const remaining = expiresAt - Date.now();
    if (!Number.isFinite(expiresAt) || remaining <= 0) {
      setContext(null);
      return;
    }
    const timeout = window.setTimeout(() => setContext(null), remaining);
    return () => window.clearTimeout(timeout);
  }, [context]);

  useEffect(() => {
    if (!context || !requests.data) return;
    const activeRequest = requests.data.find((request) => request.id === context.request_id);
    if (!activeRequest || statusAtual(activeRequest) !== 'approved') setContext(null);
  }, [context, requests.data]);

  const confirmAction = () => {
    if (!confirmation) return;
    const { request, action } = confirmation;
    if (action === 'revoked') {
      if (revokeLock.current) return;
      revokeLock.current = true;
    } else {
      if (decisionLock.current) return;
      decisionLock.current = true;
    }
    setConfirmation(null);
    if (action === 'revoked') revokeAccess.mutate(request.id);
    else decideAccess.mutate({ requestId: request.id, decision: action });
  };

  const enviarPedido = () => {
    if (!clinicaId || reason.trim().length < 10 || reason.trim().length > 500 || requestLock.current) return;
    requestLock.current = true;
    requestAccess.mutate();
  };

  const titleConfirm = confirmation?.action === 'approved'
    ? 'Autorizar suporte por 2 horas?'
    : confirmation?.action === 'denied'
      ? 'Negar este pedido de suporte?'
      : 'Revogar o acesso assistido?';
  const descriptionConfirm = confirmation?.action === 'approved'
    ? 'A equipe da plataforma poderá consultar apenas os indicadores operacionais e os escopos descritos no pedido. A autorização expira automaticamente em 2 horas.'
    : confirmation?.action === 'denied'
      ? 'O suporte não receberá acesso aos indicadores desta clínica.'
      : 'O acesso será encerrado imediatamente. Esta ação também ficará registrada na trilha de auditoria.';

  return (
    <div className="space-y-6 pb-8">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><ShieldCheck className="h-6 w-6 text-primary" /> Acesso assistido</h1>
        <p className="mt-1 text-sm text-muted-foreground">Acesso temporário, aprovado pela clínica e limitado a dados operacionais. Ações registradas em auditoria.</p>
      </header>

      {plataforma && (
        <Card>
          <CardHeader>
            <CardTitle>Solicitar acesso à clínica</CardTitle>
            <CardDescription>A clínica precisa aprovar o pedido. Este escopo libera apenas indicadores operacionais e expira após 2 horas; não inclui logs nem dados clínicos de pacientes.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-[minmax(14rem,1fr)_minmax(18rem,2fr)_auto] sm:items-end">
            <div className="space-y-2">
              <Label htmlFor="support-clinic">Clínica</Label>
              <Select value={clinicaId} onValueChange={setClinicaId} disabled={requestAccess.isPending}>
                <SelectTrigger id="support-clinic" aria-label="Clínica">
                  <SelectValue placeholder="Selecione uma clínica" />
                </SelectTrigger>
                <SelectContent>
                  {clinics.data?.map((clinic) => <SelectItem key={clinic.id} value={clinic.id}>{clinic.nome}</SelectItem>)}
                </SelectContent>
              </Select>
              {clinics.isError && <p role="alert" className="text-xs text-destructive">Não foi possível carregar clínicas. Atualize a página e tente novamente.</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="support-reason">Motivo do pedido</Label>
              <Input id="support-reason" value={reason} maxLength={500} disabled={requestAccess.isPending} onChange={(event) => setReason(event.target.value)} placeholder="Descreva o problema que precisa ser investigado" />
              <p className="text-xs text-muted-foreground">Mínimo de 10 caracteres. Não inclua dados de pacientes.</p>
            </div>
            <Button
              className="min-h-11 gap-2"
              disabled={!clinicaId || reason.trim().length < 10 || reason.trim().length > 500 || requestAccess.isPending || clinics.isLoading}
              onClick={enviarPedido}
            >
              {requestAccess.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Enviar pedido
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>{plataforma ? 'Pedidos enviados' : 'Pedidos de suporte à clínica'}</CardTitle>
            <CardDescription>{visibleRequests.length} de {requests.data?.length ?? 0} pedidos carregados. {plataforma ? 'Acompanhe as autorizações concedidas pela equipe da clínica.' : 'Revise o motivo e os escopos antes de autorizar a equipe da plataforma.'}</CardDescription>
          </div>
          <Button variant="outline" size="icon" className="h-11 w-11 shrink-0" aria-label="Atualizar pedidos" onClick={() => void requests.refetch()} disabled={requests.isFetching}>
            <RefreshCw className={`h-4 w-4 ${requests.isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {requests.isLoading ? (
            <div className="space-y-3">{[1, 2].map((item) => <Skeleton key={item} className="h-24 w-full" />)}</div>
          ) : requests.isError ? (
            <div role="alert" className="rounded-lg border border-destructive/30 p-4 text-sm">
              <p className="font-medium">Não foi possível carregar os pedidos.</p>
              <p className="mt-1 text-muted-foreground">{mensagemDeErro(requests.error)}</p>
              <Button className="mt-3" variant="outline" onClick={() => void requests.refetch()}>Tentar novamente</Button>
            </div>
          ) : requests.data?.length ? (
            <>
            <div className="grid gap-2 sm:grid-cols-[minmax(14rem,1fr)_12rem]">
              <div className="relative"><Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={requestSearch} onChange={(event) => setRequestSearch(event.target.value)} placeholder="Buscar motivo, clínica ou código" aria-label="Buscar pedidos de acesso assistido" /></div>
              <Select value={requestStatusFilter} onValueChange={(value) => setRequestStatusFilter(value as SupportRequest['status'] | 'all')}><SelectTrigger aria-label="Filtrar pedidos por status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os status</SelectItem>{Object.entries(statusLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
            </div>
            {visibleRequests.length ? visibleRequests.map((request) => {
              const status = statusAtual(request);
              const canDecide = !plataforma && status === 'requested';
              const canRevoke = status === 'approved';
              return (
                <article key={request.id} className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={status === 'approved' ? 'default' : status === 'denied' || status === 'revoked' ? 'destructive' : 'secondary'}>{statusLabels[status]}</Badge>
                      {status === 'approved' && request.expires_at && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="h-3 w-3" /> Expira {dataHora(request.expires_at)}</span>}
                    </div>
                    <p className="break-words font-medium">{request.reason}</p>
                    {plataforma && <p className="text-xs text-muted-foreground">Clínica: {clinics.data?.find((clinic) => clinic.id === request.clinica_id)?.nome || request.clinica_id}</p>}
                    <p className="text-xs text-muted-foreground">{(request.scopes || []).map((scope) => scopeLabels[scope] || scope).join(' · ') || 'Sem escopos informados'}</p>
                    <p className="text-xs text-muted-foreground">Criado em {dataHora(request.created_at)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 sm:justify-end">
                    {canDecide && <>
                      <Button className="min-h-11 gap-2" variant="outline" onClick={() => setConfirmation({ request, action: 'denied' })} disabled={actionBusy}>
                        <X className="h-4 w-4" /> Negar
                      </Button>
                      <Button className="min-h-11 gap-2" onClick={() => setConfirmation({ request, action: 'approved' })} disabled={actionBusy}>
                        <Check className="h-4 w-4" /> Autorizar por 2h
                      </Button>
                    </>}
                    {plataforma && status === 'approved' && <Button className="min-h-11 gap-2" variant="outline" onClick={() => loadContext.mutate(request.id)} disabled={loadContext.isPending}>
                      {loadContext.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                      Ver diagnóstico
                    </Button>}
                    {canRevoke && <Button className="min-h-11 gap-2" variant="ghost" onClick={() => setConfirmation({ request, action: 'revoked' })} disabled={actionBusy}>
                      <X className="h-4 w-4" /> Revogar
                    </Button>}
                  </div>
                </article>
              );
            }) : <div className="flex flex-col items-center gap-2 py-6 text-center"><p className="text-sm text-muted-foreground">Nenhum pedido corresponde à busca ou ao status.</p><Button variant="ghost" size="sm" onClick={() => { setRequestSearch(''); setRequestStatusFilter('all'); }}>Limpar filtros</Button></div>}
            {requests.data.length === 100 && <p role="status" className="text-xs text-muted-foreground">Mostrando os 100 pedidos mais recentes. Pedidos mais antigos podem não aparecer aqui.</p>}
            </>
          ) : (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <ShieldCheck className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-2 font-medium">Nenhum pedido de acesso</p>
              <p className="mt-1 text-sm text-muted-foreground">Quando houver um pedido, ele aparecerá aqui para revisão.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {context && (
        <Card>
          <CardHeader>
            <CardTitle>Diagnóstico operacional autorizado</CardTitle>
            <CardDescription>Indicadores sem prontuários ou identificação de pacientes. Autorização expira em {dataHora(context.expires_at)}.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border p-4"><p className="text-sm text-muted-foreground">Usuários ativos</p><p className="mt-1 text-2xl font-semibold">{context.active_users ?? '—'}</p></div>
            <div className="rounded-lg border p-4"><p className="text-sm text-muted-foreground">Falhas de automação · 24h</p><p className="mt-1 text-2xl font-semibold">{context.failed_automations_24h ?? '—'}</p></div>
            <div className="rounded-lg border p-4"><p className="text-sm text-muted-foreground">Chamados em aberto</p><p className="mt-1 text-2xl font-semibold">{context.open_support_tickets ?? '—'}</p></div>
            <p className="sm:col-span-3 text-xs text-muted-foreground">Escopos autorizados: {context.scopes.map((scope) => scopeLabels[scope] || scope).join(' · ')}</p>
            <Button className="min-h-11 sm:col-span-3 sm:justify-self-end" variant="outline" onClick={() => setContext(null)}>Fechar diagnóstico</Button>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={!!confirmation} onOpenChange={(open) => !open && setConfirmation(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-warning" />{titleConfirm}</AlertDialogTitle>
            <AlertDialogDescription>{descriptionConfirm}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionBusy}>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={(event) => { event.preventDefault(); confirmAction(); }} disabled={actionBusy}>
              {actionBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
