import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FileCheck2, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { buscarDadosBasicosPacientes } from '@/lib/patientBasicData';
import { parseDateOnly } from '@/lib/dateOnly';
import { formatWithDatePreference } from '@/lib/datePreference';
import { cn } from '@/lib/utils';
import {
  situacaoAutorizacaoGuia,
  type AutorizacaoValidacao,
  type GuiaLote,
  type SituacaoAutorizacaoGuia,
} from '@/lib/tissLoteValidacao';

// Visão de todas as guias dos lotes com a situação da autorização (protótipo aprovado em 30/10/2026).
interface LoteResumo {
  id: string;
  numero_lote: string;
  convenio_id: string;
  status: string;
  convenios?: { nome?: string | null } | null;
}

interface Props {
  guias: ReadonlyArray<GuiaLote & { lote_id: string }>;
  lotes: ReadonlyArray<LoteResumo>;
  autorizacoes: ReadonlyArray<AutorizacaoValidacao & { paciente_nome?: string | null }>;
}

const SITUACAO: Record<SituacaoAutorizacaoGuia, { rotulo: string; classe: string }> = {
  autorizada: { rotulo: 'Autorizada', classe: 'border-success/30 bg-success/10 text-success' },
  dispensada: { rotulo: 'Dispensada', classe: 'border-border bg-muted text-muted-foreground' },
  pendente: { rotulo: 'Pendente', classe: 'border-warning/30 bg-warning/10 text-warning-foreground' },
  sem_autorizacao: { rotulo: 'Sem autorização', classe: 'border-warning/30 bg-warning/10 text-warning-foreground' },
  negada: { rotulo: 'Negada', classe: 'border-destructive/30 bg-destructive/10 text-destructive' },
  vencida: { rotulo: 'Vencida', classe: 'border-destructive/30 bg-destructive/10 text-destructive' },
  divergente: { rotulo: 'Divergente', classe: 'border-destructive/30 bg-destructive/10 text-destructive' },
};

const FILTROS: Array<{ valor: 'todas' | 'problema' | SituacaoAutorizacaoGuia; rotulo: string }> = [
  { valor: 'todas', rotulo: 'Todas' },
  { valor: 'problema', rotulo: 'Com problema' },
  { valor: 'pendente', rotulo: 'Pendentes' },
  { valor: 'sem_autorizacao', rotulo: 'Sem autorização' },
  { valor: 'autorizada', rotulo: 'Autorizadas' },
];

const PROBLEMAS: ReadonlyArray<SituacaoAutorizacaoGuia> = ['negada', 'vencida', 'divergente'];

const brl = (valor: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor || 0);
const semAcento = (texto: string) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR');
const dataCurta = (valor: string | null) => {
  const dia = parseDateOnly(valor);
  return dia ? formatWithDatePreference(dia, 'dd/MM/yy') : '—';
};

export function GuiasPorAutorizacao({ guias, lotes, autorizacoes }: Props) {
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]['valor']>('todas');
  const [busca, setBusca] = useState('');

  const idsPacientes = useMemo(() => [...new Set(guias.map(g => g.paciente_id).filter(Boolean) as string[])].sort(), [guias]);
  const pacientesQuery = useQuery({
    queryKey: ['guias-autorizacao-pacientes', idsPacientes],
    enabled: idsPacientes.length > 0,
    staleTime: 60_000,
    queryFn: () => buscarDadosBasicosPacientes(idsPacientes),
  });

  const linhas = useMemo(() => {
    const lotesPorId = new Map(lotes.map(l => [l.id, l]));
    const autorizacoesPorId = new Map(autorizacoes.map(a => [a.id, a]));
    return guias.map(guia => {
      const lote = lotesPorId.get(guia.lote_id);
      const autorizacao = guia.autorizacao_id ? autorizacoesPorId.get(guia.autorizacao_id) : undefined;
      const paciente = (guia.paciente_id && pacientesQuery.data?.get(guia.paciente_id)?.nome) || autorizacao?.paciente_nome || null;
      return {
        guia,
        lote,
        paciente,
        resultado: situacaoAutorizacaoGuia(guia, lote?.convenio_id ?? null, autorizacoesPorId),
      };
    }).sort((a, b) => b.guia.data_atendimento.localeCompare(a.guia.data_atendimento));
  }, [guias, lotes, autorizacoes, pacientesQuery.data]);

  const contar = (valor: (typeof FILTROS)[number]['valor']) => linhas.filter(l => passaFiltro(l.resultado.situacao, valor)).length;
  const termo = semAcento(busca.trim());
  const visiveis = linhas.filter(l => passaFiltro(l.resultado.situacao, filtro) && (!termo || semAcento([
    l.guia.numero_guia, l.guia.numero_carteira, l.guia.codigo_procedimento, l.lote?.numero_lote, l.lote?.convenios?.nome,
    l.paciente, l.resultado.numero,
  ].filter(Boolean).join(' ')).includes(termo)));

  return (
    <Card className="rounded-2xl border-border/60 shadow-xs">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-secondary text-foreground"><FileCheck2 aria-hidden="true" className="h-4 w-4" /></span>
          Guias e autorizações
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative w-full sm:max-w-sm">
            <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Buscar guia por número, paciente, convênio ou autorização"
              placeholder="Buscar guia, paciente, convênio ou autorização..."
              value={busca}
              onChange={event => setBusca(event.target.value)}
              className="h-10 rounded-full pl-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar guias pela situação da autorização">
            {FILTROS.map(f => (
              <button
                key={f.valor}
                type="button"
                aria-pressed={filtro === f.valor}
                onClick={() => setFiltro(f.valor)}
                className={cn(
                  'h-8 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  filtro === f.valor ? 'border-foreground bg-foreground text-background' : 'border-border bg-card text-muted-foreground hover:text-foreground',
                )}
              >
                {f.rotulo} <span className="tabular-nums opacity-80">{contar(f.valor)}</span>
              </button>
            ))}
          </div>
        </div>

        {guias.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma guia detalhada nos lotes. Cadastre as guias pelo botão Guias de cada lote.</p>
        ) : visiveis.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <p className="text-sm text-muted-foreground">Nenhuma guia corresponde à busca e ao filtro.</p>
            <Button size="sm" variant="outline" className="rounded-full" onClick={() => { setBusca(''); setFiltro('todas'); }}>Limpar filtros</Button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Guia</TableHead>
                  <TableHead>Paciente</TableHead>
                  <TableHead>Lote</TableHead>
                  <TableHead>Atendimento</TableHead>
                  <TableHead>Procedimento</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Autorização</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiveis.map(({ guia, lote, paciente, resultado }) => {
                  const estilo = SITUACAO[resultado.situacao];
                  return (
                    <TableRow key={guia.id}>
                      <TableCell className="font-medium tabular-nums">{guia.numero_guia}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{paciente ?? <span className="text-muted-foreground">Carteira {guia.numero_carteira || '—'}</span>}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {lote ? (
                          <Link to={`/faturamento-convenios/lotes/${lote.id}/guias`} className="font-medium underline-offset-2 hover:underline">
                            {lote.numero_lote}
                          </Link>
                        ) : '—'}
                        <span className="block text-xs text-muted-foreground">{lote?.convenios?.nome ?? 'Convênio sem nome'}</span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">{dataCurta(guia.data_atendimento)}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <span className="tabular-nums">{guia.codigo_procedimento}</span>
                        <span className="block text-xs capitalize text-muted-foreground">{guia.tipo_servico}{guia.quantidade > 1 ? ` · ${guia.quantidade}x` : ''}</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{brl(Number(guia.valor_total))}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn('whitespace-nowrap rounded-full', estilo.classe)}>{estilo.rotulo}</Badge>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {resultado.numero ? `${resultado.numero}${resultado.validade ? ` · até ${dataCurta(resultado.validade)}` : ''}` : resultado.detalhe}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function passaFiltro(situacao: SituacaoAutorizacaoGuia, filtro: (typeof FILTROS)[number]['valor']) {
  if (filtro === 'todas') return true;
  if (filtro === 'problema') return PROBLEMAS.includes(situacao);
  return situacao === filtro;
}
