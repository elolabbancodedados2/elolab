import { formatWithDatePreference as format } from '@/lib/datePreference';
/**
 * Os pagamentos de uma cobrança, com estorno.
 *
 * O caso real: a recepcionista registra R$ 200 no cartão, percebe que era Pix,
 * e até agora não tinha o que fazer. As saídas que sobravam eram todas ruins —
 * cancelar a conta inteira e refazer (perde o histórico) ou lançar valor
 * negativo (quebra a soma).
 *
 * Estornar não apaga: marca. O pagamento errado continua na lista, riscado,
 * com quem estornou e por quê. É assim que se explica uma diferença de caixa
 * três meses depois.
 */
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';

import { ptBR } from 'date-fns/locale';
import { Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency } from '@/lib/formatters';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';

interface Props {
  lancamentoId: string;
  /** Para invalidar o extrato depois do estorno. */
  pacienteId: string;
}

interface Pagamento {
  id: string;
  forma_pagamento: string;
  valor: number | string;
  parcelas: number;
  data_pagamento: string;
  estornado_em: string | null;
  motivo_estorno: string | null;
}

const FORMA: Record<string, string> = {
  dinheiro: 'Dinheiro', pix: 'Pix', credito: 'Crédito', debito: 'Débito',
  transferencia: 'Transferência', boleto: 'Boleto', cheque: 'Cheque',
  convenio: 'Convênio', credito_paciente: 'Crédito do paciente',
};

export function PagamentosDaCobranca({ lancamentoId, pacienteId }: Props) {
  const { user, profile, isAdmin, hasRole } = useSupabaseAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const podeEstornar = isAdmin() || hasRole('recepcao');

  const { data: pagamentos = [], isLoading } = useQuery({
    queryKey: ['pagamentos-da-cobranca', user?.id ?? null, profile?.clinica_id ?? null, lancamentoId],
    enabled: !!lancamentoId && !!user && !!profile?.clinica_id,
    queryFn: async (): Promise<Pagamento[]> => {
      const { data, error } = await (supabase as any)
        .from('pagamentos')
        .select('id, forma_pagamento, valor, parcelas, data_pagamento, estornado_em, motivo_estorno')
        .eq('lancamento_id', lancamentoId)
        .order('data_pagamento');
      if (error) throw error;
      return data ?? [];
    },
  });

  if (isLoading) return <p className="px-3 text-[11px] text-muted-foreground">Carregando pagamentos…</p>;

  if (pagamentos.length === 0) {
    return (
      <p className="px-3 text-[11px] text-muted-foreground">
        Nenhum pagamento registrado nesta cobrança.
      </p>
    );
  }

  return (
    <>
      <div className="space-y-1 pl-3">
        {pagamentos.map(p => {
          const estornado = !!p.estornado_em;
          return (
            <div
              key={p.id}
              className={`flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded border-l-2 px-2 py-1 text-[11px] ${
                estornado ? 'border-muted text-muted-foreground' : 'border-success/40'
              }`}
            >
              <span className={estornado ? 'line-through' : 'font-medium'}>
                {formatCurrency(Number(p.valor))}
              </span>
              <span className={estornado ? 'line-through' : ''}>
                {FORMA[p.forma_pagamento] ?? p.forma_pagamento}
                {p.parcelas > 1 && ` ${p.parcelas}×`}
              </span>
              <span className="tabular-nums text-muted-foreground">
                {format(new Date(p.data_pagamento), 'dd/MM/yy HH:mm', { locale: ptBR })}
              </span>
              {estornado ? (
                <span className="w-full text-[10px] italic">
                  estornado em {format(new Date(p.estornado_em!), 'dd/MM/yy', { locale: ptBR })}
                  {p.motivo_estorno && ` — ${p.motivo_estorno}`}
                </span>
              ) : podeEstornar ? (
                <Button
                  variant="ghost" size="sm"
                  className="ml-auto h-5 gap-1 px-1.5 text-[10px] text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    const returnSearch = new URLSearchParams(location.search);
                    returnSearch.set('tab', 'financeiro');
                    navigate(`/pacientes/${encodeURIComponent(pacienteId)}/cobrancas/${encodeURIComponent(lancamentoId)}/estorno`, {
                      state: {
                        patientId: pacienteId,
                        paymentId: p.id,
                        returnTo: `${location.pathname}?${returnSearch.toString()}`,
                        returnState: location.state,
                        returnScrollTop: document.getElementById('main-content')?.scrollTop ?? 0,
                      },
                    });
                  }}
                >
                  <Undo2 className="h-2.5 w-2.5" /> Estornar
                </Button>
              ) : null}
            </div>
          );
        })}
      </div>

    </>
  );
}
