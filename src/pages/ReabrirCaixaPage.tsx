import { useEffect, useRef, useState } from 'react';
import { useBlocker, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, ShieldCheck, Unlock } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/ErrorState';
import { UnsavedChangesDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { validarResultadoRpcCaixa } from '@/lib/caixaDiario';
import { mensagemDeErro } from '@/lib/erros';
import { todaySaoPauloDateOnly } from '@/lib/dateOnly';

type CashRecord = {
  id: string;
  data: string;
  aberto: boolean;
  valor_abertura: number;
  operador_abertura: string | null;
  clinica_id: string;
};

function persistCashState(state: unknown, userId?: string | null, clinicId?: string | null) {
  let saved = true;
  const entries = [
    userId ? [`caixa_estado_${userId}`, state] as const : null,
    clinicId ? [`caixa_estado_clinica_${clinicId}`, state] as const : null,
  ].filter(Boolean) as Array<readonly [string, unknown]>;
  for (const [key, value] of entries) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { saved = false; }
  }
  return saved;
}

export default function ReabrirCaixaPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const today = todaySaoPauloDateOnly();
  const routeState = location.state as { returnTo?: unknown; cashTab?: unknown } | null;
  const returnTo = typeof routeState?.returnTo === 'string' && /^\/(?:recepcao\?tab=caixa|caixa-diario)$/.test(routeState.returnTo)
    ? routeState.returnTo : '/caixa-diario';
  const returnTab = routeState?.cashTab === 'historico' ? 'historico' : 'hoje';
  const roles = new Set([...(profile?.roles ?? []), ...(profile?.role ? [profile.role] : [])]);
  const canReopen = roles.has('admin') || roles.has('financeiro');
  const [reason, setReason] = useState('');
  const [submitError, setSubmitError] = useState('');
  const navigationAllowed = useRef(false);

  const cashQuery = useQuery({
    queryKey: ['cash-reopen-record', profile?.clinica_id ?? null, today],
    enabled: Boolean(profile?.clinica_id),
    queryFn: async () => {
      const { data, error } = await supabase.from('caixa_diario')
        .select('id, data, aberto, valor_abertura, operador_abertura, clinica_id')
        .eq('data', today).eq('clinica_id', profile!.clinica_id!).maybeSingle();
      if (error) throw error;
      return data as CashRecord | null;
    },
  });

  const reopenMutation = useMutation({
    mutationFn: async () => {
      if (!canReopen) throw new Error('A reabertura exige perfil de administrador ou financeiro.');
      if (!profile?.clinica_id) throw new Error('Clínica não identificada. Atualize a sessão e tente novamente.');
      if (reason.trim().length < 10 || reason.trim().length > 500) throw new Error('Informe um motivo entre 10 e 500 caracteres.');

      const { data: current, error: readError } = await supabase.from('caixa_diario')
        .select('id, data, aberto, valor_abertura, operador_abertura, clinica_id')
        .eq('data', today).eq('clinica_id', profile.clinica_id).maybeSingle();
      if (readError) throw readError;
      if (!current) throw new Error('Não há caixa registrado hoje para reabrir.');
      if (current.aberto) return { cash: current as CashRecord, alreadyOpen: true };

      const { data, error } = await supabase.rpc('reabrir_caixa_diario', { p_motivo: reason.trim() });
      if (error) {
        // If the server committed but the response was lost, recognize the persisted state before retrying.
        const { data: persisted } = await supabase.from('caixa_diario')
          .select('id, data, aberto, valor_abertura, operador_abertura, clinica_id')
          .eq('id', current.id).eq('clinica_id', profile.clinica_id).maybeSingle();
        if (persisted?.aberto) return { cash: persisted as CashRecord, alreadyOpen: true };
        throw error;
      }
      validarResultadoRpcCaixa(data);
      return { cash: current as CashRecord, alreadyOpen: false };
    },
    onSuccess: async ({ cash, alreadyOpen }) => {
      const saved = persistCashState({ aberto: true, data: today, valorAbertura: cash.valor_abertura, operador: cash.operador_abertura }, profile?.id, profile?.clinica_id);
      toast.success(alreadyOpen ? 'O caixa já está aberto' : 'Caixa reaberto', {
        description: alreadyOpen ? 'Os dados foram atualizados com o estado atual do caixa.' : 'O fechamento anterior permanece no histórico.',
      });
      if (!saved) toast.warning('A reabertura foi registrada, mas a recepção pode exibir o estado anterior até atualizar. Recarregue a tela da recepção.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['caixa-hoje'] }),
        queryClient.invalidateQueries({ queryKey: ['caixa-diario-eventos'] }),
        queryClient.invalidateQueries({ queryKey: ['caixa-estado-recepcao'] }),
        queryClient.invalidateQueries({ queryKey: ['caixa-diario'] }),
        queryClient.invalidateQueries({ queryKey: ['historico-caixas'] }),
        queryClient.invalidateQueries({ queryKey: ['cash-history-record', profile?.clinica_id ?? null] }),
        queryClient.invalidateQueries({ queryKey: ['cash-history-events', profile?.clinica_id ?? null] }),
      ]);
      navigationAllowed.current = true;
      navigate(returnTo, { replace: true, state: { cashTab: returnTab } });
    },
    onError: async error => {
      setSubmitError(mensagemDeErro(error));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['cash-reopen-record', profile?.clinica_id ?? null, today] }),
        queryClient.invalidateQueries({ queryKey: ['caixa-hoje'] }),
        queryClient.invalidateQueries({ queryKey: ['caixa-diario-eventos'] }),
      ]);
    },
  });

  const hasUnsavedChanges = reason.trim().length > 0;
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    hasUnsavedChanges && !reopenMutation.isPending && !navigationAllowed.current &&
    (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search));

  useEffect(() => { navigationAllowed.current = false; }, [location.pathname, location.search]);
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [hasUnsavedChanges]);

  const back = () => navigate(returnTo, { state: { cashTab: returnTab } });

  if (!canReopen) {
    return <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 sm:px-6"><PageHeader title="Reabrir caixa" description="Operação com registro de auditoria." icon={<Unlock />} /><Card role="alert"><CardContent className="space-y-3 p-5"><p className="text-sm text-destructive">A reabertura exige perfil de administrador ou financeiro.</p><Button variant="outline" onClick={back}>Voltar ao caixa</Button></CardContent></Card></div>;
  }

  const cash = cashQuery.data;
  const busy = cashQuery.isLoading;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 pb-28 sm:px-6 sm:pb-8">
      <PageHeader title="Reabrir caixa fechado" description={`Reabertura do caixa diário · ${new Date(`${today}T12:00:00`).toLocaleDateString('pt-BR')}`} icon={<Unlock />} actions={<Button variant="outline" onClick={back} disabled={reopenMutation.isPending}><ArrowLeft className="mr-2 h-4 w-4" />Voltar ao caixa diário</Button>} />

      {busy ? <div aria-busy="true" className="space-y-4 rounded-lg border border-border bg-card p-6"><div className="h-5 w-2/5 animate-pulse rounded bg-muted" /><div className="h-24 w-full animate-pulse rounded bg-muted" /></div>
        : cashQuery.error ? <ErrorState title="Não foi possível conferir o estado do caixa" error={cashQuery.error} onRetry={() => void cashQuery.refetch()} />
          : !cash ? <Card role="status"><CardHeader><CardTitle>Não há caixa registrado hoje</CardTitle></CardHeader><CardContent className="space-y-4"><p className="text-sm text-muted-foreground">A reabertura só está disponível para um caixa que foi fechado nesta data.</p><Button variant="outline" onClick={back}>Voltar ao caixa diário</Button></CardContent></Card>
            : cash.aberto ? <Card role="status"><CardHeader><CardTitle>O caixa de hoje já está aberto</CardTitle></CardHeader><CardContent className="space-y-4"><p className="text-sm text-muted-foreground">A abertura atual foi registrada por {cash.operador_abertura || 'um operador'}. Nenhuma nova operação foi enviada.</p><Button onClick={back}>Ir ao caixa diário</Button></CardContent></Card>
              : <Card>
                <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-5 w-5 text-primary" />Reabertura com rastreabilidade</CardTitle></CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid gap-4 border-b border-border pb-4 text-sm sm:grid-cols-3">
                    <div><p className="text-xs text-muted-foreground">Operador da abertura</p><p className="mt-1 font-medium">{cash.operador_abertura || 'Não informado'}</p></div>
                    <div><p className="text-xs text-muted-foreground">Valor de abertura</p><p className="mt-1 font-medium tabular-nums">{Number(cash.valor_abertura).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p></div>
                    <div><p className="text-xs text-muted-foreground">Estado atual</p><p className="mt-1 font-medium">Fechado · {new Date(`${cash.data}T12:00:00`).toLocaleDateString('pt-BR')}</p></div>
                  </div>
                  <p className="text-sm text-muted-foreground">A operação será registrada com seu nome, horário e justificativa. O fechamento anterior continuará no histórico do caixa.</p>
                  <div className="space-y-2">
                    <Label htmlFor="cash-reopen-reason">Motivo da reabertura <span aria-hidden="true">*</span></Label>
                    <Textarea id="cash-reopen-reason" value={reason} onChange={event => { setReason(event.target.value); setSubmitError(''); }} maxLength={500} rows={5} aria-describedby="cash-reopen-help" aria-invalid={reason.trim().length > 0 && reason.trim().length < 10} placeholder="Explique o que precisa ser corrigido ou registrado após o fechamento." />
                    <div id="cash-reopen-help" className="flex justify-between gap-3 text-xs text-muted-foreground"><span>Mínimo de 10 caracteres; ficará visível no histórico de auditoria.</span><span aria-live="polite">{reason.trim().length}/500</span></div>
                  </div>
                  {reason.trim().length > 0 && reason.trim().length < 10 && <p role="alert" className="text-sm text-destructive">Descreva o motivo com pelo menos 10 caracteres.</p>}
                  {submitError && <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">Não foi possível reabrir o caixa. {submitError}</div>}
                  <Separator />
                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button variant="outline" onClick={back} disabled={reopenMutation.isPending}>Cancelar</Button>
                    <Button onClick={() => reopenMutation.mutate()} disabled={reason.trim().length < 10 || reason.trim().length > 500 || reopenMutation.isPending} className="gap-2">
                      {reopenMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}{reopenMutation.isPending ? 'Reabrindo caixa…' : 'Confirmar reabertura'}
                    </Button>
                  </div>
                </CardContent>
              </Card>}
      <UnsavedChangesDialog open={blocker.state === 'blocked'} onOpenChange={open => { if (!open && blocker.state === 'blocked') blocker.reset(); }} onConfirm={() => { if (blocker.state === 'blocked') { navigationAllowed.current = true; blocker.proceed(); } }} />
    </div>
  );
}
