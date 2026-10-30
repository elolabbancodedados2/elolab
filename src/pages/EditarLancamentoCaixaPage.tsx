import { useEffect, useRef, useState } from 'react';
import { useBlocker, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Pencil, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/ErrorState';
import { UnsavedChangesDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { mensagemDeErro } from '@/lib/erros';

type PaymentMethod = 'dinheiro' | 'pix' | 'credito' | 'debito' | 'cartao_credito' | 'cartao_debito' | 'cheque' | 'transferencia';
type MovementType = 'receita' | 'despesa' | 'sangria' | 'suprimento';
type CashMovement = {
  id: string;
  tipo: MovementType;
  descricao: string;
  valor: number;
  forma_pagamento: PaymentMethod;
  categoria: string | null;
  data: string;
  created_at: string;
  origem_pagamento?: boolean;
};
type Draft = { descricao: string; valor: string; forma_pagamento: PaymentMethod };
type ReturnState = { returnTo?: unknown; cashTab?: unknown; cashSearchTerm?: unknown; cashTipoFiltro?: unknown };

function parseMoney(value: string): number | null {
  const compact = value.trim().replace(/\s/g, '');
  if (!compact) return null;
  const br = /^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/;
  const decimal = /^\d+(?:\.\d{1,2})?$/;
  if (!br.test(compact) && !decimal.test(compact)) return null;
  const parsed = Number(compact.includes(',') ? compact.replace(/\./g, '').replace(',', '.') : compact);
  return Number.isFinite(parsed) ? parsed : null;
}

function money(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

const movementLabels: Record<MovementType, string> = {
  receita: 'Receita', despesa: 'Despesa', sangria: 'Sangria', suprimento: 'Suprimento',
};
const paymentLabels: Record<PaymentMethod, string> = {
  dinheiro: 'Dinheiro', pix: 'PIX', credito: 'Crédito', debito: 'Débito', cartao_credito: 'Crédito', cartao_debito: 'Débito', cheque: 'Cheque', transferencia: 'Transferência',
};

export default function EditarLancamentoCaixaPage() {
  const { lancamentoId = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { profile } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const clinicId = profile?.clinica_id ?? null;
  const today = todaySaoPauloDateOnly();
  const routeState = location.state as ReturnState | null;
  const returnTo = typeof routeState?.returnTo === 'string' && /^\/recepcao(?:\?tab=caixa)?$/.test(routeState.returnTo)
    ? routeState.returnTo : '/recepcao?tab=caixa';
  const returnTab = routeState?.cashTab === 'historico' ? 'historico' : 'hoje';
  const cashSearchTerm = typeof routeState?.cashSearchTerm === 'string' ? routeState.cashSearchTerm : '';
  const cashTipoFiltro = ['todos', 'receita', 'despesa', 'sangria', 'suprimento'].includes(String(routeState?.cashTipoFiltro))
    ? routeState?.cashTipoFiltro as 'todos' | MovementType : 'todos';
  const returnState = { cashTab: returnTab, cashSearchTerm, cashTipoFiltro };
  const [draft, setDraft] = useState<Draft | null>(null);
  const [initialDraft, setInitialDraft] = useState<Draft | null>(null);
  const [submitError, setSubmitError] = useState('');
  const navigationAllowed = useRef(false);

  const movementQuery = useQuery({
    queryKey: ['cash-movement-edit-record', clinicId, today, lancamentoId],
    enabled: Boolean(clinicId && lancamentoId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('movimentos_caixa_diario', { p_data: today })
        .eq('id', lancamentoId).maybeSingle();
      if (error) throw error;
      return data as CashMovement | null;
    },
  });
  const movement = movementQuery.data;
  const isEditable = Boolean(movement && movement.tipo !== 'receita' && !movement.origem_pagamento);

  useEffect(() => {
    if (!movement || !isEditable || draft) return;
    const initial = { descricao: movement.descricao || '', valor: String(movement.valor ?? ''), forma_pagamento: movement.forma_pagamento };
    setDraft(initial);
    setInitialDraft(initial);
  }, [movement, isEditable, draft]);

  const dirty = Boolean(draft && initialDraft && (
    draft.descricao.trim() !== initialDraft.descricao.trim() ||
    draft.valor.trim() !== initialDraft.valor.trim() ||
    draft.forma_pagamento !== initialDraft.forma_pagamento
  ));
  const parsedValue = draft ? parseMoney(draft.valor) : null;
  const invalidValue = parsedValue === null || parsedValue <= 0 || Math.abs(parsedValue * 100 - Math.round(parsedValue * 100)) > 1e-7;

  const saveMutation = useMutation({
    mutationFn: async (payload: { id: string; descricao: string; valor: number; forma_pagamento: PaymentMethod }) => {
      if (!clinicId) throw new Error('Clínica não identificada. Atualize a sessão e tente novamente.');
      if (!isEditable) throw new Error('Este lançamento não pode ser alterado por esta tela.');
      const { data, error } = await supabase.from('lancamentos')
        .update({ descricao: payload.descricao, valor: payload.valor, forma_pagamento: payload.forma_pagamento })
        .eq('id', payload.id).eq('clinica_id', clinicId).select('id');
      if (error) {
        const { data: persisted, error: verifyError } = await supabase.from('lancamentos')
          .select('id, descricao, valor, forma_pagamento').eq('id', payload.id).eq('clinica_id', clinicId).maybeSingle();
        if (!verifyError && persisted && persisted.descricao === payload.descricao && Number(persisted.valor) === payload.valor && persisted.forma_pagamento === payload.forma_pagamento) {
          return payload;
        }
        throw error;
      }
      if (!data?.length) throw new Error('Sem permissão para editar este lançamento.');
      return payload;
    },
    onSuccess: async () => {
      toast.success('Lançamento atualizado.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['lancamentos-caixa'] }),
        queryClient.invalidateQueries({ queryKey: ['lancamentos'] }),
        queryClient.invalidateQueries({ queryKey: ['caixa-diario'] }),
        queryClient.invalidateQueries({ queryKey: ['cash-movement-edit-record', clinicId, today, lancamentoId] }),
      ]);
      navigationAllowed.current = true;
      navigate(returnTo, { replace: true, state: returnState });
    },
    onError: error => {
      setSubmitError(mensagemDeErro(error));
      void queryClient.invalidateQueries({ queryKey: ['cash-movement-edit-record', clinicId, today, lancamentoId] });
    },
  });

  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    dirty && !saveMutation.isPending && !navigationAllowed.current &&
    (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search));

  useEffect(() => { navigationAllowed.current = false; }, [location.pathname, location.search]);
  useEffect(() => {
    if (!dirty) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [dirty]);

  const back = () => navigate(returnTo, { state: returnState });
  const busy = movementQuery.isLoading;
  const error = movementQuery.error;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 pb-28 sm:px-6 sm:pb-8">
      <PageHeader title="Editar lançamento" description="Ajuste os dados permitidos e confira antes de salvar." icon={<Pencil />} actions={<Button variant="outline" onClick={back} disabled={saveMutation.isPending}><ArrowLeft className="mr-2 h-4 w-4" />Voltar ao caixa diário</Button>} />

      {busy ? <div aria-busy="true" className="space-y-4 rounded-lg border border-border bg-card p-6"><Skeleton className="h-5 w-2/5" /><Skeleton className="h-24" /><Skeleton className="h-40" /></div>
        : error ? <ErrorState title="Não foi possível carregar este lançamento" error={error} onRetry={() => void movementQuery.refetch()} />
          : !isEditable || !movement || !draft ? <Card role="status"><CardHeader><CardTitle>Lançamento não disponível para edição</CardTitle></CardHeader><CardContent className="space-y-4"><p className="text-sm text-muted-foreground">O registro pode pertencer a outro período, não pertencer à clínica ativa ou ser um recebimento vinculado a pagamento.</p><Button variant="outline" onClick={back}>Voltar ao caixa diário</Button></CardContent></Card>
            : <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Receipt className="h-5 w-5 text-primary" />{movementLabels[movement.tipo]}</CardTitle></CardHeader>
              <CardContent>
                <form className="space-y-5" onSubmit={event => {
                  event.preventDefault();
                  if (!draft.descricao.trim()) { setSubmitError('Informe a descrição do lançamento.'); return; }
                  if (invalidValue) { setSubmitError('Informe um valor maior que zero, com no máximo duas casas decimais.'); return; }
                  if (!dirty) { setSubmitError('Nenhuma alteração para salvar.'); return; }
                  setSubmitError('');
                  saveMutation.mutate({ id: movement.id, descricao: draft.descricao.trim(), valor: parsedValue!, forma_pagamento: draft.forma_pagamento });
                }}>
                  <dl className="grid gap-3 border-b border-border pb-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    <div><dt className="text-xs text-muted-foreground">Data</dt><dd className="mt-1 font-medium">{new Date(`${movement.data}T12:00:00`).toLocaleDateString('pt-BR')}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Horário</dt><dd className="mt-1 font-medium">{new Date(movement.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Valor atual</dt><dd className="mt-1 font-medium tabular-nums">{money(Number(movement.valor))}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Categoria</dt><dd className="mt-1 font-medium">{movement.categoria || 'Não informada'}</dd></div>
                  </dl>
                  <div className="space-y-2"><Label htmlFor="cash-movement-description">Descrição</Label><Input id="cash-movement-description" value={draft.descricao} maxLength={200} onChange={event => { setDraft(current => current ? { ...current, descricao: event.target.value } : current); setSubmitError(''); }} required autoComplete="off" /></div>
                  <div className="space-y-2"><Label htmlFor="cash-movement-value">Valor (R$)</Label><Input id="cash-movement-value" type="text" inputMode="decimal" value={draft.valor} aria-describedby="cash-movement-value-help" aria-invalid={Boolean(draft.valor.trim()) && invalidValue} onChange={event => { setDraft(current => current ? { ...current, valor: event.target.value } : current); setSubmitError(''); }} required /><p id="cash-movement-value-help" className="text-xs text-muted-foreground">Valor maior que zero, com até duas casas decimais.</p>{Boolean(draft.valor.trim()) && invalidValue && <p role="alert" className="text-xs text-destructive">Informe um valor válido em reais.</p>}</div>
                  <div className="space-y-2"><Label htmlFor="cash-movement-method">Forma de pagamento</Label><Select value={draft.forma_pagamento} onValueChange={value => { setDraft(current => current ? { ...current, forma_pagamento: value as PaymentMethod } : current); setSubmitError(''); }}><SelectTrigger id="cash-movement-method"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(paymentLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
                  <p className="text-xs text-muted-foreground">Tipo, categoria e data são mantidos. A alteração fica no mesmo lançamento e não cria uma movimentação nova.</p>
                  {submitError && <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">Não foi possível salvar. {submitError}</div>}
                  <Separator />
                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={back} disabled={saveMutation.isPending}>Cancelar</Button><Button type="submit" disabled={!dirty || invalidValue || !draft.descricao.trim() || saveMutation.isPending} className="gap-2">{saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}{saveMutation.isPending ? 'Salvando…' : 'Salvar alterações'}</Button></div>
                </form>
              </CardContent>
            </Card>}

      <UnsavedChangesDialog open={blocker.state === 'blocked'} onOpenChange={open => { if (!open && blocker.state === 'blocked') blocker.reset(); }} onConfirm={() => { if (blocker.state === 'blocked') { navigationAllowed.current = true; blocker.proceed(); } }} />
    </div>
  );
}
