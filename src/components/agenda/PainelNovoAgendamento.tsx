import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Ban, UserPlus } from 'lucide-react';

// Atalhos complementares; data e nova consulta ficam no cabeçalho.
interface Props {
  date: string;
  diasComConsulta?: Record<string, number>;
  onDateChange: (date: string) => void;
  onNovoAgendamento: () => void;
  onBloquear?: () => void;
  onEncaixe?: () => void;
}

export function PainelNovoAgendamento({ date, onBloquear, onEncaixe }: Props) {
  const dia = parseISO(date);

  return (
    <section aria-labelledby="painel-novo-agendamento" className="border-b border-border/60 p-3">
      <p id="painel-novo-agendamento" className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Atalhos da agenda</p>
      <p className="mt-0.5 text-base font-extrabold tracking-tight first-letter:uppercase">{format(dia, "EEEE, d 'de' MMM", { locale: ptBR })}</p>
      {(onEncaixe || onBloquear) && (
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          {onEncaixe && (
            <Button type="button" variant="outline" onClick={onEncaixe} className="h-8 gap-1.5 rounded-lg text-xs">
              <UserPlus aria-hidden="true" className="h-3.5 w-3.5" /> Encaixe
            </Button>
          )}
          {onBloquear && (
            <Button type="button" variant="outline" onClick={onBloquear} className={`h-8 gap-1.5 rounded-lg text-xs${onEncaixe ? '' : ' col-span-2'}`}>
              <Ban aria-hidden="true" className="h-3.5 w-3.5" /> Bloquear horário
            </Button>
          )}
        </div>
      )}
      <p className="mt-2 text-[11px] leading-snug text-muted-foreground">Ou clique num horário vago da grade para agendar com o profissional e a hora já preenchidos.</p>
    </section>
  );
}
