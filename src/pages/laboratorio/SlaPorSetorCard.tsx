import { Timer } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { SlaSetorLinha } from '@/lib/laboratorioSla';

const fmtHoras = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const horas = (valor: number | null) => (valor == null ? '—' : `${fmtHoras.format(Number(valor))} h`);

const ETAPAS: Array<{ chave: keyof SlaSetorLinha; titulo: string }> = [
  { chave: 'espera_coleta_h', titulo: 'Espera da coleta' },
  { chave: 'coleta_recebimento_h', titulo: 'Coleta → recebimento' },
  { chave: 'recebimento_processamento_h', titulo: 'Recebimento → análise' },
  { chave: 'processamento_liberacao_h', titulo: 'Análise → liberação' },
  { chave: 'total_h', titulo: 'Total' },
];

export function SlaPorSetorCard({ linhas }: { linhas: SlaSetorLinha[] }) {
  return (
    <Card className="border-border/70">
      <CardHeader className="border-b bg-muted/20">
        <CardTitle className="flex items-center gap-2 text-base"><Timer className="h-4 w-4 text-primary" aria-hidden="true" />SLA por setor e etapa</CardTitle>
        <CardDescription>Mediana de horas em cada etapa. O limite de alerta de cada setor é definido em Gestão do laboratório → Setores.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {linhas.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">Sem amostras neste período. As etapas aparecem quando houver coletas registradas.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Setor</TableHead>
                <TableHead className="text-right">Amostras</TableHead>
                {ETAPAS.map((etapa) => <TableHead key={etapa.chave} className="text-right">{etapa.titulo}</TableHead>)}
                <TableHead className="text-right">Limite</TableHead>
                <TableHead>Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((linha) => (
                <TableRow key={linha.setor_id ?? 'sem-setor'}>
                  <TableCell className="font-medium">{linha.setor_nome}</TableCell>
                  <TableCell className="text-right tabular-nums">{linha.amostras}</TableCell>
                  {ETAPAS.map((etapa) => <TableCell key={etapa.chave} className="text-right tabular-nums">{horas(linha[etapa.chave] as number | null)}</TableCell>)}
                  <TableCell className="text-right tabular-nums">{linha.sla_horas} h</TableCell>
                  <TableCell>
                    {linha.em_atraso > 0
                      ? <Badge variant="destructive">{linha.em_atraso} em atraso</Badge>
                      : <Badge variant="secondary">Em dia</Badge>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <p className="border-t px-5 py-3 text-xs text-muted-foreground">Recebimento só é medido quando a amostra recebe o evento "recebida"; sem ele, a etapa seguinte conta a partir da coleta. Em atraso: amostras em aberto há mais tempo que o limite do setor.</p>
      </CardContent>
    </Card>
  );
}
