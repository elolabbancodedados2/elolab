import { useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Repeat } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/ErrorState';
import { UnsavedChangesDialog } from '@/components/ConfirmDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { buscarEmBlocos, LIMITE_BUSCA_EM_BLOCOS } from '@/lib/buscarEmBlocos';
import { formatWithDatePreference as format } from '@/lib/datePreference';
import { mensagemDeErro } from '@/lib/erros';

interface ContaEstorno {
  id: string;
  descricao: string;
  valor: number | string;
  valor_pago: number | string | null;
  status: string;
  tipo: string;
}

interface PagamentoEstornavel {
  id: string;
  valor: number | string;
  forma_pagamento: string;
  data_pagamento: string;
  observacoes: string | null;
}

const FORMAS_PAGAMENTO: Record<string, string> = {
  pix: 'PIX', dinheiro: 'Dinheiro', cartao_credito: 'Cartão de crédito', credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito', debito: 'Cartão de débito', convenio: 'Convênio',
  transferencia: 'Transferência', boleto: 'Boleto', cheque: 'Cheque',
};

const formatarMoeda = (valor: number | string | null | undefined) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(valor ?? 0));

export default function ContaReceberEstorno() {
  const { lancamentoId = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { profile } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const routeState = location.state as { returnTo?: unknown; restoreSearchTerm?: unknown; restoreFilterCategoria?: unknown } | null;
  const returnTo = typeof routeState?.returnTo === 'string' && /^\/contas(?:\?.*)?$/.test(routeState.returnTo)
    ? routeState.returnTo
    : '/contas?tab=receber';
  const restoreSearchTerm = typeof routeState?.restoreSearchTerm === 'string' ? routeState.restoreSearchTerm : '';
  const restoreFilterCategoria = typeof routeState?.restoreFilterCategoria === 'string' ? routeState.restoreFilterCategoria : 'todas';
  const [paymentId, setPaymentId] = useState('');
  const [reason, setReason] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [blockerConfirmed, setBlockerConfirmed] = useState(false);
  const submissionLock = useRef(false);
  const navigationAllowed = useRef(false);

  const contaQuery = useQuery({
    queryKey: ['lancamento-estorno', profile?.clinica_id ?? null, lancamentoId],
    enabled: Boolean(profile?.clinica_id && lancamentoId),
    queryFn: async () => {
      const { data, error } = await supabase.from('lancamentos')
        .select('id, descricao, valor, valor_pago, status, tipo')
        .eq('id', lancamentoId)
        .eq('clinica_id', profile!.clinica_id!)
        .eq('tipo', 'receita')
        .maybeSingle();
      if (error) throw error;
      return data as ContaEstorno | null;
    },
  });

  const pagamentosQuery = useQuery({
    queryKey: ['pagamentos-estornaveis', profile?.clinica_id ?? null, lancamentoId],
    enabled: Boolean(profile?.clinica_id && lancamentoId && contaQuery.data?.id),
    queryFn: async () => {
      const data = await buscarEmBlocos<PagamentoEstornavel>(
        () => supabase.from('pagamentos')
          .select('id, valor, forma_pagamento, data_pagamento, observacoes')
          .eq('lancamento_id', lancamentoId)
          .eq('clinica_id', profile!.clinica_id!)
          .is('estornado_em', null)
          .order('data_pagamento', { ascending: false })
          .order('id', { ascending: true }),
        { teto: LIMITE_BUSCA_EM_BLOCOS + 1 },
      );
      if (data.length > LIMITE_BUSCA_EM_BLOCOS) {
        throw new Error(`Esta conta ultrapassa ${LIMITE_BUSCA_EM_BLOCOS.toLocaleString('pt-BR')} pagamentos ativos. Consulte o financeiro antes de estornar.`);
      }
      return data;
    },
  });

  const pagamentos = useMemo(() => pagamentosQuery.data ?? [], [pagamentosQuery.data]);
  const paymentIdExists = pagamentos.some(pagamento => pagamento.id === paymentId);
  const hasUnsavedChanges = Boolean(reason.trim()) || (paymentIdExists && paymentId !== pagamentos[0]?.id);
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    !navigationAllowed.current && hasUnsavedChanges && !submitting &&
    (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search));

  useEffect(() => {
    if (pagamentos.length && !pagamentos.some(pagamento => pagamento.id === paymentId)) {
      setPaymentId(pagamentos[0].id);
    }
  }, [pagamentos, paymentId]);

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

  const returnToList = () => navigate(returnTo, {
    state: { restoreSearchTerm, restoreFilterCategoria },
  });

  const confirmarEstorno = async () => {
    if (submissionLock.current || !paymentId || reason.trim().length < 5) return;
    submissionLock.current = true;
    setSubmitting(true);
    setSubmitError('');
    try {
      const { data, error } = await supabase.rpc('estornar_pagamento', {
        p_pagamento_id: paymentId,
        p_motivo: reason.trim(),
      });
      if (error) throw error;
      const resultado = data as { success?: boolean; error?: string; valor_estornado?: number | string } | null;
      if (!resultado?.success) throw new Error(resultado?.error || 'O pagamento não foi estornado. Atualize os dados antes de tentar novamente.');

      const pagamento = pagamentos.find(item => item.id === paymentId);
      toast.success('Estorno registrado.', {
        description: `${formatarMoeda(resultado.valor_estornado ?? pagamento?.valor)} estornado. A conta foi recalculada.`,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['lancamentos'] }),
        queryClient.invalidateQueries({ queryKey: ['caixa-diario'] }),
        queryClient.invalidateQueries({ queryKey: ['pagamentos-do-dia'] }),
        queryClient.invalidateQueries({ queryKey: ['pagamentos-contas-receber'] }),
      ]);
      navigationAllowed.current = true;
      navigate(returnTo, { state: { restoreSearchTerm, restoreFilterCategoria } });
    } catch (error) {
      setSubmitError(mensagemDeErro(error));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['lancamentos'] }),
        queryClient.invalidateQueries({ queryKey: ['pagamentos-contas-receber'] }),
      ]);
    } finally {
      submissionLock.current = false;
      setSubmitting(false);
    }
  };

  if (contaQuery.isLoading || pagamentosQuery.isLoading) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 sm:px-6">
        <PageHeader title="Estornar pagamento" description="Carregando a conta e os pagamentos ativos…" icon={<Repeat />} />
        <div aria-busy="true" className="space-y-4 rounded-lg border border-border bg-card p-6">
          <div className="h-5 w-2/5 animate-pulse rounded bg-muted" />
          <div className="h-10 w-full animate-pulse rounded bg-muted" />
          <div className="h-28 w-full animate-pulse rounded bg-muted" />
        </div>
      </div>
    );
  }

  if (contaQuery.isError) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 sm:px-6">
        <PageHeader title="Estornar pagamento" description="Confira o registro antes de continuar." icon={<Repeat />} />
        <ErrorState title="Não foi possível carregar a conta" error={contaQuery.error} onRetry={() => contaQuery.refetch()} />
        <Button variant="outline" onClick={returnToList}><ArrowLeft className="mr-2 h-4 w-4" />Voltar às contas a receber</Button>
      </div>
    );
  }

  if (!contaQuery.data) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 sm:px-6">
        <PageHeader title="Estornar pagamento" description="A conta pode ter sido removida ou não pertence à clínica ativa." icon={<Repeat />} />
        <ErrorState title="Conta não encontrada" description="Não localizamos esta receita para a clínica ativa. Volte à lista e atualize os dados." />
        <Button variant="outline" onClick={returnToList}><ArrowLeft className="mr-2 h-4 w-4" />Voltar às contas a receber</Button>
      </div>
    );
  }

  const conta = contaQuery.data;
  const podeEstornar = ['pago', 'parcial'].includes(conta.status);
  const pagQueryFailed = pagamentosQuery.isError;
  const semPagamentosAtivos = pagamentosQuery.isSuccess && pagamentos.length === 0;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 pb-28 sm:px-6 sm:pb-8">
      <PageHeader
        title="Estornar pagamento"
        description="O estorno mantém o lançamento original, registra o motivo e recalcula o saldo da conta."
        icon={<Repeat />}
        actions={<Button variant="outline" onClick={returnToList}><ArrowLeft className="mr-2 h-4 w-4" />Voltar às contas a receber</Button>}
      />

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Receita vinculada</p>
              <CardTitle className="mt-1 break-words text-lg">{conta.descricao}</CardTitle>
            </div>
            <Badge variant="outline" className="capitalize">{conta.status === 'pago' ? 'Recebida' : conta.status}</Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div><p className="text-xs text-muted-foreground">Valor da conta</p><p className="mt-1 font-semibold tabular-nums">{formatarMoeda(conta.valor)}</p></div>
          <div><p className="text-xs text-muted-foreground">Recebido até agora</p><p className="mt-1 font-semibold tabular-nums">{formatarMoeda(conta.valor_pago)}</p></div>
          <div><p className="text-xs text-muted-foreground">Pagamentos ativos</p><p className="mt-1 font-semibold">{pagamentosQuery.isSuccess ? pagamentos.length : '—'}</p></div>
        </CardContent>
      </Card>

      {pagQueryFailed ? (
        <ErrorState title="Não foi possível carregar os pagamentos" error={pagamentosQuery.error} onRetry={() => pagamentosQuery.refetch()} />
      ) : !podeEstornar ? (
        <ErrorState title="Esta conta não está disponível para estorno" description="Somente receitas recebidas ou parcialmente recebidas podem ter um pagamento estornado. Atualize a lista para conferir o estado atual." />
      ) : semPagamentosAtivos ? (
        <ErrorState title="Nenhum pagamento ativo para estornar" description="Esta receita não tem um pagamento individual ativo. Registros antigos precisam ser conferidos pelo financeiro antes de qualquer ajuste." />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pagamento e justificativa</CardTitle>
            <p className="text-sm text-muted-foreground">Selecione o registro correto. O motivo ficará associado ao histórico financeiro.</p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="pagamento-estorno">Pagamento a estornar</Label>
              <Select value={paymentId} onValueChange={value => { setPaymentId(value); setSubmitError(''); }} disabled={submitting}>
                <SelectTrigger id="pagamento-estorno" aria-label="Pagamento a estornar"><SelectValue placeholder="Selecione um pagamento" /></SelectTrigger>
                <SelectContent>
                  {pagamentos.map(pagamento => (
                    <SelectItem key={pagamento.id} value={pagamento.id}>
                      {formatarMoeda(pagamento.valor)} · {FORMAS_PAGAMENTO[pagamento.forma_pagamento] || pagamento.forma_pagamento} · {format(new Date(pagamento.data_pagamento), 'dd/MM/yyyy HH:mm')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {paymentIdExists && (() => {
                const selecionado = pagamentos.find(item => item.id === paymentId)!;
                return <p className="text-xs text-muted-foreground">Registrado em {format(new Date(selecionado.data_pagamento), 'dd/MM/yyyy HH:mm')} · {FORMAS_PAGAMENTO[selecionado.forma_pagamento] || selecionado.forma_pagamento}</p>;
              })()}
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="motivo-estorno">Motivo do estorno <span className="text-destructive">*</span></Label>
              <Textarea
                id="motivo-estorno"
                value={reason}
                onChange={event => { setReason(event.target.value); setSubmitError(''); }}
                placeholder="Ex.: pagamento lançado em duplicidade ou registrado com a forma incorreta."
                rows={4}
                maxLength={500}
                disabled={submitting}
                aria-describedby="motivo-estorno-ajuda"
              />
              <div id="motivo-estorno-ajuda" className="flex justify-between gap-3 text-xs text-muted-foreground">
                <span>Descreva o que aconteceu; o registro não poderá ser apagado.</span>
                <span aria-live="polite">{reason.length}/500</span>
              </div>
            </div>

            {submitError && <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">Não foi possível estornar o pagamento. {submitError}</div>}

            <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={returnToList} disabled={submitting}>Cancelar</Button>
              <Button
                onClick={confirmarEstorno}
                disabled={submitting || !paymentIdExists || reason.trim().length < 5}
                className="gap-2 bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Repeat className="h-4 w-4" />}
                {submitting ? 'Registrando estorno…' : 'Confirmar estorno'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <UnsavedChangesDialog
        open={blocker.state === 'blocked' && !blockerConfirmed}
        onOpenChange={open => { if (!open && blocker.state === 'blocked') blocker.reset(); }}
        onConfirm={() => {
          if (blocker.state === 'blocked') {
            setBlockerConfirmed(true);
            navigationAllowed.current = true;
            blocker.proceed();
          }
        }}
      />
    </div>
  );
}
