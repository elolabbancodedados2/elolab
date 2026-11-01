import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Pill } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { lerQuantidadeDispensacao, type ItemEstoqueDispensacao } from '@/lib/dispensacaoEstoque';
import { parseDateOnly } from '@/lib/dateOnly';
import type { PlanoDispensacaoItem } from '@/lib/workflowAutomation';

export interface ItemDispensacaoConfirmado {
  nome: string;
  quantidade: string;
  estoqueId: string;
}

const NAO_BAIXAR = '__nao_baixar__';

const formatarValidade = (validade: string | null | undefined) => {
  const data = parseDateOnly(validade ?? null);
  return data ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(data) : 'sem validade';
};

export const rotuloOpcaoDispensacao = (item: ItemEstoqueDispensacao) =>
  `${item.nome}${item.lote ? ` · lote ${item.lote}` : ''} · validade ${formatarValidade(item.validade)} · saldo ${item.quantidade}`;

/**
 * Prévia da dispensação: a pessoa confere o item, o lote e a quantidade de cada
 * medicamento antes de baixar. Nada sai do estoque sem passar por aqui.
 */
export function DispensacaoConfirmacao({ plano, open, onOpenChange, onConfirm, enviando }: {
  plano: PlanoDispensacaoItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (itens: ItemDispensacaoConfirmado[]) => void;
  enviando: boolean;
}) {
  const [escolhas, setEscolhas] = useState<Record<number, string>>({});
  const [quantidades, setQuantidades] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!open) return;
    setEscolhas(Object.fromEntries(plano.map((item, indice) => [indice, item.sugeridoId ?? NAO_BAIXAR])));
    setQuantidades(Object.fromEntries(plano.map((item, indice) => [indice, item.quantidade ? String(item.quantidade) : ''])));
  }, [open, plano]);

  const linhas = plano.map((item, indice) => {
    const estoqueId = escolhas[indice] ?? NAO_BAIXAR;
    const quantidadeTexto = quantidades[indice] ?? '';
    const quantidade = lerQuantidadeDispensacao(quantidadeTexto);
    const opcao = item.opcoes.find(o => o.id === estoqueId) ?? null;
    const problema = estoqueId === NAO_BAIXAR
      ? null
      : quantidade === null
        ? 'Informe um número inteiro de unidades.'
        : opcao && quantidade > Number(opcao.quantidade)
          ? `Saldo do lote: ${opcao.quantidade}.`
          : null;
    return { item, indice, estoqueId, quantidadeTexto, quantidade, problema };
  });
  const selecionadas = linhas.filter(l => l.estoqueId !== NAO_BAIXAR);
  const podeConfirmar = selecionadas.length > 0 && selecionadas.every(l => !l.problema) && !enviando;

  return (
    <Dialog open={open} onOpenChange={aberto => { if (!enviando) onOpenChange(aberto); }}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Confirmar dispensação</DialogTitle>
          <DialogDescription>Confira o item, o lote e a quantidade entregue. Só os itens confirmados saem do estoque.</DialogDescription>
        </DialogHeader>
        <ul className="space-y-4">
          {linhas.map(({ item, indice, estoqueId, quantidadeTexto, problema }) => (
            <li key={`${item.nome}-${indice}`} className="space-y-2 rounded-lg border border-border p-3">
              <p className="flex items-center gap-1.5 text-sm font-medium"><Pill aria-hidden="true" className="h-4 w-4" />{item.nome}</p>
              {item.alerta && (
                <p className="flex items-start gap-1.5 text-xs text-warning-foreground">
                  <AlertTriangle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />{item.alerta}
                </p>
              )}
              {item.opcoes.length > 0 ? (
                <div className="grid gap-2 sm:grid-cols-[1fr_6rem]">
                  <div className="space-y-1">
                    <Label htmlFor={`dispensacao-item-${indice}`} className="text-xs">Item e lote</Label>
                    <Select value={estoqueId} onValueChange={valor => setEscolhas(atual => ({ ...atual, [indice]: valor }))}>
                      <SelectTrigger id={`dispensacao-item-${indice}`} className="min-h-11"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NAO_BAIXAR}>Não dar baixa deste item</SelectItem>
                        {item.opcoes.map(opcao => <SelectItem key={opcao.id} value={opcao.id}>{rotuloOpcaoDispensacao(opcao)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`dispensacao-qtd-${indice}`} className="text-xs">Quantidade</Label>
                    <Input id={`dispensacao-qtd-${indice}`} inputMode="numeric" className="min-h-11" value={quantidadeTexto}
                      disabled={estoqueId === NAO_BAIXAR}
                      aria-invalid={problema ? true : undefined}
                      onChange={e => setQuantidades(atual => ({ ...atual, [indice]: e.target.value }))} />
                  </div>
                  {problema && <p role="alert" className="text-xs text-destructive sm:col-span-2">{problema}</p>}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Nenhum lote dentro da validade com este nome. Confira o cadastro no estoque.</p>
              )}
            </li>
          ))}
        </ul>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={enviando}>Cancelar</Button>
          <Button disabled={!podeConfirmar} onClick={() => onConfirm(selecionadas.map(l => ({ nome: l.item.nome, quantidade: l.quantidadeTexto.trim(), estoqueId: l.estoqueId })))}>
            {enviando ? <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" /> : null}
            Dar baixa ({selecionadas.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
