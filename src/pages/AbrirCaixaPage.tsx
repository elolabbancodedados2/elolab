import { useEffect, useRef, useState } from 'react';
import { useBlocker, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Unlock } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/ErrorState';
import { UnsavedChangesDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { validarResultadoRpcCaixa } from '@/lib/caixaDiario';
import { mensagemDeErro } from '@/lib/erros';
import { formatWithDatePreference as format } from '@/lib/datePreference';
import { todaySaoPauloDateOnly } from '@/lib/dateOnly';

interface CaixaAbertoAntigo {
  id: string;
  data: string;
  valor_abertura: number;
  operador_abertura: string | null;
}

function parseMoneyInput(value: string): number | null {
  const compact = value.trim().replace(/\s/g, '');
  if (!compact) return null;
  const br = /^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/;
  const decimal = /^\d+(?:\.\d{1,2})?$/;
  if (!br.test(compact) && !decimal.test(compact)) return null;
  const normalized = compact.includes(',') ? compact.replace(/\./g, '').replace(',', '.') : compact;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function persistCashState(state: unknown, userId?: string | null, clinicId?: string | null): boolean {
  const entries = [
    userId ? [`caixa_estado_${userId}`, state] as const : null,
    clinicId ? [`caixa_estado_clinica_${clinicId}`, state] as const : null,
  ].filter(Boolean) as Array<readonly [string, unknown]>;
  let saved = true;
  for (const [key, value] of entries) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { saved = false; }
  }
  return saved;
}

export default function AbrirCaixaPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const routeState = location.state as { returnTo?: unknown } | null;
  const returnTo = typeof routeState?.returnTo === 'string' && /^\/recepcao(?:\?tab=caixa)?$/.test(routeState.returnTo)
    ? routeState.returnTo
    : '/recepcao?tab=caixa';
  const today = todaySaoPauloDateOnly();
  const [amount, setAmount] = useState('');
  const [submitError, setSubmitError] = useState('');
  const navigationAllowed = useRef(false);
  const amountValue = parseMoneyInput(amount);
  const amountInvalid = amountValue === null || amountValue < 0 || Math.abs(amountValue * 100 - Math.round(amountValue * 100)) > 1e-7;

  const caixaHojeQuery = useQuery({
    queryKey: ['caixa-hoje', today, profile?.clinica_id ?? null],
    enabled: Boolean(profile?.clinica_id),
    queryFn: async () => {
      const { data, error } = await supabase.from('caixa_diario')
        .select('id, data, aberto, valor_abertura, operador_abertura')
        .eq('data', today)
        .eq('clinica_id', profile!.clinica_id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const caixasAntigosQuery = useQuery({
    queryKey: ['caixas-abertos-antigos', profile?.clinica_id ?? null, today],
    enabled: Boolean(profile?.clinica_id),
    queryFn: async () => {
      const { data, error } = await supabase.from('caixa_diario')
        .select('id, data, valor_abertura, operador_abertura')
        .eq('clinica_id', profile!.clinica_id!)
        .eq('aberto', true)
        .lt('data', today)
        .order('data', { ascending: false });
      if (error) throw error;
      return (data ?? []) as CaixaAbertoAntigo[];
    },
  });

  const openMutation = useMutation({
    mutationFn: async (value: number) => {
      if (!profile?.id || !profile.clinica_id) throw new Error('Não identificamos a clínica ativa. Atualize a sessão e tente novamente.');
      if (!Number.isFinite(value) || value < 0 || Math.abs(value * 100 - Math.round(value * 100)) > 1e-7) {
        throw new Error('Informe um valor igual ou maior que zero, com até duas casas decimais.');
      }
      const { data, error } = await supabase.rpc('abrir_caixa_diario', { p_valor_abertura: value });
      if (error) throw error;
      validarResultadoRpcCaixa(data);
      return value;
    },
    onSuccess: async value => {
      const saved = persistCashState({ aberto: true, data: today, valorAbertura: value, operador: profile?.nome }, profile?.id, profile?.clinica_id);
      toast.success('Caixa aberto com sucesso!');
      if (!saved) toast.warning('O caixa foi aberto, mas a recepção pode precisar atualizar o estado. Recarregue a tela da recepção.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['caixa-hoje'] }),
        queryClient.invalidateQueries({ queryKey: ['caixa-estado-recepcao'] }),
        queryClient.invalidateQueries({ queryKey: ['caixa-diario'] }),
      ]);
      navigationAllowed.current = true;
      navigate(returnTo, { replace: true });
    },
    onError: async error => {
      setSubmitError(mensagemDeErro(error));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['caixa-hoje'] }),
        queryClient.invalidateQueries({ queryKey: ['caixa-estado-recepcao'] }),
      ]);
    },
  });

  const hasUnsavedChanges = amount.trim().length > 0;
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    hasUnsavedChanges && !openMutation.isPending && !navigationAllowed.current &&
    (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search));

  useEffect(() => { navigationAllowed.current = false; }, [location.pathname, location.search]);
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [hasUnsavedChanges]);

  const voltar = () => navigate(returnTo);
  const busy = caixaHojeQuery.isLoading || caixasAntigosQuery.isLoading;
  const readError = caixaHojeQuery.error || caixasAntigosQuery.error;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 pb-28 sm:px-6 sm:pb-8">
      <PageHeader
        title="Abrir caixa"
        description={`Abertura do caixa diário · ${format(new Date(`${today}T12:00:00`), 'dd/MM/yyyy')}`}
        icon={<Unlock />}
        actions={<Button variant="outline" onClick={voltar}><ArrowLeft className="mr-2 h-4 w-4" />Voltar ao caixa diário</Button>}
      />

      {busy ? (
        <div aria-busy="true" className="space-y-4 rounded-lg border border-border bg-card p-6">
          <div className="h-5 w-2/5 animate-pulse rounded bg-muted" />
          <div className="h-10 w-full animate-pulse rounded bg-muted" />
        </div>
      ) : readError ? (
        <ErrorState title="Não foi possível conferir o estado do caixa" error={readError} onRetry={() => { void caixaHojeQuery.refetch(); void caixasAntigosQuery.refetch(); }} />
      ) : caixaHojeQuery.data ? (
        <Card role="status">
          <CardHeader><CardTitle>{caixaHojeQuery.data.aberto ? 'O caixa de hoje já está aberto' : 'O caixa de hoje já foi encerrado'}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">Abertura registrada por {caixaHojeQuery.data.operador_abertura || 'um operador'} · R$ {Number(caixaHojeQuery.data.valor_abertura).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.</p>
            {!caixaHojeQuery.data.aberto && <p className="text-sm text-muted-foreground">Este caixa já foi fechado e mantém o registro do dia. Não é possível abrir outro para a mesma data.</p>}
            <Button onClick={voltar}>Ir ao caixa diário</Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {caixasAntigosQuery.data?.length ? (
            <section role="status" className="space-y-2 rounded-md border border-warning/30 bg-warning/5 p-4">
              <h2 className="font-semibold text-foreground">Há caixas de dias anteriores ainda abertos</h2>
              <p className="text-sm text-muted-foreground">Revise as datas abaixo. A abertura de hoje continua disponível, como no fluxo atual.</p>
              <ul className="space-y-1 text-sm">
                {caixasAntigosQuery.data.map(caixa => <li key={caixa.id}>{format(new Date(`${caixa.data}T12:00:00`), 'dd/MM/yyyy')} · abertura R$ {Number(caixa.valor_abertura).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</li>)}
              </ul>
            </section>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Contagem inicial</CardTitle>
              <p className="text-sm text-muted-foreground">Conte o dinheiro físico antes de iniciar o expediente. Digite 0 se a gaveta estiver vazia.</p>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="valor-inicial-caixa">Valor inicial em caixa (R$) <span className="text-destructive">*</span></Label>
                <Input
                  id="valor-inicial-caixa"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0,00"
                  value={amount}
                  onChange={event => { setAmount(event.target.value); setSubmitError(''); }}
                  disabled={openMutation.isPending}
                  aria-invalid={amount.trim().length > 0 && amountInvalid}
                  aria-describedby="valor-inicial-ajuda"
                />
                <p id="valor-inicial-ajuda" className="text-xs text-muted-foreground">Use até duas casas decimais; o valor ficará registrado no histórico do caixa.</p>
                {amount.trim() && amountInvalid && <p role="alert" className="text-xs text-destructive">Informe um valor igual ou maior que zero, com até duas casas decimais.</p>}
              </div>

              {submitError && <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">Não foi possível abrir o caixa. {submitError}</div>}

              <Separator />

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="outline" onClick={voltar} disabled={openMutation.isPending}>Cancelar</Button>
                <Button
                  onClick={() => amountValue !== null && !amountInvalid && openMutation.mutate(amountValue)}
                  disabled={openMutation.isPending || amountInvalid}
                  className="gap-2"
                >
                  {openMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {openMutation.isPending ? 'Abrindo caixa…' : 'Confirmar abertura'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <UnsavedChangesDialog
        open={blocker.state === 'blocked'}
        onOpenChange={open => { if (!open && blocker.state === 'blocked') blocker.reset(); }}
        onConfirm={() => {
          if (blocker.state === 'blocked') {
            navigationAllowed.current = true;
            blocker.proceed();
          }
        }}
      />
    </div>
  );
}
