import { RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DraftRecoveryNoticeProps {
  savedAt?: string;
  onRestore: () => void;
  onDiscard: () => void;
}

export function DraftRecoveryNotice({ savedAt, onRestore, onDiscard }: DraftRecoveryNoticeProps) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm sm:flex-row sm:items-center sm:justify-between" role="status">
      <p>
        Encontramos um rascunho{savedAt ? ` de ${new Date(savedAt).toLocaleString('pt-BR')}` : ''}.
      </p>
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" onClick={onDiscard}>
          <Trash2 className="mr-1 h-4 w-4" aria-hidden="true" /> Descartar
        </Button>
        <Button type="button" size="sm" onClick={onRestore}>
          <RotateCcw className="mr-1 h-4 w-4" aria-hidden="true" /> Restaurar
        </Button>
      </div>
    </div>
  );
}

