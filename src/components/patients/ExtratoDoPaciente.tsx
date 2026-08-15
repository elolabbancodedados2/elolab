/**
 * Extrato financeiro do paciente.
 *
 * A pergunta que a recepção faz o dia inteiro — "esse paciente deve alguma
 * coisa?" — não tinha resposta em lugar nenhum. Contas a Receber lista por
 * vencimento, o painel do dia mostra só hoje, e a ficha do paciente não falava
 * de dinheiro. Para saber, era preciso vasculhar o financeiro por nome.
 *
 * Aqui é por pessoa: quanto deve no total, o que já pagou, e cada cobrança com
 * o que falta nela. O saldo usa `saldoDevedor`, a mesma função da trava de
 * pagamento e do painel do dia — três telas discordando sobre quanto um
 * paciente deve seria pior que não ter nenhuma.
 */
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Wallet, AlertTriangle, CheckCircle2, ChevronRight, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { PagamentosDaCobranca } from './PagamentosDaCobranca';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency } from '@/lib/formatters';
import { saldoDevedor } from '@/lib/liberacaoAtendimento';

interface Props {
  pacienteId: string;
}

interface Cobranca {
  id: string;
  descricao: string | null;
  categoria: string | null;
  valor: number | string;
  valor_pago: number | string | null;
  desconto: number | string | null;
  acrescimo: number | string | null;
  status: string;
  data: string;
  data_vencimento: string | null;
  agendamento_id: string | null;
}

const STATUS: Record<string, { rotulo: string; classe: string }> = {
  pago:      { rotulo: 'Pago',      classe: 'bg-success/10 text-success border-success/20' },
  parcial:   { rotulo: 'Parcial',   classe: 'bg-warning/10 text-warning border-warning/20' },
  pendente:  { rotulo: 'Em aberto', classe: 'bg-muted text-muted-foreground' },
  atrasado:  { rotulo: 'Atrasado',  classe: 'bg-destructive/10 text-destructive border-destructive/20' },
  cancelado: { rotulo: 'Cancelado', classe: 'bg-muted text-muted-foreground line-through' },
  estornado: { rotulo: 'Estornado', classe: 'bg-muted text-muted-foreground line-through' },
};

/** Quanto falta nesta cobrança. Reusa a conta da trava de pagamento. */
function faltaNesta(c: Cobranca): number {
  return Math.max(0, saldoDevedor('x', [{ ...c, agendamento_id: 'x' } as any]));
}

export function ExtratoDoPaciente({ pacienteId }: Props) {
  // Uma cobrança por vez: abrir todas encheria a ficha de detalhe que ninguém
  // pediu.
  const [aberta, setAberta] = useState<string | null>(null);

  const { data: cobrancas = [], isLoading, error } = useQuery({
    queryKey: ['extrato-paciente', pacienteId],
    enabled: !!pacienteId,
    queryFn: async (): Promise<Cobranca[]> => {
      const { data, error } = await supabase
        .from('lancamentos')
        .select('id, descricao, categoria, valor, valor_pago, desconto, acrescimo, status, data, data_vencimento, agendamento_id')
        .eq('paciente_id', pacienteId)
        .eq('tipo', 'receita')
        .order('data', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Cobranca[];
    },
  });

  // Cancelado e estornado não são dívida: contá-los faria o total cobrar o
  // paciente por algo que a própria clínica desfez.
  const vivas = cobrancas.filter(c => !['cancelado', 'estornado'].includes(c.status));
  const emAberto = vivas.filter(c => faltaNesta(c) > 0.009);
  const totalDevido = emAberto.reduce((s, c) => s + faltaNesta(c), 0);
  const totalPago = vivas.reduce((s, c) => s + (Number(c.valor_pago) || 0), 0);

  const hoje = new Date().toISOString().slice(0, 10);

  if (isLoading) return <Skeleton className="h-40" />;

  if (error) {
    // Sem permissão para o financeiro, dizer isso é melhor que mostrar zero —
    // "não deve nada" e "você não pode ver" são coisas muito diferentes.
    return (
      <p className="text-xs text-muted-foreground">
        Não foi possível carregar o financeiro deste paciente. Seu perfil pode
        não ter acesso ao módulo financeiro.
      </p>
    );
  }

  if (cobrancas.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhuma cobrança registrada para este paciente.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className={`rounded-xl border p-3 ${totalDevido > 0 ? 'border-destructive/40 bg-destructive/5' : 'border-border/50'}`}>
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {totalDevido > 0
              ? <AlertTriangle className="h-3 w-3 text-destructive" />
              : <CheckCircle2 className="h-3 w-3 text-success" />}
            Em aberto
          </p>
          <p className={`text-xl font-bold tabular-nums ${totalDevido > 0 ? 'text-destructive' : 'text-success'}`}>
            {formatCurrency(totalDevido)}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {emAberto.length === 0 ? 'nada a receber' : `${emAberto.length} cobrança(s)`}
          </p>
        </div>

        <div className="rounded-xl border border-border/50 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Já pago</p>
          <p className="text-xl font-bold tabular-nums text-success">{formatCurrency(totalPago)}</p>
          <p className="text-[10px] text-muted-foreground">no histórico</p>
        </div>

        <div className="rounded-xl border border-border/50 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Cobranças</p>
          <p className="text-xl font-bold tabular-nums">{vivas.length}</p>
          <p className="text-[10px] text-muted-foreground">
            {cobrancas.length > vivas.length && `${cobrancas.length - vivas.length} cancelada(s)`}
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        {cobrancas.map(c => {
          const falta = faltaNesta(c);
          const cfg = STATUS[c.status] ?? STATUS.pendente;
          const vencida = falta > 0.009 && !!c.data_vencimento && c.data_vencimento < hoje
            && !['cancelado', 'estornado'].includes(c.status);

          const expandida = aberta === c.id;
          return (
            <div key={c.id} className="rounded-lg border border-border/50">
            <button
              type="button"
              onClick={() => setAberta(expandida ? null : c.id)}
              className="flex w-full flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2 text-left text-xs hover:bg-accent/30"
            >
              {expandida
                ? <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                : <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />}
              <span className="tabular-nums text-muted-foreground">
                {format(new Date(`${c.data}T12:00:00`), 'dd/MM/yy', { locale: ptBR })}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium">
                {c.descricao || c.categoria || 'Cobrança'}
              </span>
              <Badge variant="outline" className={`text-[10px] ${cfg.classe}`}>{cfg.rotulo}</Badge>
              {vencida && (
                <Badge variant="destructive" className="text-[10px]">
                  venceu {format(new Date(`${c.data_vencimento}T12:00:00`), 'dd/MM', { locale: ptBR })}
                </Badge>
              )}
              <span className="tabular-nums font-semibold">{formatCurrency(Number(c.valor))}</span>
              {falta > 0.009 && (
                <span className="tabular-nums text-destructive">falta {formatCurrency(falta)}</span>
              )}
            </button>
            {expandida && (
              <div className="border-t border-border/50 py-2">
                <PagamentosDaCobranca lancamentoId={c.id} pacienteId={pacienteId} />
              </div>
            )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
