import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Clock, Loader2, Plus, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { mensagemDeErro } from '@/lib/erros';

type RequestStatus = 'pending' | 'fulfilled' | 'denied';
type AccessRequest = {
  id: string;
  clinica_id: string | null;
  paciente_id: string;
  request_type: 'export' | 'access' | 'correction';
  status: RequestStatus;
  requested_at: string;
  prazo_em: string | null;
  fulfillment_date: string | null;
  updated_at: string;
  responsavel_id: string | null;
  base_legal: string | null;
  evidencia: string | null;
};
type RetentionPolicy = { id: string; categoria: string; retencao_meses: number; base_legal: string; ativo: boolean; updated_at: string };
type RequestDecision = { request: AccessRequest; status: 'fulfilled' | 'denied'; evidence: string };

const STATUS_LABELS: Record<RequestStatus, string> = { pending: 'Pendente', fulfilled: 'Atendida', denied: 'Negada' };
const REQUEST_TYPE_LABELS: Record<AccessRequest['request_type'], string> = { export: 'Exportação', access: 'Acesso', correction: 'Correção' };

function dateTime(value: string | null) {
  if (!value) return 'Não informado';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Data indisponível' : date.toLocaleString('pt-BR');
}

export default function PlatformLGPD() {
  const { user } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const statusLock = useRef(false);
  const policyLock = useRef(false);
  const [decision, setDecision] = useState<RequestDecision | null>(null);
  const [caseSearch, setCaseSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<RequestStatus | 'all'>('all');
  const [categoria, setCategoria] = useState('');
  const [meses, setMeses] = useState('60');
  const [baseLegal, setBaseLegal] = useState('');

  const casos = useQuery({
    queryKey: ['platform-lgpd-cases'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('lgpd_access_request_log')
        .select('id,clinica_id,paciente_id,request_type,status,requested_at,prazo_em,fulfillment_date,updated_at,responsavel_id,base_legal,evidencia')
        .order('requested_at', { ascending: false }).limit(500);
      if (error) throw error;
      return (data || []) as AccessRequest[];
    },
    refetchInterval: 60_000,
  });

  const politicas = useQuery({
    queryKey: ['platform-retention'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('platform_retention_policies')
        .select('id,categoria,retencao_meses,base_legal,ativo,updated_at').order('categoria');
      if (error) throw error;
      return (data || []) as RetentionPolicy[];
    },
  });

  const atualizarStatus = useMutation({
    mutationFn: async (values: RequestDecision) => {
      const { error } = await (supabase as any).rpc('platform_update_lgpd_request', {
        p_id: values.request.id,
        p_status: values.status,
        p_evidence: values.evidence.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setDecision(null);
      toast.success('Decisão registrada com justificativa.');
      void queryClient.invalidateQueries({ queryKey: ['platform-lgpd-cases'] });
    },
    onError: (error) => toast.error('Não foi possível atualizar a solicitação.', { description: mensagemDeErro(error) }),
    onSettled: () => { statusLock.current = false; },
  });

  const criarPolitica = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from('platform_retention_policies').insert({
        categoria: categoria.trim(), retencao_meses: Number(meses), base_legal: baseLegal.trim(), updated_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Política de retenção adicionada.');
      setCategoria('');
      setBaseLegal('');
      void queryClient.invalidateQueries({ queryKey: ['platform-retention'] });
    },
    onError: (error: any) => toast.error(
      error?.code === '23505' ? 'Já existe uma política para essa categoria.' : 'Não foi possível adicionar a política.',
      { description: error?.code === '23505' ? undefined : mensagemDeErro(error) },
    ),
    onSettled: () => { policyLock.current = false; },
  });

  const parsedMonths = Number(meses);
  const policyValid = categoria.trim().length >= 2 && categoria.trim().length <= 100 &&
    baseLegal.trim().length >= 10 && baseLegal.trim().length <= 1000 &&
    Number.isSafeInteger(parsedMonths) && parsedMonths >= 1 && parsedMonths <= 360;
  const evidenceValid = !!decision && decision.evidence.trim().length >= 20 && decision.evidence.trim().length <= 1000;
  const pendentes = useMemo(() => (casos.data || []).filter((item) => item.status === 'pending'), [casos.data]);
  const now = Date.now();
  const vencidos = pendentes.filter((item) => item.prazo_em && new Date(item.prazo_em).getTime() < now).length;
  const visibleCases = useMemo(() => {
    const term = caseSearch.trim().toLocaleLowerCase('pt-BR');
    return (casos.data || []).filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (!term) return true;
      return [
        item.clinica_id,
        item.paciente_id,
        item.request_type,
        REQUEST_TYPE_LABELS[item.request_type],
        item.status,
        STATUS_LABELS[item.status],
        item.base_legal,
        item.evidencia,
      ].some((value) => value?.toLocaleLowerCase('pt-BR').includes(term));
    }).sort((a, b) => {
      const aPending = a.status === 'pending';
      const bPending = b.status === 'pending';
      if (aPending !== bPending) return aPending ? -1 : 1;
      if (aPending && bPending) {
        const aDueTime = a.prazo_em ? new Date(a.prazo_em).getTime() : Number.NaN;
        const bDueTime = b.prazo_em ? new Date(b.prazo_em).getTime() : Number.NaN;
        const aDue = Number.isFinite(aDueTime) ? aDueTime : Number.POSITIVE_INFINITY;
        const bDue = Number.isFinite(bDueTime) ? bDueTime : Number.POSITIVE_INFINITY;
        if (aDue !== bDue) return aDue - bDue;
      }
      return new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime();
    });
  }, [casos.data, caseSearch, statusFilter]);
  const registrarDecisao = () => {
    if (!decision || !evidenceValid || statusLock.current) return;
    statusLock.current = true;
    atualizarStatus.mutate(decision);
  };
  const adicionarPolitica = () => {
    if (!policyValid || policyLock.current) return;
    policyLock.current = true;
    criarPolitica.mutate();
  };

  return (
    <div className="space-y-6 pb-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><ShieldCheck className="h-6 w-6 text-primary" /> LGPD e Conformidade</h1>
          <p className="mt-1 text-sm text-muted-foreground">Acompanhe solicitações dos titulares e regras de retenção sem exibir conteúdo clínico.</p>
        </div>
        <Button variant="outline" className="min-h-11" onClick={() => { void casos.refetch(); void politicas.refetch(); }} disabled={casos.isFetching || politicas.isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${casos.isFetching || politicas.isFetching ? 'animate-spin' : ''}`} /> Atualizar
        </Button>
      </header>

      {casos.isError && <Card className="border-destructive/30"><CardContent className="flex flex-wrap items-center justify-between gap-3 p-4" role="alert"><p className="text-sm text-destructive">Não foi possível carregar as solicitações: {mensagemDeErro(casos.error)}</p><Button variant="outline" onClick={() => void casos.refetch()}>Tentar novamente</Button></CardContent></Card>}
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ['Solicitações carregadas', casos.isError ? '—' : casos.isLoading ? '…' : casos.data?.length || 0],
          ['Pendentes', casos.isError ? '—' : casos.isLoading ? '…' : pendentes.length],
          ['Prazo vencido', casos.isError ? '—' : casos.isLoading ? '…' : vencidos],
        ].map(([label, value]) => <Card key={label}><CardContent className="pt-4"><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-bold">{value}</p></CardContent></Card>)}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Solicitações de titulares</CardTitle>
          <CardDescription>{visibleCases.length} de {casos.data?.length ?? 0} solicitações carregadas. A decisão exige justificativa registrada no histórico; os pendentes com prazo mais próximo aparecem primeiro.</CardDescription>
          <div className="grid gap-2 pt-2 sm:grid-cols-[minmax(14rem,1fr)_12rem]">
            <div className="relative"><Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={caseSearch} onChange={(event) => setCaseSearch(event.target.value)} placeholder="Buscar clínica, titular ou justificativa" aria-label="Buscar solicitações LGPD" /></div>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as RequestStatus | 'all')}><SelectTrigger aria-label="Filtrar solicitações por status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os status</SelectItem><SelectItem value="pending">Pendentes</SelectItem><SelectItem value="fulfilled">Atendidas</SelectItem><SelectItem value="denied">Negadas</SelectItem></SelectContent></Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {casos.isLoading ? <div className="space-y-2">{[1, 2, 3].map((item) => <Skeleton key={item} className="h-20 w-full" />)}</div> : casos.isError ? null : visibleCases.length ? visibleCases.map((caso) => {
            const prazo = caso.prazo_em ? new Date(caso.prazo_em).getTime() : Number.NaN;
            const vencido = caso.status === 'pending' && Number.isFinite(prazo) && prazo < now;
            return (
              <article key={caso.id} className="grid gap-3 rounded-lg border p-3 md:grid-cols-[minmax(10rem,1fr)_10rem_minmax(8rem,1fr)_auto] md:items-center">
                <div>
                  <p className="font-medium">{REQUEST_TYPE_LABELS[caso.request_type] || caso.request_type}</p>
                  <p className="text-xs text-muted-foreground">Clínica {caso.clinica_id || 'não identificada'} · titular {caso.paciente_id.slice(0, 8)}…</p>
                  <p className="text-xs text-muted-foreground">Recebida: {dateTime(caso.requested_at)}</p>
                </div>
                <Badge variant={vencido ? 'destructive' : 'outline'}><Clock className="mr-1 h-3 w-3" />{caso.prazo_em ? `Prazo ${dateTime(caso.prazo_em)}` : 'Sem prazo'}</Badge>
                <div className="space-y-1">
                  <Badge variant={caso.status === 'pending' ? vencido ? 'destructive' : 'secondary' : 'outline'}>{STATUS_LABELS[caso.status] || caso.status}</Badge>
                  <p className="text-xs text-muted-foreground">{caso.status === 'pending' ? caso.base_legal || 'Base legal pendente' : `Atualizada em ${dateTime(caso.updated_at)}`}</p>
                </div>
                {caso.status === 'pending' ? <Button className="min-h-11" onClick={() => setDecision({ request: caso, status: 'fulfilled', evidence: '' })}>Registrar decisão</Button> : <span className="text-xs text-muted-foreground">Responsável: {caso.responsavel_id ? `${caso.responsavel_id.slice(0, 8)}…` : 'não registrado'}</span>}
                {caso.evidencia && <p className="md:col-span-4 whitespace-pre-wrap rounded bg-muted/40 p-2 text-xs">Registro: {caso.evidencia}</p>}
              </article>
            );
          }) : <div className="flex flex-col items-center gap-2 py-8 text-center"><AlertTriangle className="mx-auto h-8 w-8 text-muted-foreground" /><p className="font-medium">{casos.data?.length ? 'Nenhuma solicitação corresponde aos filtros' : 'Nenhuma solicitação encontrada'}</p>{(casos.data?.length ?? 0) > 0 && (caseSearch.trim() || statusFilter !== 'all') && <Button variant="ghost" size="sm" onClick={() => { setCaseSearch(''); setStatusFilter('all'); }}>Limpar filtros</Button>}</div>}
          {casos.data?.length === 500 && <p role="status" className="text-xs text-muted-foreground">Mostrando as 500 solicitações mais recentes.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Políticas de retenção</CardTitle><CardDescription>Defina categoria, prazo de 1 a 360 meses e a base legal aplicável.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(10rem,1fr)_9rem_minmax(16rem,2fr)_auto] lg:items-end">
            <div className="space-y-2"><Label htmlFor="retention-category">Categoria</Label><Input id="retention-category" value={categoria} maxLength={100} disabled={criarPolitica.isPending} onChange={(event) => setCategoria(event.target.value)} placeholder="Categoria" /></div>
            <div className="space-y-2"><Label htmlFor="retention-months">Meses</Label><Input id="retention-months" type="number" min={1} max={360} step={1} value={meses} disabled={criarPolitica.isPending} onChange={(event) => setMeses(event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="retention-legal">Base legal</Label><Input id="retention-legal" value={baseLegal} maxLength={1000} disabled={criarPolitica.isPending} onChange={(event) => setBaseLegal(event.target.value)} placeholder="Base legal e finalidade da retenção" /></div>
            <Button className="min-h-11" onClick={adicionarPolitica} disabled={!policyValid || criarPolitica.isPending}>{criarPolitica.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}Adicionar</Button>
          </div>
          {politicas.isError && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 text-sm text-destructive"><span>Não foi possível carregar as políticas: {mensagemDeErro(politicas.error)}</span><Button variant="link" className="h-auto p-0" onClick={() => void politicas.refetch()}>Tentar novamente</Button></div>}
          {politicas.isLoading ? <div className="space-y-2">{[1, 2].map((item) => <Skeleton key={item} className="h-16 w-full" />)}</div> : politicas.data?.map((politica) => (
            <div key={politica.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
              <div><p className="font-medium">{politica.categoria}</p><p className="text-xs text-muted-foreground">{politica.base_legal}</p></div>
              <div className="flex items-center gap-2"><Badge variant={politica.ativo ? 'outline' : 'secondary'}>{politica.ativo ? 'Ativa' : 'Inativa'}</Badge><Badge>{politica.retencao_meses} meses</Badge></div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={!!decision} onOpenChange={(open) => !open && !atualizarStatus.isPending && setDecision(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar decisão da solicitação</DialogTitle><DialogDescription>{decision ? `${REQUEST_TYPE_LABELS[decision.request.request_type]} · titular ${decision.request.paciente_id.slice(0, 8)}…` : ''}. A decisão e a justificativa serão auditadas.</DialogDescription></DialogHeader>
          {decision && <div className="space-y-4">
            <div className="space-y-2"><Label htmlFor="request-decision">Decisão</Label><Select value={decision.status} disabled={atualizarStatus.isPending} onValueChange={(value) => setDecision((current) => current ? { ...current, status: value as RequestDecision['status'] } : current)}><SelectTrigger id="request-decision"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="fulfilled">Atendida</SelectItem><SelectItem value="denied">Negada</SelectItem></SelectContent></Select></div>
            <div className="space-y-2"><Label htmlFor="request-evidence">Justificativa e evidência (20 a 1.000 caracteres)</Label><Textarea id="request-evidence" value={decision.evidence} maxLength={1000} disabled={atualizarStatus.isPending} onChange={(event) => setDecision((current) => current ? { ...current, evidence: event.target.value } : current)} rows={4} placeholder="Descreva como a solicitação foi atendida ou por que foi negada." /><p className="text-xs text-muted-foreground">{decision.evidence.trim().length}/1.000 caracteres. Evite incluir dados de saúde.</p></div>
          </div>}
          <DialogFooter><Button variant="outline" className="min-h-11" onClick={() => setDecision(null)} disabled={atualizarStatus.isPending}>Cancelar</Button><Button className="min-h-11" onClick={registrarDecisao} disabled={!evidenceValid || atualizarStatus.isPending}>{atualizarStatus.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar decisão</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
