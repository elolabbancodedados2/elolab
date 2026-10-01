/**
 * Diálogo de finalização com a pergunta do retorno.
 *
 * O retorno é perguntado no fechamento porque é aqui que o profissional sabe
 * se o paciente volta — antes essa decisão vivia numa aba que era preciso
 * lembrar de abrir, e o resultado foi zero retornos em 18 atendimentos.
 *
 * Antes cada tela tinha (ou não tinha) a sua própria pergunta: a Fila
 * perguntava, a Recepção e a Agenda finalizavam sem perguntar. Este
 * componente é a pergunta ÚNICA, usada por todas as vias de finalização.
 */
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

interface FinalizarAtendimentoDialogProps {
  open: boolean;
  pacienteNome: string;
  onClose: () => void;
  /** Recebe o prazo escolhido (dias) ou null para "sem retorno". */
  onConfirm: (dias: number | null) => Promise<void>;
}

const OPCOES = [7, 15, 30, 60, 90, 180];

export function FinalizarAtendimentoDialog({
  open,
  pacienteNome,
  onClose,
  onConfirm,
}: FinalizarAtendimentoDialogProps) {
  const [submitting, setSubmitting] = useState(false);

  // Nunca fechar em estado de submit: a promessa de finalização ainda está
  // correndo. E ao reabrir, o estado começa limpo.
  useEffect(() => {
    if (!open) setSubmitting(false);
  }, [open]);

  const confirmar = async (dias: number | null) => {
    // Trava de duplo clique: sem ela, o segundo clique dispara a finalização
    // duas vezes — cobrança e retorno duplicados. O resto do app já travava
    // os botões de submit; aqui era o único ponto cego.
    if (submitting) return;
    setSubmitting(true);
    try {
      await onConfirm(dias);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={a => { if (!a && !submitting) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Finalizar — {pacienteNome}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Este paciente volta?</p>
          <div className="grid grid-cols-3 gap-2">
            {OPCOES.map(d => (
              <Button
                key={d}
                variant="outline"
                disabled={submitting}
                onClick={() => confirmar(d)}
              >
                {d === 180 ? '6 meses' : `${d} dias`}
              </Button>
            ))}
          </div>
        </div>
        <DialogFooter className="sm:justify-between">
          <Button
            variant="ghost"
            disabled={submitting}
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button
            disabled={submitting}
            onClick={() => confirmar(null)}
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Sem retorno — finalizar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
