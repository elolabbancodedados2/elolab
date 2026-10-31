import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { Plus } from '@/components/icons/elolabIcons';
import { Ban } from 'lucide-react';
import { formatWithDatePreference } from '@/lib/datePreference';

// Painel lateral do protótipo aprovado em 30/10/2026: calendário do mês e atalho para agendar no dia.
interface Props {
  date: string;
  diasComConsulta?: Record<string, number>;
  onDateChange: (date: string) => void;
  onNovoAgendamento: () => void;
  onBloquear?: () => void;
}

export function PainelNovoAgendamento({ date, diasComConsulta, onDateChange, onNovoAgendamento, onBloquear }: Props) {
  const dia = parseISO(date);
  const diasMarcados = Object.entries(diasComConsulta ?? {})
    .filter(([, total]) => total > 0)
    .map(([iso]) => parseISO(iso));

  return (
    <section aria-labelledby="painel-novo-agendamento" className="border-b border-border/60 p-3">
      <p id="painel-novo-agendamento" className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Novo agendamento</p>
      <p className="mt-0.5 text-base font-extrabold tracking-tight first-letter:uppercase">{format(dia, "EEEE, d 'de' MMM", { locale: ptBR })}</p>
      <Calendar
        mode="single"
        locale={ptBR}
        selected={dia}
        month={dia}
        onMonthChange={mes => onDateChange(format(mes, 'yyyy-MM-01'))}
        onSelect={selecionado => { if (selecionado) onDateChange(format(selecionado, 'yyyy-MM-dd')); }}
        modifiers={{ comConsulta: diasMarcados }}
        modifiersClassNames={{ comConsulta: "relative font-semibold after:absolute after:bottom-1 after:left-1/2 after:h-1 after:w-1 after:-translate-x-1/2 after:rounded-full after:bg-foreground after:content-['']" }}
        classNames={{
          day_selected: 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground after:bg-primary-foreground',
          day_today: 'ring-1 ring-border font-semibold',
        }}
        className="-mx-1 mt-1 p-0"
      />
      <Button type="button" onClick={onNovoAgendamento} className="mt-2 h-9 w-full gap-1.5 rounded-lg">
        <Plus aria-hidden="true" className="h-4 w-4" /> Agendar em {formatWithDatePreference(dia, 'dd/MM')}
      </Button>
      {onBloquear && (
        <Button type="button" variant="outline" onClick={onBloquear} className="mt-1.5 h-8 w-full gap-1.5 rounded-lg text-xs">
          <Ban aria-hidden="true" className="h-3.5 w-3.5" /> Bloquear horário
        </Button>
      )}
      <p className="mt-2 text-[11px] leading-snug text-muted-foreground">Ou clique num horário vago da grade para agendar com o profissional e a hora já preenchidos.</p>
    </section>
  );
}
