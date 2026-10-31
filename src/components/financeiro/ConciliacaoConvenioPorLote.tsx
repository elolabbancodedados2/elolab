import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Scale } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ErrorState } from '@/components/ErrorState';
import { buscarEmBlocos, LIMITE_BUSCA_EM_BLOCOS } from '@/lib/buscarEmBlocos';
import { conciliarRecebimentosConvenio, type LancamentoConvenio, type LoteConciliacao, type SituacaoConciliacao } from '@/lib/conciliacaoConvenio';
import { cn } from '@/lib/utils';

const brl = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
const dataBr = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

const SITUACAO: Record<SituacaoConciliacao, { label: string; className: string }> = {
  conciliado: { label: 'Conciliado', className: 'border-success/40 bg-success/10 text-success-foreground' },
  recebido_sem_lancamento: { label: 'Recebido sem lançamento', className: 'border-warning/40 bg-warning/10 text-warning-foreground' },
  lancado_acima_do_retorno: { label: 'Lançado acima do retorno', className: 'border-destructive/40 bg-destructive/10 text-destructive' },
};

export function ConciliacaoConvenioPorLote({ clinicaId, lotes }: { clinicaId: string; lotes: ReadonlyArray<LoteConciliacao & { status: string }> }) {
  const lancamentosQuery = useQuery({
    queryKey: ['lancamentos-convenio-conciliacao', clinicaId],
    queryFn: () => buscarEmBlocos<LancamentoConvenio>(() => supabase.from('lancamentos')
      .select('id,tipo,categoria,forma_pagamento,valor,valor_pago,status,lote_tiss_id,descricao,data')
      .eq('clinica_id', clinicaId)
      .or('lote_tiss_id.not.is.null,categoria.eq.convenio_repasse,forma_pagamento.eq.convenio')
      .order('data', { ascending: true }).order('id', { ascending: true })),
  });
  const lotesComRetorno = useMemo(() => lotes.filter(l => ['enviado', 'processando', 'pago_parcial', 'pago', 'rejeitado'].includes(l.status)), [lotes]);
  const resultado = useMemo(() => conciliarRecebimentosConvenio(lotesComRetorno, lancamentosQuery.data ?? []), [lotesComRetorno, lancamentosQuery.data]);
  const numeroLote = new Map(lotes.map(l => [l.id, `${l.numero_lote} · ${l.convenio_nome}`]));

  if (lancamentosQuery.isError) return <ErrorState title="Não foi possível carregar os lançamentos de convênio" error={lancamentosQuery.error} onRetry={() => void lancamentosQuery.refetch()} />;
  if (lancamentosQuery.isLoading) return <p className="rounded-lg border p-6 text-sm text-muted-foreground">Carregando lançamentos de convênio…</p>;

  const divergentes = resultado.lotes.filter(l => l.situacao !== 'conciliado').length;

  return <div className="space-y-4">
    {(lancamentosQuery.data?.length ?? 0) >= LIMITE_BUSCA_EM_BLOCOS && <p role="alert" className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning-foreground">A consulta atingiu o limite de registros; a conciliação pode estar incompleta.</p>}
    <Card className="rounded-2xl border-border/60 shadow-xs">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-primary text-white"><Scale className="h-4 w-4" /></span>
          Conciliação por lote
          <Badge variant="outline" className="rounded-full border-border text-primary">{divergentes} com diferença</Badge>
        </CardTitle>
        <CardDescription>Compara o total recebido informado no retorno de cada lote com os lançamentos vinculados no financeiro. Nenhum lançamento é criado nesta tela; use “Atualizar retorno” no lote para conciliar a diferença conscientemente.</CardDescription>
      </CardHeader>
      <CardContent>
        {resultado.lotes.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Nenhum lote enviado para conciliar.</p> : <div className="overflow-x-auto rounded-xl border border-border/60"><Table>
          <TableHeader><TableRow><TableHead>Lote</TableHead><TableHead className="text-right">Retorno informado</TableHead><TableHead className="text-right">Lançado no financeiro</TableHead><TableHead className="text-right">Diferença</TableHead><TableHead>Situação</TableHead></TableRow></TableHeader>
          <TableBody>{resultado.lotes.map(l => <TableRow key={l.id}>
            <TableCell className="font-medium">{l.numero_lote}<p className="text-xs text-muted-foreground">{l.convenio}</p></TableCell>
            <TableCell className="text-right tabular-nums">{brl(l.declarado)}</TableCell>
            <TableCell className="text-right tabular-nums">{brl(l.lancado)}</TableCell>
            <TableCell className={cn('text-right tabular-nums', l.diferenca !== 0 && 'font-semibold')}>{brl(l.diferenca)}</TableCell>
            <TableCell><Badge variant="outline" className={cn('gap-1 rounded-full', SITUACAO[l.situacao].className)}>{l.situacao === 'conciliado' ? <CheckCircle2 aria-hidden="true" className="h-3 w-3" /> : <AlertTriangle aria-hidden="true" className="h-3 w-3" />}{SITUACAO[l.situacao].label}</Badge></TableCell>
          </TableRow>)}</TableBody>
        </Table></div>}
      </CardContent>
    </Card>
    <Card className="rounded-2xl border-border/60 shadow-xs">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Recebimentos de convênio sem lote</CardTitle>
        <CardDescription>Receitas de convênio quitadas que não estão vinculadas a nenhum lote. Quando o valor coincide com a diferença pendente de um lote, ele aparece como possível correspondência para conferência manual.</CardDescription>
      </CardHeader>
      <CardContent>
        {resultado.semCorrespondencia.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Todos os recebimentos de convênio estão vinculados a um lote.</p> : <div className="overflow-x-auto rounded-xl border border-border/60"><Table>
          <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Descrição</TableHead><TableHead className="text-right">Valor</TableHead><TableHead>Possível correspondência</TableHead></TableRow></TableHeader>
          <TableBody>{resultado.semCorrespondencia.map(r => <TableRow key={r.id}>
            <TableCell>{dataBr(r.data)}</TableCell>
            <TableCell>{r.descricao || '—'}</TableCell>
            <TableCell className="text-right tabular-nums">{brl(r.valor)}</TableCell>
            <TableCell>{r.sugestoes.length ? r.sugestoes.map(id => numeroLote.get(id)).join(', ') : <span className="text-xs text-warning-foreground">Sem correspondência</span>}</TableCell>
          </TableRow>)}</TableBody>
        </Table></div>}
      </CardContent>
    </Card>
  </div>;
}
