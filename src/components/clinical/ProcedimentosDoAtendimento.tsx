/**
 * Procedimentos realizados durante a consulta.
 *
 * O caso do enunciado: o paciente pagou R$ 250 antes de entrar, e no meio da
 * consulta foi feita uma sutura de R$ 100. Sem esta tela o profissional teria
 * que avisar a recepção por voz — e é assim que procedimento deixa de ser
 * cobrado.
 *
 * O lançamento vai para a conta do atendimento pela RPC
 * `lancar_item_no_atendimento`, que cria a conta se for um retorno gratuito.
 * Ao finalizar, o saldo reaberto manda o agendamento para
 * "aguardando pagamento adicional" e o paciente aparece no balcão.
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Loader2, Scissors, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency } from '@/lib/formatters';

interface Props {
  agendamentoId: string;
  prontuarioId?: string | null;
  /** Recepção e enfermagem veem o que foi lançado, mas não lançam. */
  podeLancar?: boolean;
}

interface ItemLancado {
  id: string;
  descricao: string;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  created_at: string;
}

export function ProcedimentosDoAtendimento({ agendamentoId, prontuarioId, podeLancar = true }: Props) {
  const queryClient = useQueryClient();
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState('');
  const [quantidade, setQuantidade] = useState('1');
  const [salvando, setSalvando] = useState(false);

  const { data: itens = [], isLoading } = useQuery({
    queryKey: ['procedimentos-atendimento', agendamentoId],
    enabled: !!agendamentoId,
    queryFn: async (): Promise<ItemLancado[]> => {
      const { data: conta, error: erroConta } = await supabase
        .from('lancamentos')
        .select('id')
        .eq('agendamento_id', agendamentoId)
        .eq('tipo', 'receita')
        .not('status', 'in', '("cancelado","estornado")')
        .order('created_at')
        .limit(1)
        .maybeSingle();
      if (erroConta) throw erroConta;
      if (!conta) return [];

      const { data, error } = await supabase
        .from('lancamento_itens')
        .select('id, descricao, quantidade, valor_unitario, valor_total, created_at')
        .eq('lancamento_id', conta.id)
        .eq('origem', 'atendimento')
        .order('created_at');
      if (error) throw error;
      return (data ?? []) as ItemLancado[];
    },
  });

  const total = itens.reduce((s, i) => s + Number(i.valor_total || 0), 0);

  async function lancar() {
    const valorNumerico = Number(String(valor).replace(',', '.'));
    if (!descricao.trim()) {
      toast.error('Descreva o procedimento');
      return;
    }
    if (!Number.isFinite(valorNumerico) || valorNumerico <= 0) {
      toast.error('Informe um valor maior que zero');
      return;
    }
    const qtd = Number(quantidade) || 1;

    setSalvando(true);
    try {
      const { data, error } = await supabase.rpc('lancar_item_no_atendimento', {
        p_agendamento_id: agendamentoId,
        p_descricao: descricao.trim(),
        p_valor_unitario: valorNumerico,
        p_quantidade: qtd,
        p_categoria: 'procedimento',
        p_prontuario_id: prontuarioId || null,
      });
      if (error) throw error;

      const saldo = Number((data as any)?.saldo ?? 0);
      setDescricao('');
      setValor('');
      setQuantidade('1');
      queryClient.invalidateQueries({ queryKey: ['procedimentos-atendimento', agendamentoId] });
      queryClient.invalidateQueries({ queryKey: ['lancamentos'] });
      toast.success('Procedimento lançado', {
        description: saldo > 0
          ? `O paciente vai pagar ${formatCurrency(saldo)} no balcão ao sair.`
          : 'Sem saldo em aberto.',
      });
    } catch (e: any) {
      toast.error('Não foi possível lançar o procedimento', {
        description: e?.message || 'Tente novamente.',
      });
    } finally {
      setSalvando(false);
    }
  }

  async function remover(item: ItemLancado) {
    // Só antes de o paciente pagar. Depois do pagamento, o acerto é estorno no
    // caixa — apagar o item deixaria a conta menor que o valor já recebido.
    setSalvando(true);
    try {
      const { error } = await supabase.from('lancamento_itens').delete().eq('id', item.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['procedimentos-atendimento', agendamentoId] });
      queryClient.invalidateQueries({ queryKey: ['lancamentos'] });
      toast.success('Procedimento removido');
    } catch (e: any) {
      toast.error('Não foi possível remover', {
        description: e?.message?.includes('valor_pago')
          ? 'Já houve pagamento nesta conta. Faça o acerto pelo caixa.'
          : e?.message || 'Tente novamente.',
      });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-3">
      {podeLancar && (
        <div className="grid grid-cols-1 md:grid-cols-[1fr_5rem_7rem_auto] gap-2 items-end">
          <div className="space-y-1">
            <Label className="text-[10px]">Procedimento</Label>
            <Input
              value={descricao}
              onChange={e => setDescricao(e.target.value)}
              placeholder="Ex.: Sutura simples"
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">Qtd.</Label>
            <Input
              type="number" min="1" step="1"
              value={quantidade}
              onChange={e => setQuantidade(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">Valor unitário</Label>
            <Input
              type="number" min="0" step="0.01"
              value={valor}
              onChange={e => setValor(e.target.value)}
              placeholder="0,00"
              className="h-8 text-xs"
            />
          </div>
          <Button size="sm" className="h-8 gap-1 text-xs" onClick={lancar} disabled={salvando}>
            {salvando ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            Lançar
          </Button>
        </div>
      )}

      {isLoading ? (
        <p className="text-[11px] text-muted-foreground">Carregando…</p>
      ) : itens.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          Nenhum procedimento lançado neste atendimento.
        </p>
      ) : (
        <div className="space-y-1">
          {itens.map(item => (
            <div
              key={item.id}
              className="flex items-center gap-2 rounded-md border border-border/50 px-2 py-1.5 text-xs"
            >
              <Scissors className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="flex-1 truncate">{item.descricao}</span>
              {Number(item.quantidade) > 1 && (
                <Badge variant="outline" className="text-[10px] h-4 px-1">
                  {item.quantidade}×
                </Badge>
              )}
              <span className="font-semibold tabular-nums">{formatCurrency(Number(item.valor_total))}</span>
              {podeLancar && (
                <Button
                  variant="ghost" size="icon" className="h-6 w-6 shrink-0"
                  onClick={() => remover(item)}
                  disabled={salvando}
                  aria-label={`Remover ${item.descricao}`}
                >
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              )}
            </div>
          ))}
          <div className="flex justify-between px-2 pt-1 text-xs font-semibold">
            <span className="text-muted-foreground">A cobrar no balcão</span>
            <span className="tabular-nums">{formatCurrency(total)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
