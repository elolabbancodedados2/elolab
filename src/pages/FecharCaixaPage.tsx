import { useEffect, useRef, useState } from 'react';
import { useBlocker, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Loader2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/ErrorState';
import { UnsavedChangesDialog } from '@/components/ConfirmDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { buscarEmBlocos, LIMITE_BUSCA_EM_BLOCOS } from '@/lib/buscarEmBlocos';
import { calcularSaldoGaveta, calcularTotaisCaixa, validarResultadoRpcCaixa } from '@/lib/caixaDiario';
import { diferencaEmReais, mesmoValor } from '@/lib/dinheiro';
import { todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { formatWithDatePreference as format } from '@/lib/datePreference';
import { mensagemDeErro } from '@/lib/erros';

interface CaixaFechamento {
  id: string;
  data: string;
  aberto: boolean;
  valor_abertura: number;
  valor_fechamento: number | null;
  operador_abertura: string | null;
  operador_fechamento: string | null;
  clinica_id: string;
}

interface MovimentoCaixa {
  id: string;
  tipo: 'receita' | 'despesa' | 'sangria' | 'suprimento';
  valor: number;
  forma_pagamento: string | null;
  descricao: string;
  created_at: string;
}

function moeda(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function parseValorContado(value: string): number | null {
  const compact = value.trim().replace(/\s/g, '');
  if (!compact) return null;
  const formatoBrasileiro = /^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/;
  const formatoDecimal = /^\d+(?:\.\d{1,2})?$/;
  if (!formatoBrasileiro.test(compact) && !formatoDecimal.test(compact)) return null;
  const normalizado = compact.includes(',') ? compact.replace(/\./g, '').replace(',', '.') : compact;
  const parsed = Number(normalizado);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function limparEstadoLocalCaixa(userId?: string | null, clinicId?: string | null): boolean {
  const keys = [userId ? `caixa_estado_${userId}` : null, clinicId ? `caixa_estado_clinica_${clinicId}` : null]
    .filter(Boolean) as string[];
  let success = true;
  for (const key of keys) {
    try { localStorage.removeItem(key); } catch { success = false; }
  }
  return success;
}

export default function FecharCaixaPage() {
  const { caixaId = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { profile } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const routeState = location.state as { returnTo?: unknown; cashTab?: unknown } | null;
  const returnTo = typeof routeState?.returnTo === 'string' && /^\/(?:recepcao\?tab=caixa|caixa-diario)$/.test(routeState.returnTo)
    ? routeState.returnTo
    : '/caixa-diario';
  const returnTab = routeState?.cashTab === 'historico' ? 'historico' : 'hoje';
  const [today, setToday] = useState(() => todaySaoPauloDateOnly());
  const [countedAmount, setCountedAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [submitError, setSubmitError] = useState('');
  const navigationAllowed = useRef(false);

  useEffect(() => {
    const timer = window.setInterval(() => setToday(todaySaoPauloDateOnly()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const cashQuery = useQuery({
    queryKey: ['cash-closing-record', profile?.clinica_id ?? null, caixaId],
    enabled: Boolean(profile?.clinica_id && caixaId),
    queryFn: async () => {
      const { data, error } = await supabase.from('caixa_diario')
        .select('id, data, aberto, valor_abertura, valor_fechamento, operador_abertura, operador_fechamento, clinica_id')
        .eq('id', caixaId)
        .eq('clinica_id', profile!.clinica_id!)
        .maybeSingle();
      if (error) throw error;
      return data as CaixaFechamento | null;
    },
  });

  const movementsQuery = useQuery({
    queryKey: ['cash-closing-movements', profile?.clinica_id ?? null, cashQuery.data?.id, cashQuery.data?.data],
    enabled: Boolean(profile?.clinica_id && cashQuery.data?.id && cashQuery.data.aberto),
    queryFn: async () => {
      const rows = await buscarEmBlocos<MovimentoCaixa>(
        () => supabase.rpc('movimentos_caixa_diario', { p_data: cashQuery.data!.data })
          .order('created_at', { ascending: true })
          .order('id', { ascending: true }),
        { teto: LIMITE_BUSCA_EM_BLOCOS + 1 },
      );
      return {
        movements: rows.slice(0, LIMITE_BUSCA_EM_BLOCOS),
        exceededLimit: rows.length > LIMITE_BUSCA_EM_BLOCOS,
      };
    },
  });

  const cash = cashQuery.data;
  const movements = movementsQuery.data?.movements ?? [];
  const exceededLimit = Boolean(movementsQuery.data?.exceededLimit);
  const expectedDrawer = cash ? calcularSaldoGaveta(Number(cash.valor_abertura), movements) : 0;
  const totals = cash ? calcularTotaisCaixa(Number(cash.valor_abertura), movements) : null;
  const countedValue = parseValorContado(countedAmount);
  const hasDifference = countedValue !== null && !mesmoValor(countedValue, expectedDrawer);
  const reasonRequired = hasDifference && notes.trim().length < 5;

  const closeMutation = useMutation({
    mutationFn: async () => {
      if (!cash?.id || !cash.aberto) throw new Error('Este caixa não está mais aberto. Atualize os dados antes de continuar.');
      if (countedValue === null || !Number.isFinite(countedValue) || countedValue < 0) {
        throw new Error('Informe um valor contado válido para fechar o caixa.');
      }
      if (movementsQuery.isError || movementsQuery.isLoading || exceededLimit) {
        throw new Error('Confira todos os movimentos do período antes de fechar o caixa.');
      }
      if (hasDifference && notes.trim().length < 5) {
        throw new Error('Descreva a diferença entre o valor contado e o saldo esperado (mínimo 5 caracteres).');
      }
      const { data, error } = await supabase.rpc('fechar_caixa_diario', {
        p_caixa_id: cash.id,
        p_valor_contado: countedValue,
        p_observacoes: notes.trim() || null,
      });
      if (error) throw error;
      validarResultadoRpcCaixa(data);
      return { caixa: cash, valor: countedValue };
    },
    onSuccess: async ({ caixa }) => {
      const localStateCleared = caixa.data !== today || limparEstadoLocalCaixa(profile?.id, profile?.clinica_id);
      toast.success('Caixa fechado com sucesso.');
      if (!localStateCleared) toast.warning('O caixa foi fechado, mas a Recepção pode exibir o estado anterior até atualizar. Recarregue a tela da Recepção.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['caixa-hoje'] }),
        queryClient.invalidateQueries({ queryKey: ['historico-caixas'] }),
        queryClient.invalidateQueries({ queryKey: ['caixas-abertos-antigos'] }),
        queryClient.invalidateQueries({ queryKey: ['lancamentos-caixa'] }),
        queryClient.invalidateQueries({ queryKey: ['lancamentos-detalhe'] }),
        queryClient.invalidateQueries({ queryKey: ['caixa-diario-eventos'] }),
        queryClient.invalidateQueries({ queryKey: ['caixa-estado-recepcao'] }),
        queryClient.invalidateQueries({ queryKey: ['cash-closing-record', profile?.clinica_id ?? null, caixaId] }),
      ]);
      navigationAllowed.current = true;
      navigate(returnTo, { replace: true, state: { cashTab: returnTab } });
    },
    onError: async error => {
      setSubmitError(mensagemDeErro(error));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['cash-closing-record', profile?.clinica_id ?? null, caixaId] }),
        queryClient.invalidateQueries({ queryKey: ['caixa-hoje'] }),
        queryClient.invalidateQueries({ queryKey: ['caixa-diario-eventos'] }),
        queryClient.invalidateQueries({ queryKey: ['caixa-estado-recepcao'] }),
      ]);
    },
  });

  const hasUnsavedChanges = countedAmount.trim().length > 0 || notes.trim().length > 0;
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    hasUnsavedChanges && !closeMutation.isPending && !navigationAllowed.current &&
    (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search));

  useEffect(() => { navigationAllowed.current = false; }, [location.pathname, location.search]);
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [hasUnsavedChanges]);

  const voltar = () => navigate(returnTo, { state: { cashTab: returnTab } });
  const busy = cashQuery.isLoading || movementsQuery.isLoading;
  const readError = cashQuery.error || movementsQuery.error;
  const canClose = Boolean(
    cash?.aberto && !busy && !readError && !exceededLimit && countedValue !== null &&
    Number.isFinite(countedValue) && countedValue >= 0 && !reasonRequired && !closeMutation.isPending,
  );

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 pb-28 sm:px-6 sm:pb-8">
      <PageHeader
        title="Fechar caixa"
        description={cash ? `${format(new Date(`${cash.data}T12:00:00`), 'dd/MM/yyyy')} · ${cash.data < today ? 'regularização de caixa anterior' : 'conferência do caixa diário'}` : 'Conferência do caixa diário'}
        icon={<Lock />}
        actions={<Button variant="outline" onClick={voltar} disabled={closeMutation.isPending}><ArrowLeft className="mr-2 h-4 w-4" />Voltar ao caixa diário</Button>}
      />

      {busy ? (
        <div aria-busy="true" className="space-y-4 rounded-lg border border-border bg-card p-6">
          <div className="h-5 w-2/5 animate-pulse rounded bg-muted" />
          <div className="h-28 w-full animate-pulse rounded bg-muted" />
          <div className="h-10 w-full animate-pulse rounded bg-muted" />
        </div>
      ) : readError ? (
        <ErrorState title="Não foi possível conferir o caixa" error={readError} onRetry={() => { void cashQuery.refetch(); void movementsQuery.refetch(); }} />
      ) : !cash ? (
        <Card role="status">
          <CardHeader><CardTitle>Caixa não localizado</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">Este registro não existe para a clínica ativa ou você não tem acesso a ele.</p>
            <Button onClick={voltar}>Ir ao caixa diário</Button>
          </CardContent>
        </Card>
      ) : !cash.aberto ? (
        <Card role="status">
          <CardHeader><CardTitle>Este caixa já foi fechado</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">O fechamento registrado foi de {moeda(Number(cash.valor_fechamento ?? 0))}, por {cash.operador_fechamento || 'um operador'}. Não é possível fechar este caixa novamente.</p>
            <Button onClick={voltar}>Ir ao caixa diário</Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {cash.data < today && (
            <section role="status" className="space-y-1 rounded-md border border-warning/30 bg-warning/5 p-4">
              <h2 className="font-semibold text-foreground">Regularização de caixa anterior</h2>
              <p className="text-sm text-muted-foreground">Fechar este caixa registra o período passado e não libera pagamentos para dias anteriores.</p>
            </section>
          )}

          {exceededLimit && (
            <div role="alert" className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm text-warning-foreground">
              Este caixa tem mais de {LIMITE_BUSCA_EM_BLOCOS.toLocaleString('pt-BR')} movimentos. Os totais podem estar incompletos; não feche até conferir o período completo.
            </div>
          )}

          <Card>
            <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Conferência do numerário</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">Compare o dinheiro físico com os movimentos em dinheiro do período.</p>
              </div>
              <Badge variant="outline" className="w-fit border-warning/40 bg-warning/5 text-warning-foreground">Aberto</Badge>
            </CardHeader>
            <CardContent className="space-y-5">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-y border-border py-4 sm:grid-cols-3">
                {[
                  { label: 'Abertura', value: Number(cash.valor_abertura) },
                  { label: 'Receitas', value: totals?.receita ?? 0 },
                  { label: 'Despesas', value: totals?.despesa ?? 0 },
                  { label: 'Sangrias', value: totals?.sangria ?? 0 },
                  { label: 'Suprimentos', value: totals?.suprimento ?? 0 },
                  { label: 'Dinheiro esperado', value: expectedDrawer, emphasized: true },
                ].map(item => (
                  <div key={item.label} className={item.emphasized ? 'sm:col-span-1' : ''}>
                    <dt className="text-xs text-muted-foreground">{item.label}</dt>
                    <dd className={item.emphasized ? 'mt-1 text-lg font-semibold tabular-nums text-foreground' : 'mt-1 font-medium tabular-nums text-foreground'}>{moeda(item.value)}</dd>
                  </div>
                ))}
              </dl>

              <div className="space-y-2">
                <Label htmlFor="cash-counted-amount">Dinheiro contado na gaveta (R$) <span className="text-destructive">*</span></Label>
                <Input
                  id="cash-counted-amount"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0,00"
                  value={countedAmount}
                  onChange={event => { setCountedAmount(event.target.value); setSubmitError(''); }}
                  disabled={closeMutation.isPending}
                  aria-invalid={countedAmount.trim().length > 0 && countedValue === null}
                  aria-describedby="cash-counted-help"
                />
                <p id="cash-counted-help" className="text-xs text-muted-foreground">Informe o total físico contado; digite 0 se a gaveta estiver vazia.</p>
                {countedAmount.trim().length > 0 && countedValue === null && <p role="alert" className="text-xs text-destructive">Informe um valor válido com até duas casas decimais.</p>}
              </div>

              {countedValue !== null && (() => {
                const balanced = mesmoValor(countedValue, expectedDrawer);
                return (
                  <section aria-live="polite" className={balanced ? 'rounded-md border border-success/30 bg-success/5 p-3' : 'rounded-md border border-destructive/30 bg-destructive/5 p-3'}>
                    <p className="text-xs text-muted-foreground">{balanced ? 'Conferência' : 'Diferença'}</p>
                    <p className={balanced ? 'mt-1 text-lg font-semibold tabular-nums text-success' : 'mt-1 text-lg font-semibold tabular-nums text-destructive'}>
                      {balanced ? <CheckCircle2 className="mr-1 inline h-4 w-4" aria-hidden="true" /> : null}{moeda(diferencaEmReais(countedValue, expectedDrawer))}
                    </p>
                  </section>
                );
              })()}

              <div className="space-y-2">
                <Label htmlFor="cash-closing-notes">Observações {hasDifference ? '(obrigatórias: explique a diferença)' : '(opcional)'}</Label>
                <Textarea
                  id="cash-closing-notes"
                  placeholder={hasDifference ? 'Explique a diferença entre o valor contado e o esperado…' : 'Registre uma observação sobre a conferência…'}
                  value={notes}
                  onChange={event => { setNotes(event.target.value); setSubmitError(''); }}
                  rows={3}
                  disabled={closeMutation.isPending}
                  aria-describedby="cash-closing-notes-help"
                />
                <p id="cash-closing-notes-help" className="text-xs text-muted-foreground">{hasDifference ? 'A justificativa ficará registrada no histórico do caixa; mínimo de 5 caracteres.' : 'Uma justificativa é obrigatória quando o valor contado diverge do esperado.'}</p>
                {reasonRequired && <p role="alert" className="text-xs text-destructive">Descreva a diferença com pelo menos 5 caracteres.</p>}
              </div>

              {submitError && <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">Não foi possível fechar o caixa. {submitError}</div>}

              <Separator />
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="outline" onClick={voltar} disabled={closeMutation.isPending}>Cancelar</Button>
                <Button variant="destructive" onClick={() => closeMutation.mutate()} disabled={!canClose} className="gap-2">
                  {closeMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {closeMutation.isPending ? 'Fechando caixa…' : 'Confirmar fechamento'}
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
