import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useBlocker, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, CircleAlert, Loader2, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/ErrorState';
import { UnsavedChangesDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { parseDateOnly, todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { mensagemDeErro } from '@/lib/erros';

type PaymentMethod = 'pix' | 'boleto' | 'transferencia' | 'cartao_credito' | 'cartao_debito' | 'dinheiro';
type PayableAccount = {
  id: string;
  clinica_id: string;
  tipo: 'despesa';
  categoria: string | null;
  descricao: string;
  valor: number;
  valor_pago: number | null;
  desconto: number | null;
  acrescimo: number | null;
  status: string;
  data_vencimento: string | null;
  fornecedor: string | null;
  numero_documento: string | null;
  competencia: string | null;
  forma_pagamento: PaymentMethod | null;
  recorrente: boolean | null;
  frequencia_recorrencia: string | null;
};
type PaymentDraft = { forma_pagamento: PaymentMethod; observacoes: string; valor: string };
type PaymentRouteState = { returnTo?: unknown; restoreSearchTerm?: unknown; idempotencyKey?: unknown };

const paymentMethods: { value: PaymentMethod; label: string }[] = [
  { value: 'pix', label: 'PIX' }, { value: 'boleto', label: 'Boleto' },
  { value: 'transferencia', label: 'Transferência' }, { value: 'cartao_credito', label: 'Cartão de crédito' },
  { value: 'cartao_debito', label: 'Cartão de débito' }, { value: 'dinheiro', label: 'Dinheiro' },
];

function parseMoney(value: string): number | null {
  const compact = value.trim().replace(/\s/g, '');
  if (!compact) return null;
  const br = /^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/;
  const decimal = /^\d+(?:\.\d{1,2})?$/;
  if (!br.test(compact) && !decimal.test(compact)) return null;
  const parsed = Number(compact.includes(',') ? compact.replace(/\./g, '').replace(',', '.') : compact);
  return Number.isFinite(parsed) ? parsed : null;
}

const currency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const openBalance = (account: PayableAccount) => Math.max(0,
  Number(account.valor || 0) - Number(account.desconto || 0) + Number(account.acrescimo || 0) - Number(account.valor_pago || 0));

export default function ContaPagarPagamentoPage() {
  const { lancamentoId = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useSupabaseAuth();
  const clinicId = profile?.clinica_id ?? null;
  const routeState = location.state as PaymentRouteState | null;
  const returnTo = typeof routeState?.returnTo === 'string' && /^\/contas(?:\?.*)?$/.test(routeState.returnTo)
    ? routeState.returnTo : '/contas?tab=pagar';
  const restoreSearchTerm = typeof routeState?.restoreSearchTerm === 'string' ? routeState.restoreSearchTerm : '';
  const returnState = { restoreSearchTerm };
  const idempotencyKey = useRef(typeof routeState?.idempotencyKey === 'string' && /^[0-9a-f-]{36}$/i.test(routeState.idempotencyKey)
    ? routeState.idempotencyKey : crypto.randomUUID());
  const [draft, setDraft] = useState<PaymentDraft | null>(null);
  const [initialDraft, setInitialDraft] = useState<PaymentDraft | null>(null);
  const [submitError, setSubmitError] = useState('');
  const [paymentUncertain, setPaymentUncertain] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitLock = useRef(false);
  const navigationAllowed = useRef(false);

  const accountQuery = useQuery({
    queryKey: ['payable-payment-record', clinicId, lancamentoId],
    enabled: Boolean(clinicId && lancamentoId),
    queryFn: async () => {
      const { data, error } = await supabase.from('lancamentos')
        .select('id, clinica_id, tipo, categoria, descricao, valor, valor_pago, desconto, acrescimo, status, data_vencimento, fornecedor, numero_documento, competencia, forma_pagamento, recorrente, frequencia_recorrencia')
        .eq('id', lancamentoId).eq('clinica_id', clinicId!).eq('tipo', 'despesa').maybeSingle();
      if (error) throw error;
      return data as PayableAccount | null;
    },
  });
  const account = accountQuery.data;
  const remaining = account ? openBalance(account) : 0;
  const canPay = Boolean(account && !['pago', 'cancelado', 'estornado'].includes(account.status) && remaining > 0);

  useEffect(() => {
    if (!account || !canPay || draft) return;
    const initial: PaymentDraft = {
      forma_pagamento: account.forma_pagamento || 'pix',
      observacoes: '',
      valor: remaining.toFixed(2).replace('.', ','),
    };
    setDraft(initial);
    setInitialDraft(initial);
  }, [account, canPay, draft, remaining]);

  const dirty = Boolean(draft && initialDraft && (
    draft.forma_pagamento !== initialDraft.forma_pagamento ||
    draft.observacoes.trim() !== initialDraft.observacoes.trim() ||
    draft.valor.trim() !== initialDraft.valor.trim()
  ));
  const parsedValue = draft ? parseMoney(draft.valor) : null;
  const invalidValue = parsedValue === null || parsedValue <= 0
    || Math.abs(parsedValue * 100 - Math.round(parsedValue * 100)) > 1e-7
    || parsedValue > remaining;
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    !navigationAllowed.current && !isSubmitting && (paymentUncertain || (dirty
      && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search))));

  useEffect(() => { navigationAllowed.current = false; }, [location.pathname, location.search]);
  useEffect(() => {
    if (!dirty && !paymentUncertain) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [dirty, paymentUncertain]);

  const returnToList = () => navigate(returnTo, { state: returnState });
  const invalidateFinance = async () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['lancamentos'] }),
    queryClient.invalidateQueries({ queryKey: ['caixa-diario'] }),
    queryClient.invalidateQueries({ queryKey: ['pagamentos-do-dia'] }),
  ]);

  const finishPayment = async (result: Record<string, unknown>, recurring: boolean) => {
    setPaymentUncertain(false);
    setSubmitError('');
    await invalidateFinance();
    if (result.repetido) toast.info('Este pagamento já havia sido registrado. Nenhum pagamento adicional foi criado.');
    else if (recurring && result.status === 'pago') toast.success('Pagamento registrado e próxima despesa programada.');
    else toast.success('Pagamento registrado no caixa.');
    navigationAllowed.current = true;
    navigate(returnTo, { replace: true, state: returnState });
  };

  const confirmPayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitLock.current || !clinicId || !account || !draft || !canPay) return;
    if (invalidValue || parsedValue === null) { setSubmitError('Informe um pagamento válido, maior que zero e dentro do saldo em aberto.'); return; }
    submitLock.current = true;
    setIsSubmitting(true);
    let rpcStarted = false;
    let responseReceived = false;
    try {
      const { data: current, error: currentError } = await supabase.from('lancamentos')
        .select('id, clinica_id, tipo, categoria, descricao, valor, valor_pago, desconto, acrescimo, status, data_vencimento, fornecedor, numero_documento, competencia, forma_pagamento, recorrente, frequencia_recorrencia')
        .eq('id', lancamentoId).eq('clinica_id', clinicId).eq('tipo', 'despesa').maybeSingle();
      if (currentError) throw currentError;
      if (!current) throw new Error('Esta conta não está mais disponível nesta clínica. Atualize a lista antes de continuar.');
      const fresh = current as PayableAccount;
      const freshBalance = Number(openBalance(fresh).toFixed(2));
      if (['pago', 'cancelado', 'estornado'].includes(fresh.status) || freshBalance <= 0) {
        throw new Error('Esta conta não tem saldo pendente. Atualize a lista antes de continuar.');
      }
      if (parsedValue > freshBalance) throw new Error('O pagamento não pode ser maior que o saldo atual em aberto. Atualize a conta e tente novamente.');

      const paymentMethod = draft.forma_pagamento === 'cartao_credito' ? 'credito'
        : draft.forma_pagamento === 'cartao_debito' ? 'debito' : draft.forma_pagamento;
      rpcStarted = true;
      const { data, error } = await supabase.rpc('registrar_pagamento', {
        p_lancamento_id: lancamentoId,
        p_pagamentos: [{ forma_pagamento: paymentMethod, valor: parsedValue, parcelas: 1 }],
        p_desconto: Number(fresh.desconto || 0),
        p_acrescimo: Number(fresh.acrescimo || 0),
        p_chave_idempotencia: idempotencyKey.current,
        p_observacoes: draft.observacoes.trim() || null,
      });
      if (error) {
        const rpcError = error as { status?: number; code?: string };
        const status = Number(rpcError.status);
        responseReceived = (status >= 400 && status < 500) || /^[0-9A-Z]{5}$/i.test(String(rpcError.code || ''));
        throw error;
      }
      responseReceived = true;
      const result = (data ?? {}) as Record<string, unknown>;
      if (result.success === false) throw new Error(String(result.error || 'O pagamento não foi registrado.'));
      await finishPayment(result, Boolean(fresh.recorrente));
    } catch (error) {
      const message = mensagemDeErro(error);
      if (!rpcStarted || responseReceived) {
        setPaymentUncertain(false);
        setSubmitError(message);
        if (rpcStarted) void invalidateFinance();
      } else {
        const { data: persisted, error: verifyError } = await supabase.from('pagamentos').select('id')
          .eq('clinica_id', clinicId).eq('lancamento_id', lancamentoId)
          .eq('chave_idempotencia', idempotencyKey.current).maybeSingle();
        if (!verifyError && persisted) {
          await finishPayment({ repetido: true }, false);
        } else {
          setPaymentUncertain(true);
          setSubmitError(message);
          toast.warning('Não foi possível confirmar se o pagamento foi registrado.', {
            description: 'Os dados foram bloqueados. Confirme novamente sem alterá-los; a chave da tentativa impede duplicidade.', duration: 10000,
          });
        }
      }
    } finally {
      submitLock.current = false;
      setIsSubmitting(false);
    }
  };

  const loading = accountQuery.isLoading;
  const error = accountQuery.error;
  const returnAction = <Button type="button" variant="outline" onClick={returnToList} disabled={isSubmitting || paymentUncertain}><ArrowLeft className="mr-2 h-4 w-4" />Voltar às contas a pagar</Button>;

  if (loading) return <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6" aria-busy="true"><Skeleton className="h-10 w-64" /><Skeleton className="h-48" /><Skeleton className="h-64" /></div>;
  if (error) return <div className="mx-auto w-full max-w-3xl px-4 py-6"><ErrorState title="Não foi possível carregar a conta" error={error} onRetry={() => void accountQuery.refetch()} /></div>;
  if (!account || !canPay || !draft) return <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6"><PageHeader title="Conta sem saldo pendente" description="Esta conta não está disponível para um novo pagamento." icon={<CircleAlert />} actions={returnAction} /><Card role="status"><CardContent className="pt-6 text-sm text-muted-foreground">Ela pode pertencer a outra clínica, já estar quitada ou cancelada, ou ter sido atualizada por outra pessoa.</CardContent></Card></div>;

  const categoryLabel = account.categoria?.replaceAll('_', ' ') || 'Não informada';
  const dueDate = account.data_vencimento ? parseDateOnly(account.data_vencimento) : null;

  return <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 pb-28 sm:px-6 sm:pb-8">
    <PageHeader title="Registrar pagamento da conta" description="Registre no caixa um pagamento que já foi realizado." icon={<Receipt />} actions={returnAction} />
    <Card>
      <CardHeader className="border-b border-border/70"><CardTitle className="text-base">Resumo da despesa</CardTitle><p className="text-sm text-muted-foreground">{account.fornecedor || 'Fornecedor não informado'}{account.numero_documento ? ` · ${account.numero_documento}` : ''}</p></CardHeader>
      <CardContent className="grid gap-4 pt-5 sm:grid-cols-2 lg:grid-cols-3">
        <Summary label="Despesa" value={account.descricao} />
        <Summary label="Categoria" value={categoryLabel} />
        <Summary label="Vencimento" value={dueDate ? dueDate.toLocaleDateString('pt-BR') : 'Não informado'} />
        <Summary label="Valor original" value={currency(Number(account.valor))} />
        <Summary label="Já pago" value={currency(Number(account.valor_pago || 0))} />
        <Summary label="Saldo em aberto" value={currency(remaining)} emphasis />
      </CardContent>
      {account.recorrente && <p className="mx-6 mb-5 rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">Despesa recorrente. Quando este pagamento quitar o saldo, o sistema poderá programar a próxima ocorrência.</p>}
    </Card>
    <Card>
      <CardHeader><CardTitle className="text-base">Dados do pagamento realizado</CardTitle><p className="text-sm text-muted-foreground">O registro atualiza o financeiro após validar o caixa aberto de hoje.</p></CardHeader>
      <CardContent>
        <form className="space-y-5" onSubmit={confirmPayment}>
          <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm text-foreground">Este registro é feito no EloLab; nenhuma transferência bancária será iniciada pelo sistema.</div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="payable-payment-value">Valor deste pagamento (R$)</Label><Input id="payable-payment-value" type="text" inputMode="decimal" value={draft.valor} onChange={event => { setDraft(current => current ? { ...current, valor: event.target.value } : current); setSubmitError(''); }} disabled={isSubmitting || paymentUncertain} aria-describedby="payable-payment-value-help" aria-invalid={Boolean(draft.valor.trim()) && invalidValue} required /><p id="payable-payment-value-help" className="text-xs text-muted-foreground">Até {currency(remaining)} disponíveis; informe no máximo duas casas decimais.</p></div>
            <div className="space-y-2"><Label htmlFor="payable-payment-method">Forma de pagamento</Label><Select value={draft.forma_pagamento} onValueChange={value => { setDraft(current => current ? { ...current, forma_pagamento: value as PaymentMethod } : current); setSubmitError(''); }} disabled={isSubmitting || paymentUncertain}><SelectTrigger id="payable-payment-method" className="min-h-11"><SelectValue /></SelectTrigger><SelectContent>{paymentMethods.map(method => <SelectItem key={method.value} value={method.value}>{method.label}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className="space-y-2"><Label htmlFor="payable-payment-notes">Observações (opcional)</Label><Input id="payable-payment-notes" value={draft.observacoes} maxLength={500} placeholder="Referência ou observação do pagamento" onChange={event => { setDraft(current => current ? { ...current, observacoes: event.target.value } : current); setSubmitError(''); }} disabled={isSubmitting || paymentUncertain} /></div>
          {invalidValue && Boolean(draft.valor.trim()) && <p role="alert" className="text-sm text-destructive">O valor precisa ser positivo e não pode ultrapassar o saldo.</p>}
          {submitError && <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><p>{submitError}</p>{submitError.toLowerCase().includes('caixa fechado') && <p className="mt-1 text-xs">Abra o caixa de hoje em Recepção e caixa e volte para registrar o pagamento.</p>}{paymentUncertain && <p className="mt-1 text-xs">A tentativa permanece bloqueada até uma nova confirmação com a mesma chave.</p>}</div>}
          <Separator />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={returnToList} disabled={isSubmitting || paymentUncertain}>Cancelar</Button><Button type="submit" disabled={isSubmitting || invalidValue} className="gap-2">{isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{isSubmitting ? 'Registrando…' : paymentUncertain ? 'Confirmar novamente' : 'Confirmar pagamento'}</Button></div>
        </form>
      </CardContent>
    </Card>
    <UnsavedChangesDialog open={blocker.state === 'blocked' && !paymentUncertain} onOpenChange={open => { if (!open && blocker.state === 'blocked') blocker.reset(); }} onConfirm={() => { if (blocker.state === 'blocked') { navigationAllowed.current = true; blocker.proceed(); } }} />
    <AlertDialog open={blocker.state === 'blocked' && paymentUncertain} onOpenChange={open => { if (!open && blocker.state === 'blocked') blocker.reset(); }}>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Pagamento sem confirmação</AlertDialogTitle><AlertDialogDescription>O resultado da tentativa ainda é incerto. Volte para esta tela e confirme novamente usando a mesma tentativa; sair pode deixar o pagamento sem conferência.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogAction onClick={() => { if (blocker.state === 'blocked') blocker.reset(); }}>Continuar nesta tela</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
  </div>;
}

function Summary({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return <div className="min-w-0 border-l-2 border-primary/25 py-1 pl-3"><p className="text-xs text-muted-foreground">{label}</p><p className={`mt-1 break-words text-sm tabular-nums ${emphasis ? 'font-semibold text-primary' : 'font-medium text-foreground'}`}>{value}</p></div>;
}
