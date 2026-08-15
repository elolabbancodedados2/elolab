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
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Undo2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency } from '@/lib/formatters';

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
  const queryClient = useQueryClient();
  const [alvo, setAlvo] = useState<Pagamento | null>(null);
  const [motivo, setMotivo] = useState('');
  const [estornando, setEstornando] = useState(false);

  const { data: pagamentos = [], isLoading } = useQuery({
    queryKey: ['pagamentos-da-cobranca', lancamentoId],
    enabled: !!lancamentoId,
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

  async function estornar() {
    if (!alvo) return;
    if (motivo.trim().length < 3) {
      toast.error('Diga o motivo do estorno', {
        description: 'É o que explica a diferença de caixa quando alguém perguntar.',
      });
      return;
    }
    setEstornando(true);
    try {
      const { data, error } = await (supabase as any).rpc('estornar_pagamento', {
        p_pagamento_id: alvo.id,
        p_motivo: motivo.trim(),
      });
      if (error) throw error;
      if (!(data as any)?.success) throw new Error((data as any)?.error ?? 'Falhou.');

      toast.success(`${formatCurrency(Number(alvo.valor))} estornado`, {
        description: `A cobrança voltou para "${(data as any).conta_status}".`,
      });
      setAlvo(null); setMotivo('');
      queryClient.invalidateQueries({ queryKey: ['pagamentos-da-cobranca', lancamentoId] });
      queryClient.invalidateQueries({ queryKey: ['extrato-paciente', pacienteId] });
      queryClient.invalidateQueries({ queryKey: ['lancamentos'] });
    } catch (e: any) {
      toast.error('Não foi possível estornar', { description: e?.message });
    } finally {
      setEstornando(false);
    }
  }

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
              ) : (
                <Button
                  variant="ghost" size="sm"
                  className="ml-auto h-5 gap-1 px-1.5 text-[10px] text-muted-foreground hover:text-destructive"
                  onClick={() => { setAlvo(p); setMotivo(''); }}
                >
                  <Undo2 className="h-2.5 w-2.5" /> Estornar
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <Dialog open={!!alvo} onOpenChange={a => { if (!a) { setAlvo(null); setMotivo(''); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Estornar {alvo && formatCurrency(Number(alvo.valor))}
              {alvo && ` em ${FORMA[alvo.forma_pagamento] ?? alvo.forma_pagamento}`}
            </DialogTitle>
            <DialogDescription>
              O pagamento não é apagado — fica registrado como estornado, com a
              data e o motivo. A cobrança volta a ficar em aberto.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="motivo-estorno">Motivo</Label>
            <Input
              id="motivo-estorno" value={motivo}
              onChange={e => setMotivo(e.target.value)}
              placeholder="Ex.: registrado no cartão, mas o paciente pagou em Pix"
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAlvo(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={estornar} disabled={estornando}>
              {estornando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Estornar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
