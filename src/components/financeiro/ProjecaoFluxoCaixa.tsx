import { useMemo, useState } from 'react';
import { CalendarRange } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { CENARIOS_FLUXO, projetarFluxoCaixa, type CenarioFluxo, type LancamentoProjecao } from '@/lib/projecaoFluxoCaixa';
import { cn } from '@/lib/utils';

const brl = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
const NOMES_MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const rotuloMes = (mes: string) => `${NOMES_MES[Number(mes.slice(5, 7)) - 1]}/${mes.slice(0, 4)}`;

interface Props {
  lancamentos: ReadonlyArray<LancamentoProjecao>;
  realizados: ReadonlyArray<{ tipo: string; valor: number; data: string }>;
  realizadoIndisponivel?: boolean;
}

export function ProjecaoFluxoCaixa({ lancamentos, realizados, realizadoIndisponivel = false }: Props) {
  const [cenario, setCenario] = useState<CenarioFluxo>('realista');
  const meses = useMemo(
    () => projetarFluxoCaixa(lancamentos, realizados, { hoje: todaySaoPauloDateOnly(), meses: 3, cenario }),
    [lancamentos, realizados, cenario],
  );

  return <Card className="rounded-2xl border-border/60 shadow-xs">
    <CardHeader>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-secondary text-foreground"><CalendarRange className="h-4 w-4" /></span>
          <div>
            <CardTitle className="text-base font-semibold">Projeção por cenário</CardTitle>
            <CardDescription>Mês atual e dois seguintes. Realizado = movimentos já ocorridos; previsto = saldos em aberto pelo vencimento e próximas ocorrências de contas recorrentes.</CardDescription>
          </div>
        </div>
        <div role="group" aria-label="Cenário da projeção" className="flex flex-wrap gap-2">
          {(Object.keys(CENARIOS_FLUXO) as CenarioFluxo[]).map(c => <button key={c} type="button" aria-pressed={cenario === c} onClick={() => setCenario(c)}
            className={cn('h-8 rounded-full border px-3 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              cenario === c ? 'border-transparent bg-primary text-primary-foreground' : 'border-border/60 bg-card hover:border-primary/50')}>
            {CENARIOS_FLUXO[c].label}
          </button>)}
        </div>
      </div>
      <p role="status" className="text-xs text-muted-foreground">{CENARIOS_FLUXO[cenario].regra} Despesas em aberto entram sempre; as vencidas, no mês atual.</p>
    </CardHeader>
    <CardContent>
      <Table className="min-w-[980px]" containerProps={{
        role: 'region',
        'aria-label': 'Tabela de projeção mensal do fluxo de caixa com valores realizados, previstos e saldos',
        tabIndex: 0,
        className: 'rounded-xl border border-border/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
      }}>
        <TableHeader><TableRow>
          <TableHead>Mês</TableHead>
          <TableHead className="text-right">Entradas realizadas</TableHead><TableHead className="text-right">Saídas realizadas</TableHead>
          <TableHead className="text-right">Entradas previstas</TableHead><TableHead className="text-right">Saídas previstas</TableHead>
          <TableHead className="text-right">Saldo do mês</TableHead><TableHead className="text-right">Saldo acumulado</TableHead>
        </TableRow></TableHeader>
        <TableBody>{meses.map(m => <TableRow key={m.mes}>
          <TableCell className="font-medium capitalize">{rotuloMes(m.mes)}</TableCell>
          <TableCell className="text-right tabular-nums text-success">{brl(m.realizadoEntradas)}</TableCell>
          <TableCell className="text-right tabular-nums text-destructive">{brl(m.realizadoSaidas)}</TableCell>
          <TableCell className="text-right tabular-nums">{brl(m.previstoEntradas)}{m.recorrenteEntradas > 0 && <p className="text-[11px] text-muted-foreground">recorrência: {brl(m.recorrenteEntradas)}</p>}</TableCell>
          <TableCell className="text-right tabular-nums">{brl(m.previstoSaidas)}{m.recorrenteSaidas > 0 && <p className="text-[11px] text-muted-foreground">recorrência: {brl(m.recorrenteSaidas)}</p>}</TableCell>
          <TableCell className={cn('text-right font-semibold tabular-nums', m.saldoMes < 0 && 'text-destructive')}>{brl(m.saldoMes)}</TableCell>
          <TableCell className={cn('text-right tabular-nums', m.saldoAcumulado < 0 && 'text-destructive')}>{brl(m.saldoAcumulado)}</TableCell>
        </TableRow>)}</TableBody>
      </Table>
      {realizadoIndisponivel && <p className="mt-2 text-[11px] text-warning-foreground">Volte ao mês atual na navegação acima para incluir o realizado deste mês na projeção.</p>}
      <p className="mt-2 text-[11px] text-muted-foreground">Não inclui saldo inicial de caixa. Nenhum lançamento é criado pela projeção.</p>
    </CardContent>
  </Card>;
}
