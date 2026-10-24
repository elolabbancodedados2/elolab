import { useMemo, useState } from 'react';
import { Download, FileBarChart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { downloadStringAsFile } from '@/lib/auditExport';
import { todaySaoPauloDateOnly } from '@/lib/dateOnly';
import {
  csvFaturamentoCompetencia, relatorioFaturamentoCompetencia, SITUACOES_FATURAMENTO,
  type FiltrosFaturamento, type GlosaFaturamento, type LoteFaturamento, type SituacaoFaturamento,
} from '@/lib/faturamentoCompetencia';

const brl = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
const mesBr = (mes: string) => `${mes.slice(5, 7)}/${mes.slice(0, 4)}`;

function mesesAtras(mes: string, quantidade: number) {
  const [ano, m] = mes.split('-').map(Number);
  const data = new Date(Date.UTC(ano, m - 1 - quantidade, 1));
  return data.toISOString().slice(0, 7);
}

interface Props {
  lotes: ReadonlyArray<LoteFaturamento>;
  glosas: ReadonlyArray<GlosaFaturamento>;
  convenios: ReadonlyArray<{ id: string; nome: string }>;
}

export function RelatorioFaturamentoCompetencia({ lotes, glosas, convenios }: Props) {
  const mesAtual = todaySaoPauloDateOnly().slice(0, 7);
  const [filtros, setFiltros] = useState<FiltrosFaturamento>({
    competenciaInicial: mesesAtras(mesAtual, 2), competenciaFinal: mesAtual, convenioId: 'todos', situacao: 'faturados',
  });
  const relatorio = useMemo(() => relatorioFaturamentoCompetencia(lotes, glosas, filtros), [lotes, glosas, filtros]);
  const convenioNome = filtros.convenioId === 'todos' ? 'Todos os convênios' : convenios.find(c => c.id === filtros.convenioId)?.nome ?? 'Convênio selecionado';

  const exportar = () => downloadStringAsFile({
    content: csvFaturamentoCompetencia(relatorio, filtros, convenioNome),
    filename: `faturamento-competencia-${filtros.competenciaInicial}-a-${filtros.competenciaFinal}.csv`,
    mimeType: 'text/csv;charset=utf-8',
  });

  return <Card className="rounded-2xl border-border/60 shadow-xs">
    <CardHeader>
      <CardTitle className="flex items-center gap-2 text-base font-semibold">
        <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-primary text-white"><FileBarChart className="h-4 w-4" /></span>
        Faturamento por competência
      </CardTitle>
      <CardDescription>Totais calculados a partir dos lotes listados abaixo. A exportação inclui os filtros e cada lote usado, para conferência.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5"><Label htmlFor="fat-comp-inicial">Competência inicial</Label><Input id="fat-comp-inicial" type="month" className="h-10 rounded-full" value={filtros.competenciaInicial} onChange={e => setFiltros(f => ({ ...f, competenciaInicial: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label htmlFor="fat-comp-final">Competência final</Label><Input id="fat-comp-final" type="month" className="h-10 rounded-full" value={filtros.competenciaFinal} onChange={e => setFiltros(f => ({ ...f, competenciaFinal: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label htmlFor="fat-comp-convenio">Convênio</Label><Select value={filtros.convenioId} onValueChange={v => setFiltros(f => ({ ...f, convenioId: v }))}><SelectTrigger id="fat-comp-convenio" className="h-10 rounded-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os convênios</SelectItem>{convenios.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1.5"><Label htmlFor="fat-comp-situacao">Situação do lote</Label><Select value={filtros.situacao} onValueChange={v => setFiltros(f => ({ ...f, situacao: v as SituacaoFaturamento }))}><SelectTrigger id="fat-comp-situacao" className="h-10 rounded-full"><SelectValue /></SelectTrigger><SelectContent>{(Object.keys(SITUACOES_FATURAMENTO) as SituacaoFaturamento[]).map(s => <SelectItem key={s} value={s}>{SITUACOES_FATURAMENTO[s].label}</SelectItem>)}</SelectContent></Select></div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p role="status" className="text-xs text-muted-foreground">{relatorio.erro ?? `${mesBr(filtros.competenciaInicial)} a ${mesBr(filtros.competenciaFinal)} · ${convenioNome} · ${SITUACOES_FATURAMENTO[filtros.situacao].label} · ${relatorio.lotes.length} lote(s)`}</p>
        <Button variant="outline" className="h-10 gap-1.5 rounded-full" onClick={exportar} disabled={!!relatorio.erro || relatorio.lotes.length === 0}><Download aria-hidden="true" className="h-4 w-4" />Exportar CSV</Button>
      </div>
      {relatorio.erro ? null : relatorio.linhas.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Nenhum lote corresponde aos filtros.</p> : <div className="overflow-x-auto rounded-xl border border-border/60"><Table>
        <TableHeader><TableRow><TableHead>Competência</TableHead><TableHead>Convênio</TableHead><TableHead className="text-right">Lotes</TableHead><TableHead className="text-right">Guias</TableHead><TableHead className="text-right">Apresentado</TableHead><TableHead className="text-right">Recebido</TableHead><TableHead className="text-right">Glosado</TableHead><TableHead className="text-right">Recuperado</TableHead><TableHead className="text-right">A receber</TableHead></TableRow></TableHeader>
        <TableBody>{relatorio.linhas.map(l => <TableRow key={`${l.competencia}-${l.convenio}`}><TableCell>{mesBr(l.competencia)}</TableCell><TableCell>{l.convenio}</TableCell><TableCell className="text-right tabular-nums">{l.lotes}</TableCell><TableCell className="text-right tabular-nums">{l.guias}</TableCell><TableCell className="text-right tabular-nums">{brl(l.apresentado)}</TableCell><TableCell className="text-right tabular-nums">{brl(l.recebido)}</TableCell><TableCell className="text-right tabular-nums">{brl(l.glosado)}</TableCell><TableCell className="text-right tabular-nums">{brl(l.recuperado)}</TableCell><TableCell className="text-right tabular-nums">{brl(l.aReceber)}</TableCell></TableRow>)}</TableBody>
        {relatorio.totais && <TableFooter><TableRow><TableCell colSpan={2} className="font-semibold">Total</TableCell><TableCell className="text-right tabular-nums">{relatorio.totais.lotes}</TableCell><TableCell className="text-right tabular-nums">{relatorio.totais.guias}</TableCell><TableCell className="text-right tabular-nums">{brl(relatorio.totais.apresentado)}</TableCell><TableCell className="text-right tabular-nums">{brl(relatorio.totais.recebido)}</TableCell><TableCell className="text-right tabular-nums">{brl(relatorio.totais.glosado)}</TableCell><TableCell className="text-right tabular-nums">{brl(relatorio.totais.recuperado)}</TableCell><TableCell className="text-right tabular-nums">{brl(relatorio.totais.aReceber)}</TableCell></TableRow></TableFooter>}
      </Table></div>}
    </CardContent>
  </Card>;
}
