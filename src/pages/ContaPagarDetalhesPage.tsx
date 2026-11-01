import { useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CircleDollarSign, Eye, History, Receipt, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/ErrorState';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { buscarEmBlocos } from '@/lib/buscarEmBlocos';
import { dataHoraSP } from '@/lib/caixaFormatacao';
import { parseDateOnly, todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { formatWithDatePreference } from '@/lib/datePreference';
import { formatarMoeda } from '@/lib/dinheiro';
import { mensagemDeErro } from '@/lib/erros';
import { invalidarFinanceiro } from '@/lib/invalidarFinanceiro';
import { boletoDasObservacoes, observacoesComBoleto } from '@/lib/boleto';
import {
  STATUS_DESPESA,
  rotuloCategoriaCadastro,
  rotuloCentroCusto,
  rotuloFormaPagamento,
  rotuloFrequencia,
} from '@/lib/financeiroRotulos';

type Despesa = {
  id: string;
  descricao: string;
  categoria: string | null;
  fornecedor: string | null;
  numero_documento: string | null;
  valor: number;
  valor_pago: number | null;
  desconto: number | null;
  acrescimo: number | null;
  status: string;
  data_vencimento: string | null;
  data_emissao: string | null;
  competencia: string | null;
  forma_pagamento: string | null;
  centro_custo: string | null;
  recorrente: boolean | null;
  frequencia_recorrencia: string | null;
  observacoes: string | null;
};

type Pagamento = {
  id: string;
  valor: number;
  forma_pagamento: string;
  data_pagamento: string;
  observacoes: string | null;
  estornado_em: string | null;
  motivo_estorno: string | null;
};

const MIN_MOTIVO = 5;
const dataBr = (valor: string | null) => {
  const data = valor ? parseDateOnly(valor) : null;
  return data ? formatWithDatePreference(data, 'dd/MM/yyyy') : '—';
};

function Item({ label, children }: { label: string; children: ReactNode }) {
  return <div className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-sm font-medium text-foreground">{children || '—'}</dd></div>;
}

/** Detalhes de uma conta a pagar, com os pagamentos e o estorno de um deles. */
export default function ContaPagarDetalhesPage() {
  const { lancamentoId = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useSupabaseAuth();
  const clinicaId = profile?.clinica_id ?? null;
  const routeState = location.state as { returnTo?: unknown; restoreSearchTerm?: unknown } | null;
  const returnTo = typeof routeState?.returnTo === 'string' && /^\/contas(?:\?.*)?$/.test(routeState.returnTo)
    ? routeState.returnTo : '/contas?tab=pagar';
  const returnState = { restoreSearchTerm: typeof routeState?.restoreSearchTerm === 'string' ? routeState.restoreSearchTerm : '' };
  const [estornando, setEstornando] = useState<Pagamento | null>(null);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);

  const contaQuery = useQuery({
    queryKey: ['payable-detail', clinicaId, lancamentoId],
    enabled: Boolean(clinicaId && lancamentoId),
    queryFn: async () => {
      const { data, error } = await supabase.from('lancamentos')
        .select('id, descricao, categoria, fornecedor, numero_documento, valor, valor_pago, desconto, acrescimo, status, data_vencimento, data_emissao, competencia, forma_pagamento, centro_custo, recorrente, frequencia_recorrencia, observacoes')
        .eq('id', lancamentoId).eq('clinica_id', clinicaId!).eq('tipo', 'despesa').maybeSingle();
      if (error) throw error;
      return data as Despesa | null;
    },
  });
  const conta = contaQuery.data;

  const pagamentosQuery = useQuery({
    queryKey: ['payable-detail-payments', clinicaId, lancamentoId],
    enabled: Boolean(clinicaId && conta),
    queryFn: () => buscarEmBlocos<Pagamento>(() => supabase.from('pagamentos')
      .select('id, valor, forma_pagamento, data_pagamento, observacoes, estornado_em, motivo_estorno')
      .eq('clinica_id', clinicaId!).eq('lancamento_id', lancamentoId)
      .order('data_pagamento', { ascending: false }).order('id', { ascending: false })),
  });
  const pagamentos = pagamentosQuery.data ?? [];

  const voltar = () => navigate(returnTo, { state: returnState });
  const irPara = (acao: 'pagamento' | 'historico' | 'editar') => navigate(`/contas/pagar/${encodeURIComponent(lancamentoId)}/${acao}`, {
    state: { returnTo, ...returnState, ...(acao === 'pagamento' ? { idempotencyKey: crypto.randomUUID() } : {}) },
  });

  const confirmarEstorno = async () => {
    if (!estornando || enviando) return;
    if (motivo.trim().length < MIN_MOTIVO) { toast.error(`Explique o motivo do estorno (mínimo ${MIN_MOTIVO} caracteres).`); return; }
    setEnviando(true);
    try {
      const { data, error } = await supabase.rpc('estornar_pagamento', { p_pagamento_id: estornando.id, p_motivo: motivo.trim() });
      if (error) throw error;
      const resultado = data as { success?: boolean; error?: string } | null;
      if (!resultado?.success) throw new Error(resultado?.error || 'O pagamento não foi estornado. Atualize a página e tente de novo.');
      toast.success('Estorno registrado.', { description: `${formatarMoeda(estornando.valor)} estornado. O saldo da conta foi recalculado.` });
      setEstornando(null);
      setMotivo('');
    } catch (e) {
      toast.error(mensagemDeErro(e));
    } finally {
      setEnviando(false);
      void invalidarFinanceiro(queryClient);
    }
  };

  if (contaQuery.isLoading) return <main className="space-y-5" aria-busy="true"><Skeleton className="h-10 w-72" /><Skeleton className="h-48 rounded-xl" /><Skeleton className="h-48 rounded-xl" /></main>;
  if (contaQuery.isError) return <ErrorState title="Não foi possível carregar a conta a pagar" error={contaQuery.error} onRetry={() => void contaQuery.refetch()} />;
  if (!conta) return (
    <main className="space-y-5">
      <PageHeader title="Conta a pagar indisponível" description="Esta conta não existe ou não pertence à clínica ativa."
        actions={<Button variant="outline" onClick={voltar}><ArrowLeft aria-hidden="true" className="mr-2 h-4 w-4" />Voltar às contas</Button>} />
    </main>
  );

  const saldo = Math.max(0, Number(conta.valor || 0) - Number(conta.desconto || 0) + Number(conta.acrescimo || 0) - Number(conta.valor_pago || 0));
  const vencida = ['pendente', 'parcial', 'atrasado'].includes(conta.status) && !!conta.data_vencimento && conta.data_vencimento < todaySaoPauloDateOnly();
  const statusRotulo = vencida ? STATUS_DESPESA.atrasado : STATUS_DESPESA[conta.status] ?? conta.status;
  const podePagar = ['pendente', 'parcial', 'atrasado'].includes(conta.status) && saldo > 0;
  const ativos = pagamentos.filter(p => !p.estornado_em);
  const linhaBoleto = boletoDasObservacoes(conta.observacoes);
  const observacoes = observacoesComBoleto(conta.observacoes ?? '', '');

  return (
    <main className="space-y-6 pb-8">
      <PageHeader
        title="Detalhes da conta a pagar"
        description="Valores, pagamentos e estornos desta despesa."
        icon={<Eye />}
        actions={<>
          {podePagar && <Button onClick={() => irPara('pagamento')}><Receipt aria-hidden="true" className="mr-2 h-4 w-4" />Pagar</Button>}
          <Button variant="outline" onClick={() => irPara('historico')}><History aria-hidden="true" className="mr-2 h-4 w-4" />Histórico</Button>
          <Button variant="outline" onClick={voltar}><ArrowLeft aria-hidden="true" className="mr-2 h-4 w-4" />Voltar às contas</Button>
        </>}
      />

      <section aria-label="Resumo da despesa" className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-col gap-4 border-b border-border p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{conta.fornecedor || 'Fornecedor não informado'}</p>
            <h2 className="mt-1 break-words text-lg font-semibold">{conta.descricao}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={vencida ? 'border-destructive/30 bg-destructive/10 text-destructive' : undefined}>{statusRotulo}</Badge>
              <span className="text-xs text-muted-foreground">{rotuloCategoriaCadastro('despesa', conta.categoria)}</span>
              {conta.recorrente && <span className="text-xs text-muted-foreground">Recorrente · {rotuloFrequencia(conta.frequencia_recorrencia).toLocaleLowerCase('pt-BR')}</span>}
            </div>
          </div>
          <div className="shrink-0 sm:text-right">
            <p className="text-xs text-muted-foreground">Saldo em aberto</p>
            <p className="text-2xl font-bold tabular-nums">{formatarMoeda(saldo)}</p>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-5 gap-y-4 p-4 sm:grid-cols-3 sm:p-5 lg:grid-cols-4">
          <Item label="Valor original">{formatarMoeda(conta.valor)}</Item>
          <Item label="Valor pago">{formatarMoeda(conta.valor_pago)}</Item>
          <Item label="Vencimento">{dataBr(conta.data_vencimento)}</Item>
          <Item label="Emissão">{dataBr(conta.data_emissao)}</Item>
          <Item label="Competência">{conta.competencia}</Item>
          <Item label="Forma de pagamento">{rotuloFormaPagamento(conta.forma_pagamento)}</Item>
          <Item label="Centro de custo">{conta.centro_custo ? rotuloCentroCusto(conta.centro_custo) : null}</Item>
          <Item label="Documento">{conta.numero_documento}</Item>
        </dl>
        {(observacoes || linhaBoleto) && (
          <div className="space-y-3 border-t border-border p-4 sm:p-5">
            {linhaBoleto && <div><p className="text-xs text-muted-foreground">Linha digitável do boleto</p><p className="mt-1 break-all font-mono text-sm">{linhaBoleto}</p></div>}
            {observacoes && <div><p className="text-xs text-muted-foreground">Observações</p><p className="mt-1 whitespace-pre-wrap text-sm">{observacoes}</p></div>}
          </div>
        )}
      </section>

      <section aria-labelledby="payable-payments-title" className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-start gap-3 border-b border-border px-4 py-3 sm:px-5">
          <CircleDollarSign aria-hidden="true" className="mt-0.5 h-4 w-4 text-muted-foreground" />
          <div>
            <h2 id="payable-payments-title" className="font-semibold">Pagamentos</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{ativos.length} {ativos.length === 1 ? 'pagamento ativo' : 'pagamentos ativos'}. O estorno não apaga o registro: ele fica marcado com o motivo.</p>
          </div>
        </div>
        {pagamentosQuery.isLoading ? <div className="space-y-3 p-4" aria-busy="true"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
          : pagamentosQuery.isError ? <div className="p-4"><ErrorState compact description="Não foi possível carregar os pagamentos desta conta." error={pagamentosQuery.error} onRetry={() => void pagamentosQuery.refetch()} /></div>
            : pagamentos.length === 0 ? <p className="p-4 text-sm text-muted-foreground">Nenhum pagamento registrado para esta conta.</p>
              : <ol className="divide-y divide-border">{pagamentos.map(pagamento => (
                <li key={pagamento.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
                  <div className="min-w-0">
                    <p className="font-medium">{pagamento.estornado_em ? 'Pagamento estornado' : 'Pagamento registrado'}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{dataHoraSP(pagamento.data_pagamento)} · {rotuloFormaPagamento(pagamento.forma_pagamento)}</p>
                    {pagamento.observacoes && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{pagamento.observacoes}</p>}
                    {pagamento.estornado_em && <p className="mt-1 text-xs text-muted-foreground">Estornado em {dataHoraSP(pagamento.estornado_em)}{pagamento.motivo_estorno ? ` · ${pagamento.motivo_estorno}` : ''}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end">
                    <p className={pagamento.estornado_em ? 'font-semibold tabular-nums text-muted-foreground line-through' : 'font-semibold tabular-nums'}>{formatarMoeda(pagamento.valor)}</p>
                    {!pagamento.estornado_em && (
                      <Button size="sm" variant="outline" className="min-h-11 text-destructive hover:text-destructive sm:min-h-8"
                        aria-label={`Estornar pagamento de ${formatarMoeda(pagamento.valor)} de ${dataHoraSP(pagamento.data_pagamento)}`}
                        onClick={() => { setMotivo(''); setEstornando(pagamento); }}>
                        <RotateCcw aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />Estornar
                      </Button>
                    )}
                  </div>
                </li>
              ))}</ol>}
      </section>

      <ConfirmDialog
        open={!!estornando}
        onOpenChange={aberto => { if (!aberto && !enviando) setEstornando(null); }}
        title="Estornar pagamento"
        description={estornando ? `O pagamento de ${formatarMoeda(estornando.valor)} será marcado como estornado e o saldo da conta volta a ficar em aberto.` : ''}
        confirmLabel="Estornar pagamento"
        cancelLabel="Voltar"
        variant="destructive"
        isLoading={enviando}
        closeOnConfirm={false}
        onConfirm={() => void confirmarEstorno()}
      >
        <div className="space-y-1.5">
          <Label htmlFor="payable-reversal-reason" className="text-xs">Motivo do estorno *</Label>
          <Textarea id="payable-reversal-reason" rows={3} maxLength={500} value={motivo} disabled={enviando}
            placeholder="Ex.: pagamento lançado em duplicidade" onChange={e => setMotivo(e.target.value)} aria-describedby="payable-reversal-help" />
          <p id="payable-reversal-help" className="text-xs text-muted-foreground">
            {motivo.trim().length < MIN_MOTIVO ? `Pelo menos ${MIN_MOTIVO} caracteres (faltam ${MIN_MOTIVO - motivo.trim().length}).` : `${motivo.length}/500`}
          </p>
        </div>
      </ConfirmDialog>
    </main>
  );
}
