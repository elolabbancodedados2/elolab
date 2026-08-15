/**
 * Painel do dia — as sete perguntas que a recepção faz o tempo todo.
 *
 * A ideia é que alguém contratado ontem consiga tocar o balcão olhando uma
 * faixa só, sem precisar aprender o vocabulário do sistema:
 *
 *   1. Quantos pacientes hoje, e quantos já chegaram?
 *   2. Quem ainda não chegou?
 *   3. Quem chegou e ainda não pagou — e quanto?
 *   4. Quem já pagou e está esperando ser chamado?
 *   5. Quem está em atendimento agora?
 *   6. Quem saiu da consulta devendo o procedimento adicional?
 *   7. Quanto entrou hoje, por forma, e quanto ainda falta receber?
 *
 * Cada cartão que corresponde a uma aba filtra a lista abaixo ao ser clicado —
 * a pergunta e a resposta ficam no mesmo lugar.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Users, Clock, Wallet, CheckCircle2, Stethoscope, AlertTriangle, Banknote,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency } from '@/lib/formatters';
import { saldoDevedor } from '@/lib/liberacaoAtendimento';
import { cn } from '@/lib/utils';

type Aba = 'todos' | 'checkin' | 'balcao' | 'atendimento' | 'concluido';

interface Props {
  /** O mesmo `enriched` da Recepção: { ag, pac, lanc, fila, step }. */
  atendimentos: any[];
  clinicaId?: string | null;
  /** Data do dia em ISO (yyyy-mm-dd). */
  hoje: string;
  onFiltrar: (aba: Aba) => void;
  abaAtiva: Aba;
}

const FORMA_LABEL: Record<string, string> = {
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  credito: 'Crédito',
  debito: 'Débito',
  transferencia: 'Transferência',
  boleto: 'Boleto',
  cheque: 'Cheque',
  convenio: 'Convênio',
  credito_paciente: 'Crédito do paciente',
};

/**
 * Quanto falta receber numa cobrança. Usa a mesma conta da trava de pagamento
 * (`saldoDevedor`, somada em centavos) para o painel nunca discordar do que o
 * banco cobra. Aqui o saldo é limitado a zero: quem pagou a mais não entra
 * como valor negativo no total a receber do dia.
 */
function saldoDaConta(lanc: any): number {
  if (!lanc?.agendamento_id) return 0;
  return Math.max(0, saldoDevedor(lanc.agendamento_id, [lanc]));
}

export interface PagamentoDoDia {
  forma_pagamento: string;
  valor: number | string;
}

/**
 * As sete respostas, calculadas fora do componente para poderem ser testadas.
 *
 * `atendimentos` é o `enriched` da Recepção; `recebidos` são as linhas de
 * `pagamentos` do dia, já sem os estornos.
 */
export function resumoDoDia(atendimentos: any[], recebidos: PagamentoDoDia[]) {
  const chegaram = atendimentos.filter(e => e.step >= 1);
  const naoChegaram = atendimentos.filter(e => e.step === 0);
  const noBalcao = atendimentos.filter(e => e.step === 1);
  // "Pago e esperando" é quem passou do balcão e ainda não entrou na sala.
  const esperandoChamada = atendimentos.filter(
    e => e.step === 2 && e.ag?.status !== 'em_atendimento'
  );
  const emAtendimento = atendimentos.filter(e => e.ag?.status === 'em_atendimento');
  const devendoAdicional = atendimentos.filter(
    e => e.ag?.status === 'aguardando_pagamento_adicional'
  );

  const somar = (lista: any[]) => lista.reduce((s, e) => s + saldoDaConta(e.lanc), 0);
  const recebidoTotal = recebidos.reduce((s, p) => s + (Number(p.valor) || 0), 0);

  const porForma = Object.entries(
    recebidos.reduce((acc: Record<string, number>, p) => {
      acc[p.forma_pagamento] = (acc[p.forma_pagamento] || 0) + (Number(p.valor) || 0);
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1]);

  return {
    total: atendimentos.length,
    chegaram: chegaram.length,
    naoChegaram: naoChegaram.length,
    proximo: naoChegaram[0]?.ag?.hora_inicio?.slice(0, 5) ?? null,
    noBalcao: noBalcao.length,
    aReceberBalcao: somar(noBalcao),
    esperandoChamada: esperandoChamada.length,
    emAtendimento: emAtendimento.length,
    devendoAdicional: devendoAdicional.length,
    valorAdicional: somar(devendoAdicional),
    recebidoTotal,
    porForma,
    // O que falta receber do dia inteiro, não só do balcão.
    aReceberTotal: somar(atendimentos),
  };
}

export function PainelDoDia({ atendimentos, clinicaId, hoje, onFiltrar, abaAtiva }: Props) {
  // Recebido hoje, por forma. Vem de `pagamentos` — a mesma tabela que registra
  // o Pix de R$ 200 e o cartão de R$ 300 da mesma conta como duas linhas.
  const { data: recebidos = [] } = useQuery({
    queryKey: ['pagamentos-do-dia', clinicaId, hoje],
    enabled: !!clinicaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pagamentos')
        .select('forma_pagamento, valor, data_pagamento, estornado_em')
        .eq('clinica_id', clinicaId!)
        .is('estornado_em', null)
        .gte('data_pagamento', `${hoje}T00:00:00`)
        .lte('data_pagamento', `${hoje}T23:59:59`);
      if (error) throw error;
      return data ?? [];
    },
  });

  const n = useMemo(() => resumoDoDia(atendimentos, recebidos), [atendimentos, recebidos]);

  const cartoes: Array<{
    id: string; icone: any; titulo: string; valor: string; detalhe: string;
    aba?: Aba; tom: string; alerta?: boolean;
  }> = [
    {
      id: 'agenda', icone: Users, titulo: 'Pacientes hoje',
      valor: String(n.total),
      detalhe: n.total === 0 ? 'Agenda vazia' : `${n.chegaram} já chegaram`,
      aba: 'todos', tom: 'text-foreground',
    },
    {
      id: 'nao-chegaram', icone: Clock, titulo: 'Ainda não chegaram',
      valor: String(n.naoChegaram),
      detalhe: n.proximo ? `Próximo às ${n.proximo}` : 'Todos chegaram',
      aba: 'checkin', tom: 'text-info',
    },
    {
      id: 'balcao', icone: Wallet, titulo: 'Falta pagar',
      valor: String(n.noBalcao),
      detalhe: n.aReceberBalcao > 0 ? `${formatCurrency(n.aReceberBalcao)} no balcão` : 'Nada em aberto',
      aba: 'balcao', tom: 'text-warning', alerta: n.noBalcao > 0,
    },
    {
      id: 'esperando', icone: CheckCircle2, titulo: 'Pagos, esperando',
      valor: String(n.esperandoChamada),
      detalhe: n.esperandoChamada > 0 ? 'Podem ser chamados' : 'Ninguém na espera',
      aba: 'atendimento', tom: 'text-success',
    },
    {
      id: 'atendendo', icone: Stethoscope, titulo: 'Em atendimento',
      valor: String(n.emAtendimento),
      detalhe: n.emAtendimento > 0 ? 'Consulta em andamento' : 'Nenhum consultório ocupado',
      aba: 'atendimento', tom: 'text-primary',
    },
    {
      id: 'adicional', icone: AlertTriangle, titulo: 'Devem o adicional',
      valor: String(n.devendoAdicional),
      detalhe: n.devendoAdicional > 0
        ? `${formatCurrency(n.valorAdicional)} a cobrar na saída`
        : 'Nenhum procedimento em aberto',
      aba: 'atendimento', tom: 'text-destructive', alerta: n.devendoAdicional > 0,
    },
    {
      id: 'caixa', icone: Banknote, titulo: 'Recebido hoje',
      valor: formatCurrency(n.recebidoTotal),
      detalhe: n.aReceberTotal > 0
        ? `Faltam ${formatCurrency(n.aReceberTotal)}`
        : 'Nada em aberto no dia',
      tom: 'text-success',
    },
  ];

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2">
        {cartoes.map((c, i) => {
          const Icone = c.icone;
          const clicavel = !!c.aba;
          const ativo = c.aba && c.aba === abaAtiva;
          return (
            <motion.button
              key={c.id}
              type="button"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              onClick={() => c.aba && onFiltrar(c.aba)}
              disabled={!clicavel}
              className={cn(
                'rounded-xl border bg-card px-3 py-2.5 text-left transition-colors',
                clicavel ? 'hover:bg-accent/50 cursor-pointer' : 'cursor-default',
                ativo ? 'border-primary ring-1 ring-primary/30' : 'border-border/50',
                c.alerta && !ativo && 'border-current/30'
              )}
            >
              <div className={cn('flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide', c.tom)}>
                <Icone className="h-3 w-3" />
                <span className="truncate">{c.titulo}</span>
              </div>
              <p className={cn('mt-0.5 text-xl font-bold tabular-nums leading-none', c.tom)}>
                {c.valor}
              </p>
              <p className="mt-1 text-[10px] text-muted-foreground truncate" title={c.detalhe}>
                {c.detalhe}
              </p>
            </motion.button>
          );
        })}
      </div>

      {n.porForma.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[10px] text-muted-foreground">
          <span className="font-semibold uppercase tracking-wide">Entrou hoje:</span>
          {n.porForma.map(([forma, valor]) => (
            <span key={forma} className="tabular-nums">
              {FORMA_LABEL[forma] ?? forma} <strong className="text-foreground">{formatCurrency(valor as number)}</strong>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
