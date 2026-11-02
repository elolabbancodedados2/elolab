import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { classificarAutorizacoes, DIAS_AVISO_VENCIMENTO, type FilaAutorizacoes } from '@/lib/autorizacaoConvenio';
import { formatarDataCurta, rotuloStatusAutorizacao } from '@/lib/tissStatus';

export interface AutorizacaoDaFila {
  id: string;
  status: string;
  convenio_id: string;
  paciente_id: string;
  tipo_servico: string;
  data_expiracao: string | null;
  numero_autorizacao: string | null;
  paciente_nome?: string | null;
  data_solicitacao?: string | null;
}

type Grupo = keyof FilaAutorizacoes<AutorizacaoDaFila>;
const GRUPOS: { valor: Grupo; rotulo: string; vazio: string }[] = [
  { valor: 'pendentes', rotulo: 'Aguardando resposta', vazio: 'Nenhum pedido aguardando a operadora.' },
  { valor: 'vencendo', rotulo: `Vencem em até ${DIAS_AVISO_VENCIMENTO} dias`, vazio: 'Nenhuma autorização perto de vencer.' },
  { valor: 'vencidas', rotulo: 'Vencidas', vazio: 'Nenhuma autorização vencida sem uso registrado.' },
  { valor: 'negadas', rotulo: 'Negadas', vazio: 'Nenhuma negativa registrada.' },
];

interface Props {
  autorizacoes: ReadonlyArray<AutorizacaoDaFila>;
  convenios: ReadonlyArray<{ id: string; nome: string }>;
  hoje: string;
}

/** Fila central das autorizações da clínica, separada pelo que pede ação. */
export function FilaAutorizacoesConvenio({ autorizacoes, convenios, hoje }: Props) {
  const fila = useMemo(() => classificarAutorizacoes(autorizacoes, hoje), [autorizacoes, hoje]);
  const [grupo, setGrupo] = useState<Grupo>('pendentes');
  const nomeConvenio = (id: string) => convenios.find(c => c.id === id)?.nome ?? 'Convênio';
  const itens = fila[grupo];
  const atual = GRUPOS.find(g => g.valor === grupo)!;

  return <Card className="rounded-2xl border-border/60 shadow-xs">
    <CardHeader><CardTitle className="flex items-center gap-2 text-base font-semibold"><span className="flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-secondary text-foreground"><ShieldCheck className="h-4 w-4" /></span>Autorizações</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      <div role="group" aria-label="Filtrar autorizações" className="flex flex-wrap gap-2">
        {GRUPOS.map(g => <button key={g.valor} type="button" aria-pressed={grupo === g.valor} onClick={() => setGrupo(g.valor)}
          className={cn('min-h-11 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            grupo === g.valor ? 'border-transparent bg-foreground text-background' : 'border-border bg-card text-muted-foreground hover:text-foreground')}>
          {g.rotulo} <span className="tabular-nums opacity-80">{fila[g.valor].length}</span>
        </button>)}
      </div>
      {itens.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">{atual.vazio}</p> : <ul className="divide-y divide-border rounded-xl border border-border/60">
        {itens.map(item => <li key={item.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="font-medium">{item.paciente_nome || 'Paciente'}</p>
            <p className="text-xs text-muted-foreground">{nomeConvenio(item.convenio_id)} · {item.tipo_servico}{item.numero_autorizacao ? ` · senha ${item.numero_autorizacao}` : ''}</p>
            {item.data_expiracao && grupo !== 'pendentes' && grupo !== 'negadas' && <p className={cn('text-xs', grupo === 'vencidas' ? 'text-destructive' : 'text-warning-foreground')}>Validade: {formatarDataCurta(item.data_expiracao)}</p>}
            {grupo === 'pendentes' && item.data_solicitacao && <p className="text-xs text-muted-foreground">Pedido em {formatarDataCurta(item.data_solicitacao)}</p>}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="whitespace-nowrap rounded-full">{rotuloStatusAutorizacao(item.status)}</Badge>
            <Button asChild size="sm" variant="outline" className="min-h-11 rounded-full"><Link to={`/pacientes/${encodeURIComponent(item.paciente_id)}/autorizacoes`}>{grupo === 'pendentes' ? 'Registrar resposta' : 'Abrir'}</Link></Button>
          </div>
        </li>)}
      </ul>}
    </CardContent>
  </Card>;
}
