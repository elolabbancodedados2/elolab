import { useEffect, useRef, useState } from 'react';
import { useBlocker, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, CheckCircle2, Eye, Loader2, Lock } from 'lucide-react';
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
import { calcularSaldoGaveta, calcularTotaisCaixa, CEDULAS_E_MOEDAS, somarContagemCedulas, totaisPorFormaForaDaGaveta, validarResultadoRpcCaixa } from '@/lib/caixaDiario';
import { diferencaEmReais, formatarCampoReais, mesmoValor, parseMoneyInput } from '@/lib/dinheiro';
import { abrirJanelaDeImpressao, montarRelatorioCaixaHtml, textoDiferenca } from '@/lib/relatorioCaixa';
import { calcularSaldoPagamento } from '@/lib/pagamentoDividido';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
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

const parseValorContado = parseMoneyInput;

function rotuloCedula(valor: number): string {
  return valor >= 2 ? `R$ ${valor}` : valor === 1 ? 'R$ 1 (moeda)' : `${Math.round(valor * 100)} centavos`;
}

interface CobrancaEmAberto {
  id: string;
  descricao: string;
  valor: number;
  valor_pago: number | null;
  desconto: number | null;
  acrescimo: number | null;
  status: string;
  pacientes?: { nome: string } | null;
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

class EsperadoMudou extends Error {}

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
  const [contarPorCedula, setContarPorCedula] = useState(false);
  const [cedulas, setCedulas] = useState<Record<string, string>>({});
  const [imprimirAoFechar, setImprimirAoFechar] = useState(true);
  const [fechamentoCego, setFechamentoCego] = useState(false);
  const [conferenciaRevelada, setConferenciaRevelada] = useState(false);
  const [avisoEsperado, setAvisoEsperado] = useState('');
  const navigationAllowed = useRef(false);
  const janelaRelatorio = useRef<Window | null>(null);

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
    // Recebimentos continuam entrando enquanto a gaveta é contada.
    refetchInterval: 15_000,
  });

  // Cobranças do dia ainda em aberto: fechar sem olhar para elas deixava
  // paciente atendido sem pagamento registrado.
  const cobrancasQuery = useQuery({
    queryKey: ['cash-closing-open-charges', profile?.clinica_id ?? null, cashQuery.data?.data],
    enabled: Boolean(profile?.clinica_id && cashQuery.data?.aberto),
    meta: { suppressGlobalErrorToast: true },
    refetchInterval: 30_000,
    queryFn: async (): Promise<CobrancaEmAberto[]> => {
      const { data, error } = await (supabase as any).from('lancamentos')
        .select('id, descricao, valor, valor_pago, desconto, acrescimo, status, pacientes(nome)')
        .eq('clinica_id', profile!.clinica_id!).eq('tipo', 'receita').eq('data', cashQuery.data!.data)
        .in('status', ['pendente', 'parcial']).order('created_at', { ascending: true }).limit(50);
      if (error) throw error;
      return (data ?? []) as CobrancaEmAberto[];
    },
  });
  const cobrancasEmAberto = (cobrancasQuery.data ?? []).filter(c => calcularSaldoPagamento(Number(c.valor), Number(c.desconto || 0), Number(c.acrescimo || 0), Number(c.valor_pago || 0)) > 0);
  const totalEmAberto = cobrancasEmAberto.reduce((soma, c) => soma + calcularSaldoPagamento(Number(c.valor), Number(c.desconto || 0), Number(c.acrescimo || 0), Number(c.valor_pago || 0)), 0);

  const cash = cashQuery.data;
  const movements = movementsQuery.data?.movements ?? [];
  const exceededLimit = Boolean(movementsQuery.data?.exceededLimit);
  const expectedDrawer = cash ? calcularSaldoGaveta(Number(cash.valor_abertura), movements) : 0;
  const totals = cash ? calcularTotaisCaixa(Number(cash.valor_abertura), movements) : null;
  const outrasFormas = totaisPorFormaForaDaGaveta(movements);
  const totalCedulas = somarContagemCedulas(Object.fromEntries(Object.entries(cedulas).map(([k, v]) => [k, v.trim() === '' ? 0 : Number(v)])));
  const countedValue = contarPorCedula ? totalCedulas : parseValorContado(countedAmount);
  const mostrarConferencia = !fechamentoCego || conferenciaRevelada;
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
      // O esperado na tela pode ter ficado para trás (um Pix virou dinheiro,
      // entrou um recebimento): confere de novo antes de gravar.
      const atualizado = await movementsQuery.refetch();
      if (atualizado.error || !atualizado.data) throw new Error('Não foi possível conferir os movimentos mais recentes. Tente novamente.');
      if (atualizado.data.exceededLimit) throw new Error('Confira todos os movimentos do período antes de fechar o caixa.');
      const esperadoAgora = calcularSaldoGaveta(Number(cash.valor_abertura), atualizado.data.movements);
      if (!mesmoValor(esperadoAgora, expectedDrawer)) {
        throw new EsperadoMudou(`O dinheiro esperado mudou de ${moeda(expectedDrawer)} para ${moeda(esperadoAgora)} enquanto a gaveta era contada. Confira os valores e confirme de novo.`);
      }
      const { data, error } = await supabase.rpc('fechar_caixa_diario', {
        p_caixa_id: cash.id,
        p_valor_contado: countedValue,
        p_observacoes: notes.trim() || null,
      });
      if (error) throw error;
      validarResultadoRpcCaixa(data);
      return { caixa: cash, valor: countedValue, movimentos: atualizado.data.movements };
    },
    onSuccess: async ({ caixa, valor, movimentos }) => {
      if (janelaRelatorio.current) {
        const corpo = montarRelatorioCaixaHtml({
          caixa: { ...caixa, aberto: false, valor_fechamento: valor, operador_fechamento: profile?.nome ?? null, observacoes: notes.trim() || null },
          movimentos,
          emitidoPor: profile?.nome,
        });
        abrirJanelaDeImpressao(`Fechamento de caixa ${caixa.data}`, corpo, janelaRelatorio.current);
        janelaRelatorio.current = null;
      }
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
      janelaRelatorio.current?.close();
      janelaRelatorio.current = null;
      if (error instanceof EsperadoMudou) {
        setAvisoEsperado(error.message);
        setSubmitError('');
      } else {
        setSubmitError(mensagemDeErro(error));
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['cash-closing-record', profile?.clinica_id ?? null, caixaId] }),
        queryClient.invalidateQueries({ queryKey: ['caixa-hoje'] }),
        queryClient.invalidateQueries({ queryKey: ['caixa-diario-eventos'] }),
        queryClient.invalidateQueries({ queryKey: ['caixa-estado-recepcao'] }),
      ]);
    },
  });

  const hasUnsavedChanges = countedAmount.trim().length > 0 || notes.trim().length > 0 || Object.values(cedulas).some(v => v.trim() !== '');
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
    Number.isFinite(countedValue) && countedValue >= 0 && !reasonRequired && !closeMutation.isPending && mostrarConferencia,
  );

  const confirmarFechamento = () => {
    setAvisoEsperado('');
    // A janela precisa abrir no clique; o relatório é escrito nela depois que o servidor confirmar.
    if (imprimirAoFechar) {
      janelaRelatorio.current = window.open('', '_blank', 'width=900,height=1000');
      if (!janelaRelatorio.current) toast.warning('O navegador bloqueou a janela do relatório. O caixa será fechado; imprima depois pelo histórico.');
    }
    closeMutation.mutate();
  };

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
              <Badge variant="outline" className="w-fit gap-1.5"><span aria-hidden="true" className="h-2 w-2 rounded-full bg-success" />Aberto</Badge>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-border p-3">
                <div>
                  <Label htmlFor="cash-blind-closing" className="text-sm font-medium">Fechamento cego</Label>
                  <p className="text-xs text-muted-foreground">Esconde o valor esperado até a contagem ser informada.</p>
                </div>
                <Switch id="cash-blind-closing" checked={fechamentoCego} onCheckedChange={value => { setFechamentoCego(value); setConferenciaRevelada(false); }} disabled={closeMutation.isPending} />
              </div>

              {mostrarConferencia ? <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-y border-border py-4 sm:grid-cols-3">
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
              </dl> : <p role="status" className="rounded-md border border-border bg-secondary p-3 text-sm text-muted-foreground">Conte o dinheiro da gaveta e informe o total. O esperado aparece depois da contagem.</p>}

              {avisoEsperado && (
                <div role="alert" className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/5 p-3 text-sm">
                  <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-warning-foreground" />
                  <span>{avisoEsperado}</span>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label htmlFor={contarPorCedula ? undefined : 'cash-counted-amount'}>Dinheiro contado na gaveta (R$) <span className="text-destructive">*</span></Label>
                  <Button type="button" variant="ghost" size="sm" className="min-h-11" onClick={() => {
                    if (contarPorCedula) setCountedAmount(formatarCampoReais(totalCedulas));
                    setContarPorCedula(!contarPorCedula);
                    setConferenciaRevelada(false);
                  }} disabled={closeMutation.isPending}>
                    {contarPorCedula ? 'Digitar o total' : 'Contar por cédula'}
                  </Button>
                </div>
                {contarPorCedula ? (
                  <fieldset className="space-y-2">
                    <legend className="sr-only">Quantidade de cada cédula e moeda</legend>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {CEDULAS_E_MOEDAS.map(valor => (
                        <div key={valor} className="space-y-1">
                          <Label htmlFor={`cash-note-${valor}`} className="text-xs font-normal text-muted-foreground">{rotuloCedula(valor)}</Label>
                          <Input id={`cash-note-${valor}`} type="text" inputMode="numeric" pattern="[0-9]*" placeholder="0" className="h-11"
                            value={cedulas[String(valor)] ?? ''} disabled={closeMutation.isPending}
                            onChange={event => { const v = event.target.value.replace(/\D/g, '').slice(0, 5); setCedulas(atual => ({ ...atual, [String(valor)]: v })); setSubmitError(''); setConferenciaRevelada(false); }} />
                        </div>
                      ))}
                    </div>
                    <p className="text-sm">Total contado: <span className="font-semibold tabular-nums">{moeda(totalCedulas)}</span></p>
                  </fieldset>
                ) : <Input
                  id="cash-counted-amount"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0,00"
                  value={countedAmount}
                  onChange={event => { setCountedAmount(event.target.value); setSubmitError(''); setConferenciaRevelada(false); }}
                  disabled={closeMutation.isPending}
                  aria-invalid={countedAmount.trim().length > 0 && countedValue === null}
                  aria-describedby="cash-counted-help"
                />}
                {fechamentoCego && !conferenciaRevelada && (
                  <Button type="button" variant="outline" className="min-h-11 gap-2" disabled={countedValue === null || closeMutation.isPending} onClick={() => setConferenciaRevelada(true)}>
                    <Eye aria-hidden="true" className="h-4 w-4" />Conferir com o esperado
                  </Button>
                )}
                <p id="cash-counted-help" className="text-xs text-muted-foreground">Informe o total físico contado; digite 0 se a gaveta estiver vazia.</p>
                {!contarPorCedula && countedAmount.trim().length > 0 && countedValue === null && <p role="alert" className="text-xs text-destructive">Informe um valor válido com até duas casas decimais.</p>}
              </div>

              {countedValue !== null && mostrarConferencia && (() => {
                const balanced = mesmoValor(countedValue, expectedDrawer);
                const diferenca = diferencaEmReais(countedValue, expectedDrawer);
                return (
                  <section aria-live="polite" className={balanced ? 'rounded-md border border-border bg-card p-3' : 'rounded-md border border-destructive/30 bg-destructive/5 p-3'}>
                    <p className="text-xs text-muted-foreground">{balanced ? 'Conferência' : 'Diferença'}</p>
                    <p className={balanced ? 'mt-1 text-lg font-semibold tabular-nums text-foreground' : 'mt-1 text-lg font-semibold tabular-nums text-destructive'}>
                      {balanced ? <CheckCircle2 className="mr-1 inline h-4 w-4 text-success" aria-hidden="true" /> : null}{balanced ? 'Bateu com o esperado' : textoDiferenca(diferenca)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">Contado {moeda(countedValue)} · esperado {moeda(expectedDrawer)}</p>
                  </section>
                );
              })()}

              {cobrancasEmAberto.length > 0 && (
                <section aria-labelledby="cash-open-charges-title" className="space-y-2 rounded-md border border-warning/40 bg-warning/5 p-3">
                  <div>
                    <h3 id="cash-open-charges-title" className="text-sm font-semibold text-foreground">{cobrancasEmAberto.length} cobrança{cobrancasEmAberto.length === 1 ? '' : 's'} de hoje em aberto · {moeda(totalEmAberto)}</h3>
                    <p className="text-xs text-muted-foreground">Receba ou confira antes de fechar. Fechar o caixa não cancela estas cobranças.</p>
                  </div>
                  <ul className="divide-y divide-border/60 text-sm">
                    {cobrancasEmAberto.slice(0, 8).map(c => (
                      <li key={c.id} className="flex items-center justify-between gap-3 py-1.5">
                        <span className="min-w-0 truncate">{c.pacientes?.nome || c.descricao}</span>
                        <span className="shrink-0 tabular-nums">{moeda(calcularSaldoPagamento(Number(c.valor), Number(c.desconto || 0), Number(c.acrescimo || 0), Number(c.valor_pago || 0)))}</span>
                      </li>
                    ))}
                  </ul>
                  {cobrancasEmAberto.length > 8 && <p className="text-xs text-muted-foreground">E mais {cobrancasEmAberto.length - 8}.</p>}
                  <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={() => navigate('/recepcao')}>Abrir a recepção</Button>
                </section>
              )}
              {cobrancasQuery.isError && <p role="status" className="text-xs text-muted-foreground">Não foi possível conferir as cobranças em aberto de hoje.</p>}

              {outrasFormas.length > 0 && mostrarConferencia && (
                <section aria-labelledby="cash-other-methods-title" className="space-y-2 rounded-md border border-border p-3">
                  <div>
                    <h3 id="cash-other-methods-title" className="text-sm font-semibold text-foreground">Outras formas do período</h3>
                    <p className="text-xs text-muted-foreground">Não passam pela gaveta. Confira com o extrato da maquininha e do Pix antes de fechar.</p>
                  </div>
                  <table className="w-full text-sm">
                    <caption className="sr-only">Entradas e saídas por forma de pagamento, sem dinheiro</caption>
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground">
                        <th scope="col" className="py-1 font-medium">Forma</th>
                        <th scope="col" className="py-1 text-right font-medium">Entradas</th>
                        <th scope="col" className="py-1 text-right font-medium">Saídas</th>
                        <th scope="col" className="py-1 text-right font-medium">Líquido</th>
                      </tr>
                    </thead>
                    <tbody>
                      {outrasFormas.map(item => (
                        <tr key={item.forma} className="border-t border-border/60">
                          <th scope="row" className="py-1.5 text-left font-medium text-foreground">{item.rotulo} <span className="text-xs font-normal text-muted-foreground">· {item.quantidade}</span></th>
                          <td className="py-1.5 text-right tabular-nums">{moeda(item.entradas)}</td>
                          <td className="py-1.5 text-right tabular-nums">{moeda(item.saidas)}</td>
                          <td className="py-1.5 text-right font-semibold tabular-nums">{moeda(item.entradas - item.saidas)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              )}

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

              <div className="flex min-h-11 items-center gap-2">
                <Checkbox id="cash-print-on-close" checked={imprimirAoFechar} onCheckedChange={value => setImprimirAoFechar(value === true)} disabled={closeMutation.isPending} />
                <Label htmlFor="cash-print-on-close" className="font-normal">Imprimir o relatório de fechamento</Label>
              </div>

              <Separator />
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="outline" onClick={voltar} disabled={closeMutation.isPending}>Cancelar</Button>
                <Button variant="destructive" onClick={confirmarFechamento} disabled={!canClose} className="gap-2">
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
