import { formatWithDatePreference as format } from '@/lib/datePreference';
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

import { ptBR } from 'date-fns/locale';
import { AlertTriangle, CheckCircle2, ChevronRight, ChevronDown, FileDown, Loader2, Receipt } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { PagamentosDaCobranca } from './PagamentosDaCobranca';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ErrorState } from '@/components/ErrorState';
import { mensagemDeErro } from '@/lib/erros';
import { anosComPagamento, gerarDeclaracaoIRPDF } from '@/lib/pdfPacientes';
import { downloadPDF } from '@/lib/pdfGenerator';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency } from '@/lib/formatters';
import { saldoDevedor } from '@/lib/liberacaoAtendimento';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { todaySaoPauloDateOnly } from '@/lib/dateOnly';

interface Props {
  pacienteId: string;
  /** Nome e CPF que saem na declaração para o Imposto de Renda. */
  paciente?: { nome: string; cpf?: string | null } | null;
}

/** 42501 é a recusa do RLS: só ela vira "sem acesso". O resto é falha de verdade. */
export function erroDeAcessoFinanceiro(erro: unknown): boolean {
  const e = erro as { code?: string; message?: string } | null;
  return e?.code === '42501' || /permission denied|row-level security/i.test(String(e?.message ?? ''));
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

export function ExtratoDoPaciente({ pacienteId, paciente }: Props) {
  const { user, profile, hasRole, isAdmin } = useSupabaseAuth();
  const podeReceber = isAdmin() || hasRole('recepcao') || hasRole('financeiro');
  const [anoDeclaracao, setAnoDeclaracao] = useState<string>('');
  const [gerandoDeclaracao, setGerandoDeclaracao] = useState(false);
  const [hoje, setHoje] = useState(() => todaySaoPauloDateOnly());
  useEffect(() => {
    const timer = window.setInterval(() => setHoje(todaySaoPauloDateOnly()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  // Uma cobrança por vez: abrir todas encheria a ficha de detalhe que ninguém
  // pediu.
  const [aberta, setAberta] = useState<string | null>(null);

  const { data: cobrancas = [], isLoading, error, refetch } = useQuery({
    queryKey: ['extrato-paciente', user?.id ?? null, profile?.clinica_id ?? null, pacienteId],
    enabled: !!pacienteId && !!user && !!profile?.clinica_id,
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

  if (isLoading) return <Skeleton className="h-40" />;

  if (error) {
    // Sem permissão para o financeiro, dizer isso é melhor que mostrar zero —
    // "não deve nada" e "você não pode ver" são coisas muito diferentes. Mas
    // queda de rede não é falta de permissão: aí o certo é tentar de novo.
    if (erroDeAcessoFinanceiro(error)) {
      return (
        <p role="status" className="text-sm text-muted-foreground">
          Seu perfil não tem acesso ao financeiro deste paciente.
        </p>
      );
    }
    return <ErrorState compact title="Não foi possível carregar o financeiro deste paciente" error={error} onRetry={() => { void refetch(); }} />;
  }

  if (cobrancas.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhuma cobrança registrada para este paciente.</p>;
  }

  const anos = anosComPagamento(cobrancas);
  const anoSelecionado = anoDeclaracao || (anos[0] ? String(anos[0]) : '');
  const gerarDeclaracao = async () => {
    if (!paciente || !anoSelecionado || gerandoDeclaracao) return;
    setGerandoDeclaracao(true);
    try {
      const doc = await gerarDeclaracaoIRPDF(paciente, Number(anoSelecionado), cobrancas);
      downloadPDF(doc, `declaracao-ir-${anoSelecionado}.pdf`);
    } catch (erro) {
      toast.error('Não foi possível gerar a declaração.', { description: mensagemDeErro(erro) });
    } finally {
      setGerandoDeclaracao(false);
    }
  };

  return (
    <div className="space-y-4">
      {paciente && anos.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm">
            <p className="font-medium">Declaração para o Imposto de Renda</p>
            <p className="text-xs text-muted-foreground">Soma o que foi pago nas cobranças do ano escolhido.</p>
          </div>
          <div className="flex gap-2">
            <Select value={anoSelecionado} onValueChange={setAnoDeclaracao}>
              <SelectTrigger aria-label="Ano da declaração" className="h-11 w-28"><SelectValue /></SelectTrigger>
              <SelectContent>{anos.map(ano => <SelectItem key={ano} value={String(ano)}>{ano}</SelectItem>)}</SelectContent>
            </Select>
            <Button type="button" variant="outline" className="h-11 gap-1.5" onClick={() => void gerarDeclaracao()} disabled={gerandoDeclaracao}>
              {gerandoDeclaracao ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <FileDown aria-hidden="true" className="h-4 w-4" />}Gerar PDF
            </Button>
          </div>
        </div>
      )}
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
              aria-expanded={expandida}
              onClick={() => setAberta(expandida ? null : c.id)}
              className="flex min-h-11 w-full flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2 text-left text-xs hover:bg-accent/30"
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
                {podeReceber && falta > 0.009 && (
                  <div className="flex justify-end px-3 pb-2">
                    <Button asChild size="sm" className="h-11 gap-1.5">
                      <Link to={`/recepcao/pagamentos/${encodeURIComponent(c.id)}`} state={{ returnTo: `/pacientes/${encodeURIComponent(pacienteId)}?tab=financeiro` }}>
                        <Receipt aria-hidden="true" className="h-4 w-4" />Receber {formatCurrency(falta)}
                      </Link>
                    </Button>
                  </div>
                )}
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
