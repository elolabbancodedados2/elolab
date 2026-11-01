import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, History, Lock, Printer, RefreshCw, Unlock } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/PageHeader';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { buscarEmBlocos, LIMITE_BUSCA_EM_BLOCOS } from '@/lib/buscarEmBlocos';
import { calcularSaldoGaveta, calcularTotaisCaixa } from '@/lib/caixaDiario';
import { cn } from '@/lib/utils';
import { dataHoraSP, horaSP, rotuloForma, textoSeguroCsv } from '@/lib/caixaFormatacao';
import { abrirJanelaDeImpressao, montarRelatorioCaixaHtml, textoDiferenca } from '@/lib/relatorioCaixa';
import { diferencaEmReais } from '@/lib/dinheiro';

type CashRecord = {
  id: string;
  clinica_id: string;
  data: string;
  aberto: boolean;
  valor_abertura: number;
  valor_fechamento: number | null;
  operador_abertura: string | null;
  operador_fechamento: string | null;
  observacoes: string | null;
};

type CashMovement = {
  id: string;
  tipo: 'receita' | 'despesa' | 'sangria' | 'suprimento';
  descricao: string;
  valor: number;
  forma_pagamento: string;
  categoria: string | null;
  data: string;
  created_at: string;
  paciente_nome?: string | null;
};

type CashEvent = {
  id: string;
  tipo: 'abertura' | 'fechamento' | 'reabertura';
  valor_informado: number | null;
  valor_apurado: number | null;
  motivo: string | null;
  user_nome: string | null;
  fechamento_anterior_valor: number | null;
  fechamento_anterior_operador: string | null;
  created_at: string;
};

const money = (value: number | null | undefined) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value ?? 0);
const dateLabel = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
const movementLabel: Record<CashMovement['tipo'], string> = {
  receita: 'Receita', despesa: 'Despesa', sangria: 'Sangria', suprimento: 'Suprimento',
};

function exportMovementsCsv(movements: CashMovement[], date: string) {
  const escapeCsv = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const safeText = textoSeguroCsv;
  const rows = [
    ['Data', 'Hora', 'Tipo', 'Descrição', 'Paciente', 'Forma de pagamento', 'Categoria', 'Valor'],
    ...movements.map(item => [
      item.data,
      horaSP(item.created_at),
      movementLabel[item.tipo],
      safeText(item.descricao),
      safeText(item.paciente_nome || ''),
      safeText(rotuloForma(item.forma_pagamento)),
      safeText(item.categoria),
      ((item.tipo === 'receita' || item.tipo === 'suprimento') ? item.valor : -item.valor).toFixed(2).replace('.', ','),
    ]),
  ];
  const csv = rows.map(row => row.map(escapeCsv).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `caixa-${date}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function CaixaHistoricoDetalhePage() {
  const { caixaId = '' } = useParams();
  const navigate = useNavigate();
  const { profile } = useSupabaseAuth();
  const clinicId = profile?.clinica_id ?? null;
  const returnTo = () => navigate('/caixa-diario', { state: { cashTab: 'historico' } });

  const cashQuery = useQuery({
    queryKey: ['cash-history-record', clinicId, caixaId],
    enabled: Boolean(clinicId && caixaId),
    queryFn: async () => {
      const { data, error } = await supabase.from('caixa_diario').select('*')
        .eq('id', caixaId).eq('clinica_id', clinicId!).maybeSingle();
      if (error) throw error;
      return data as CashRecord | null;
    },
  });
  const cash = cashQuery.data;

  const movementsQuery = useQuery({
    queryKey: ['cash-history-movements', clinicId, cash?.id, cash?.data],
    enabled: Boolean(clinicId && cash?.id && cash.data),
    queryFn: async () => {
      const rows = await buscarEmBlocos<CashMovement>(
        () => supabase.rpc('movimentos_caixa_diario', { p_data: cash!.data })
          .order('created_at', { ascending: true }).order('id', { ascending: true }),
        { teto: LIMITE_BUSCA_EM_BLOCOS + 1 },
      );
      return { movements: rows.slice(0, LIMITE_BUSCA_EM_BLOCOS), exceeded: rows.length > LIMITE_BUSCA_EM_BLOCOS };
    },
  });
  const eventsQuery = useQuery({
    queryKey: ['cash-history-events', clinicId, caixaId],
    enabled: Boolean(clinicId && cash?.id),
    queryFn: async () => {
      const { data, error } = await supabase.from('caixa_diario_eventos')
        .select('id, tipo, valor_informado, valor_apurado, motivo, user_nome, fechamento_anterior_valor, fechamento_anterior_operador, created_at')
        .eq('caixa_id', caixaId).order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as CashEvent[];
    },
  });

  const movements = movementsQuery.data?.movements ?? [];
  const exceeded = movementsQuery.data?.exceeded ?? false;
  const expected = cash ? calcularSaldoGaveta(Number(cash.valor_abertura), movements) : 0;
  const totals = cash ? calcularTotaisCaixa(Number(cash.valor_abertura), movements) : null;
  const busy = cashQuery.isLoading || (Boolean(cash) && (movementsQuery.isLoading || eventsQuery.isLoading));
  const readError = cashQuery.error || movementsQuery.error;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 pb-10 sm:px-6">
      <PageHeader
        title={cash ? `Caixa de ${dateLabel(cash.data)}` : 'Detalhes do caixa'}
        description="Movimentações, conferência e registro de abertura e fechamento."
        icon={<History />}
        actions={<Button variant="outline" onClick={returnTo}><ArrowLeft className="mr-2 h-4 w-4" />Voltar ao histórico</Button>}
      />

      {busy ? (
        <div className="space-y-4" aria-busy="true"><Skeleton className="h-28" /><Skeleton className="h-64" /></div>
      ) : readError ? (
        <Card role="alert"><CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
          <p className="text-sm text-destructive">Não foi possível carregar todos os dados deste caixa.</p>
          <Button variant="outline" onClick={() => { void cashQuery.refetch(); void movementsQuery.refetch(); void eventsQuery.refetch(); }}><RefreshCw className="mr-2 h-4 w-4" />Tentar novamente</Button>
        </CardContent></Card>
      ) : !cash ? (
        <Card role="status"><CardContent className="space-y-3 p-6">
          <h2 className="font-semibold">Caixa não encontrado</h2>
          <p className="text-sm text-muted-foreground">O registro não existe ou não pertence à clínica ativa.</p>
          <Button variant="outline" onClick={returnTo}>Voltar ao histórico</Button>
        </CardContent></Card>
      ) : (
        <>
          <section aria-label="Resumo do caixa" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Summary label="Abertura" value={money(Number(cash.valor_abertura))} detail={cash.operador_abertura || 'Operador não informado'} />
            <Summary label="Receitas" value={money(totals?.receita)} />
            <Summary label="Saídas" value={money((totals?.despesa ?? 0) + (totals?.sangria ?? 0))} />
            <Summary label="Saldo esperado" value={money(expected)} />
            <Summary label="Fechamento" value={cash.valor_fechamento === null ? 'Não fechado' : money(Number(cash.valor_fechamento))} detail={[cash.operador_fechamento, cash.valor_fechamento !== null && !cash.aberto ? textoDiferenca(diferencaEmReais(Number(cash.valor_fechamento), expected)) : null].filter(Boolean).join(' · ') || undefined} />
          </section>

          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <Badge variant={cash.aberto ? 'outline' : 'secondary'} className="gap-1.5">
              {cash.aberto && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-success" />}{cash.aberto ? 'Aberto' : 'Fechado'}
            </Badge>
            <Button variant="outline" disabled={movementsQuery.isLoading || movementsQuery.isError} onClick={() => {
              const corpo = montarRelatorioCaixaHtml({ caixa: cash, movimentos: movements, emitidoPor: profile?.nome });
              if (!abrirJanelaDeImpressao(`Fechamento de caixa ${cash.data}`, corpo)) toast.error('O navegador bloqueou a janela de impressão.', { description: 'Permita pop-ups para este site e tente novamente.' });
            }}><Printer className="mr-2 h-4 w-4" />Imprimir relatório</Button>
            <Button variant="ghost" onClick={() => exportMovementsCsv(movements, cash.data)} disabled={movements.length === 0}><Download className="mr-2 h-4 w-4" />Exportar CSV</Button>
            {cash.aberto && (
              <Button className="ml-auto" variant="destructive" disabled={movementsQuery.isLoading || movementsQuery.isError || exceeded}
                onClick={() => navigate(`/recepcao/caixa/${cash.id}/fechar`, { state: { returnTo: '/caixa-diario', cashTab: 'historico' } })}>
                <Lock className="mr-2 h-4 w-4" />{cash.data < new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()) ? 'Regularizar fechamento' : 'Fechar caixa'}
              </Button>
            )}
          </div>

          {exceeded && <p role="alert" className="rounded-md border border-warning/40 bg-warning/5 p-3 text-sm">Este caixa ultrapassa o limite de {LIMITE_BUSCA_EM_BLOCOS.toLocaleString('pt-BR')} movimentos. A lista está incompleta; revise todos os registros antes de fechar.</p>}
          {cash.observacoes && <Card><CardHeader><CardTitle className="text-base">Observações do fechamento</CardTitle></CardHeader><CardContent className="whitespace-pre-wrap text-sm">{cash.observacoes}</CardContent></Card>}

          <Card>
            <CardHeader><CardTitle className="text-base">Movimentações · {movements.length}</CardTitle></CardHeader>
            <CardContent>
              {movementsQuery.isLoading ? <p role="status" className="text-sm text-muted-foreground">Carregando movimentações…</p> : movements.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma movimentação neste caixa.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <caption className="sr-only">Movimentações registradas neste caixa</caption>
                    <thead><tr className="border-b text-left text-xs text-muted-foreground"><th scope="col" className="py-2 pr-3">Horário</th><th scope="col" className="py-2 pr-3">Tipo</th><th scope="col" className="py-2 pr-3">Descrição</th><th scope="col" className="py-2 pr-3">Paciente</th><th scope="col" className="py-2 pr-3">Pagamento</th><th scope="col" className="py-2 text-right">Valor</th></tr></thead>
                    <tbody>{movements.map(item => {
                      const positive = item.tipo === 'receita' || item.tipo === 'suprimento';
                      return <tr key={item.id} className="border-b last:border-0">
                        <td className="py-3 pr-3 tabular-nums">{horaSP(item.created_at)}</td>
                        <td className="py-3 pr-3">{movementLabel[item.tipo]}</td><td className="max-w-[28rem] py-3 pr-3">{item.descricao}</td><td className="py-3 pr-3">{item.paciente_nome || '—'}</td><td className="py-3 pr-3">{rotuloForma(item.forma_pagamento)}</td>
                        <td className={cn('py-3 text-right font-medium tabular-nums', positive ? 'text-success' : 'text-destructive')}>{positive ? '+' : '−'}{money(Math.abs(Number(item.valor)))}</td>
                      </tr>;
                    })}</tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Histórico de abertura e fechamento</CardTitle></CardHeader>
            <CardContent>
              {eventsQuery.isLoading ? <p role="status" className="text-sm text-muted-foreground">Carregando histórico…</p> : eventsQuery.isError ? (
                <div role="alert" className="flex flex-wrap items-center justify-between gap-3 text-sm text-destructive"><span>Não foi possível carregar o histórico.</span><Button size="sm" variant="outline" onClick={() => void eventsQuery.refetch()}>Tentar novamente</Button></div>
              ) : eventsQuery.data?.length ? (
                <ol className="space-y-4">{eventsQuery.data.map(event => <li key={event.id} className="border-l-2 border-primary/30 pl-4 text-sm">
                  <div className="flex flex-wrap gap-x-2"><strong>{event.tipo === 'abertura' ? 'Abertura' : event.tipo === 'fechamento' ? 'Fechamento' : 'Reabertura'}</strong><span className="text-muted-foreground">{dataHoraSP(event.created_at)}</span>{event.user_nome && <span className="text-muted-foreground">por {event.user_nome}</span>}</div>
                  {event.valor_informado !== null && <p className="mt-1 text-muted-foreground">Informado: {money(event.valor_informado)}</p>}
                  {event.valor_apurado !== null && <p className="text-muted-foreground">Apurado: {money(event.valor_apurado)}</p>}
                  {event.fechamento_anterior_valor !== null && <p className="text-muted-foreground">Fechamento anterior: {money(event.fechamento_anterior_valor)}{event.fechamento_anterior_operador ? `, por ${event.fechamento_anterior_operador}` : ''}</p>}
                  {event.motivo && <p className="mt-1 whitespace-pre-wrap">Motivo/observações: {event.motivo}</p>}
                </li>)}</ol>
              ) : <p className="text-sm text-muted-foreground">Nenhum evento de abertura, fechamento ou reabertura.</p>}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Summary({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return <div className="border-l-2 border-primary/25 py-2 pl-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-semibold tabular-nums">{value}</p>{detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}</div>;
}
