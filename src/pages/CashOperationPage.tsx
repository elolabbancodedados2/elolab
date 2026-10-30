import { useEffect, useRef, useState } from 'react';
import { useBlocker, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownToLine, ArrowLeft, ArrowUpFromLine, Loader2, TrendingDown } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/ErrorState';
import { UnsavedChangesDialog } from '@/components/ConfirmDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { formatWithDatePreference as format } from '@/lib/datePreference';
import { mensagemDeErro } from '@/lib/erros';
import type { LancamentoInsert } from '@/types/supabase';

export type CashOperation = 'sangria' | 'suprimento' | 'despesa';

type FormaPagamento = 'dinheiro' | 'pix' | 'credito' | 'cartao_credito' | 'debito' | 'cartao_debito' | 'cheque' | 'transferencia';

interface CaixaAberto {
  id: string;
  data: string;
  aberto: boolean;
  valor_abertura: number;
  operador_abertura: string | null;
}

const CATEGORIAS_DESPESA = ['Material de escritório', 'Limpeza', 'Alimentação', 'Transporte', 'Manutenção', 'Fornecedor', 'Troco', 'Outros'];
const LABEL_FORMAS: Record<FormaPagamento, string> = {
  dinheiro: 'Dinheiro', pix: 'PIX', credito: 'Crédito', cartao_credito: 'Crédito',
  debito: 'Débito', cartao_debito: 'Débito', cheque: 'Cheque', transferencia: 'Transferência',
};

const CONFIG: Record<CashOperation, { title: string; action: string; icon: typeof ArrowDownToLine; description: string }> = {
  sangria: { title: 'Registrar sangria', action: 'Registrar sangria', icon: ArrowDownToLine, description: 'Retirada de dinheiro da gaveta, registrada no histórico do caixa.' },
  suprimento: { title: 'Registrar suprimento', action: 'Adicionar suprimento', icon: ArrowUpFromLine, description: 'Entrada de dinheiro na gaveta, registrada no histórico do caixa.' },
  despesa: { title: 'Registrar despesa', action: 'Registrar despesa', icon: TrendingDown, description: 'Lance a saída e informe como foi paga para manter a conferência correta da gaveta.' },
};

function parseMoneyInput(value: string): number | null {
  const compact = value.trim().replace(/\s/g, '');
  if (!compact) return null;
  const formatoBrasileiro = /^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/;
  const formatoDecimal = /^\d+(?:\.\d{1,2})?$/;
  if (!formatoBrasileiro.test(compact) && !formatoDecimal.test(compact)) return null;
  const normalized = compact.includes(',') ? compact.replace(/\./g, '').replace(',', '.') : compact;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasCentPrecision(value: number): boolean {
  return Math.abs(value * 100 - Math.round(value * 100)) <= 1e-7;
}

function newMovementId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
      const random = Math.floor(Math.random() * 16);
      return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16);
    });
}

type CashMovementInsert = LancamentoInsert & Required<Pick<
  LancamentoInsert,
  'id' | 'clinica_id' | 'tipo' | 'valor' | 'descricao' | 'forma_pagamento' | 'categoria' | 'data' | 'data_vencimento'
>>;

async function insertMovementOnce(payload: CashMovementInsert): Promise<void> {
  const { error } = await supabase.from('lancamentos').insert(payload);
  if (!error) return;

  const { data: existing, error: readError } = await supabase.from('lancamentos')
    .select('id, tipo, valor, descricao, forma_pagamento, categoria, data, data_vencimento, clinica_id')
    .eq('id', payload.id)
    .eq('clinica_id', payload.clinica_id)
    .maybeSingle();
  if (!readError && existing) {
    const sameMovement = existing.tipo === payload.tipo
      && Number(existing.valor) === Number(payload.valor)
      && existing.descricao === payload.descricao
      && existing.forma_pagamento === payload.forma_pagamento
      && existing.categoria === payload.categoria
      && existing.data === payload.data
      && existing.data_vencimento === payload.data_vencimento;
    if (sameMovement) return;
    throw new Error('Já existe um lançamento associado a esta tentativa com outros dados. Atualize o caixa antes de registrar outro movimento.');
  }
  throw error;
}

export function CashOperationPage({ operation }: { operation: CashOperation }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const routeState = location.state as { returnTo?: unknown; cashTab?: unknown } | null;
  const returnTo = typeof routeState?.returnTo === 'string' && /^\/recepcao(?:\?tab=caixa)?$/.test(routeState.returnTo)
    ? routeState.returnTo
    : '/recepcao?tab=caixa';
  const returnTab = routeState?.cashTab === 'historico' ? 'historico' : 'hoje';
  const today = todaySaoPauloDateOnly();
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Outros');
  const [paymentMethod, setPaymentMethod] = useState<FormaPagamento>('dinheiro');
  const [submitError, setSubmitError] = useState('');
  const idempotencyRef = useRef<{ clinicId: string; id: string } | null>(null);
  const navigationAllowed = useRef(false);
  const config = CONFIG[operation];
  const Icon = config.icon;
  const amountValue = parseMoneyInput(amount);
  const amountInvalid = amountValue === null || amountValue <= 0 || !hasCentPrecision(amountValue);

  const cashQuery = useQuery({
    queryKey: ['cash-operation-register', profile?.clinica_id ?? null, today],
    enabled: Boolean(profile?.clinica_id),
    queryFn: async () => {
      const { data, error } = await supabase.from('caixa_diario')
        .select('id, data, aberto, valor_abertura, operador_abertura')
        .eq('data', today)
        .eq('clinica_id', profile!.clinica_id!)
        .maybeSingle();
      if (error) throw error;
      return data as CaixaAberto | null;
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const cash = cashQuery.data;
      if (!profile?.clinica_id || !cash?.id || !cash.aberto) throw new Error('O caixa de hoje não está aberto. Atualize os dados antes de registrar o movimento.');
      if (amountValue === null || amountInvalid) throw new Error('Informe um valor maior que zero, com até duas casas decimais.');
      if (operation === 'sangria' && !description.trim()) throw new Error('O motivo da retirada é obrigatório.');
      if (operation === 'despesa' && !description.trim()) throw new Error('Descreva a despesa antes de continuar.');
      if (idempotencyRef.current?.clinicId !== profile.clinica_id) {
        idempotencyRef.current = { clinicId: profile.clinica_id, id: newMovementId() };
      }
      const id = idempotencyRef.current.id;
      const tipo = operation;
      const descricao = operation === 'sangria'
        ? `Sangria — ${description.trim()}`
        : operation === 'suprimento'
          ? description.trim() || 'Suprimento de Caixa'
          : description.trim();
      const payload: CashMovementInsert = {
        id,
        tipo,
        valor: amountValue,
        descricao,
        forma_pagamento: operation === 'despesa' ? paymentMethod : 'dinheiro',
        categoria: operation === 'sangria' ? 'sangria' : operation === 'suprimento' ? 'suprimento' : category,
        status: 'pago',
        data_vencimento: today,
        data: today,
        clinica_id: profile.clinica_id,
      };
      if (operation === 'despesa') payload.data_pagamento = new Date().toISOString();
      await insertMovementOnce(payload);
      return { type: operation };
    },
    onSuccess: async ({ type }) => {
      idempotencyRef.current = null;
      toast.success(type === 'sangria' ? 'Sangria registrada.' : type === 'suprimento' ? 'Suprimento adicionado.' : 'Despesa registrada.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['lancamentos-caixa'] }),
        queryClient.invalidateQueries({ queryKey: ['lancamentos'] }),
        queryClient.invalidateQueries({ queryKey: ['caixa-diario'] }),
      ]);
      navigationAllowed.current = true;
      navigate(returnTo, { replace: true, state: { cashTab: returnTab } });
    },
    onError: async error => {
      setSubmitError(mensagemDeErro(error));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['lancamentos-caixa'] }),
        queryClient.invalidateQueries({ queryKey: ['lancamentos'] }),
        queryClient.invalidateQueries({ queryKey: ['caixa-diario'] }),
      ]);
    },
  });

  const hasUnsavedChanges = amount.trim().length > 0 || description.trim().length > 0 || category !== 'Outros' || paymentMethod !== 'dinheiro';
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    hasUnsavedChanges && !mutation.isPending && !navigationAllowed.current &&
    (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search));

  useEffect(() => { navigationAllowed.current = false; }, [location.pathname, location.search]);
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [hasUnsavedChanges]);

  const voltar = () => navigate(returnTo, { state: { cashTab: returnTab } });
  const busy = cashQuery.isLoading;
  const canSubmit = Boolean(cashQuery.data?.aberto && !cashQuery.isError && !busy && !amountInvalid
    && (operation !== 'sangria' || description.trim())
    && (operation !== 'despesa' || description.trim())
    && !mutation.isPending);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 pb-28 sm:px-6 sm:pb-8">
      <PageHeader
        title={config.title}
        description={config.description}
        icon={<Icon />}
        actions={<Button variant="outline" onClick={voltar} disabled={mutation.isPending}><ArrowLeft className="mr-2 h-4 w-4" />Voltar ao caixa diário</Button>}
      />

      {busy ? (
        <div aria-busy="true" className="space-y-4 rounded-lg border border-border bg-card p-6">
          <div className="h-5 w-2/5 animate-pulse rounded bg-muted" />
          <div className="h-10 w-full animate-pulse rounded bg-muted" />
        </div>
      ) : cashQuery.isError ? (
        <ErrorState title="Não foi possível conferir o caixa" error={cashQuery.error} onRetry={() => void cashQuery.refetch()} />
      ) : !cashQuery.data?.aberto ? (
        <Card role="status">
          <CardHeader><CardTitle>Caixa não disponível para movimentos</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">Abra o caixa de hoje antes de registrar uma retirada, suprimento ou despesa.</p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={voltar}>Ir ao caixa diário</Button>
              {!cashQuery.data && <Button variant="outline" onClick={() => navigate('/recepcao/caixa/abrir', { state: { returnTo, cashTab: returnTab } })}>Abrir caixa</Button>}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Movimento do caixa</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">{format(new Date(`${today}T12:00:00`), 'dd/MM/yyyy')} · abertura de {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(cashQuery.data.valor_abertura))}</p>
            </div>
            <Badge variant="outline" className="w-fit border-warning/40 bg-warning/5 text-warning-foreground">Aberto</Badge>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="cash-operation-amount">{operation === 'sangria' ? 'Valor da retirada' : operation === 'suprimento' ? 'Valor do suprimento' : 'Valor da despesa'} (R$) <span className="text-destructive">*</span></Label>
              <Input
                id="cash-operation-amount"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0,00"
                value={amount}
                onChange={event => { setAmount(event.target.value); setSubmitError(''); }}
                disabled={mutation.isPending}
                aria-invalid={amount.trim().length > 0 && amountInvalid}
                aria-describedby="cash-operation-amount-help"
              />
              <p id="cash-operation-amount-help" className="text-xs text-muted-foreground">Use um valor maior que zero e informe até duas casas decimais.</p>
              {amount.trim() && amountInvalid && <p role="alert" className="text-xs text-destructive">Informe um valor válido, maior que zero e com até duas casas decimais.</p>}
            </div>

            {operation === 'sangria' && (
              <div className="space-y-2">
                <Label htmlFor="cash-operation-description">Motivo da retirada <span className="text-destructive">*</span></Label>
                <Input id="cash-operation-description" value={description} placeholder="Ex.: reforço do troco na recepção" onChange={event => { setDescription(event.target.value); setSubmitError(''); }} disabled={mutation.isPending} />
                <p className="text-xs text-muted-foreground">O motivo será registrado junto ao movimento para conferência do caixa.</p>
              </div>
            )}

            {operation === 'suprimento' && (
              <div className="space-y-2">
                <Label htmlFor="cash-operation-description">Descrição (opcional)</Label>
                <Input id="cash-operation-description" value={description} placeholder="Suprimento de caixa" onChange={event => { setDescription(event.target.value); setSubmitError(''); }} disabled={mutation.isPending} />
                <p className="text-xs text-muted-foreground">Se deixar em branco, o histórico usará “Suprimento de Caixa”.</p>
              </div>
            )}

            {operation === 'despesa' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="cash-operation-description">Descrição da despesa <span className="text-destructive">*</span></Label>
                  <Input id="cash-operation-description" value={description} placeholder="Ex.: material de limpeza" onChange={event => { setDescription(event.target.value); setSubmitError(''); }} disabled={mutation.isPending} />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="cash-operation-category">Categoria da despesa</Label>
                    <Select value={category} onValueChange={setCategory} disabled={mutation.isPending}>
                      <SelectTrigger id="cash-operation-category"><SelectValue /></SelectTrigger>
                      <SelectContent>{CATEGORIAS_DESPESA.map(item => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cash-operation-payment">Forma de pagamento</Label>
                    <Select value={paymentMethod} onValueChange={value => setPaymentMethod(value as FormaPagamento)} disabled={mutation.isPending}>
                      <SelectTrigger id="cash-operation-payment"><SelectValue /></SelectTrigger>
                      <SelectContent>{(Object.entries(LABEL_FORMAS) as Array<[FormaPagamento, string]>).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Somente despesas em dinheiro reduzem o valor esperado na gaveta.</p>
                  </div>
                </div>
              </>
            )}

            {submitError && <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">Não foi possível registrar o movimento. {submitError}</div>}

            <Separator />
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={voltar} disabled={mutation.isPending}>Cancelar</Button>
              <Button onClick={() => mutation.mutate()} disabled={!canSubmit} className="gap-2">
                {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {mutation.isPending ? 'Registrando…' : config.action}
              </Button>
            </div>
          </CardContent>
        </Card>
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
