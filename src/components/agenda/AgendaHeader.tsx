import { format, addDays, addWeeks, addMonths, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import {
  ChevronLeft, ChevronRight, Filter, Plus, Palette, Ban, Search,
  CalendarDays, LayoutGrid, List,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AgendaView } from './AgendaPage';

interface Props {
  date: string;
  view: AgendaView;
  onDateChange: (d: string) => void;
  onViewChange: (v: AgendaView) => void;
  search: string;
  onSearchChange: (s: string) => void;
  medicos: any[];
  statusFilter: string[];
  medicoFilter: string[];
  onStatusFilterChange: (s: string[]) => void;
  onMedicoFilterChange: (s: string[]) => void;
  onNewAppointment: () => void;
  onNewBlock: () => void;
  onOpenColorScheme: () => void;
  onToggleWaiting: () => void;
  waitingCount: number;
  totals: { total: number; confirmados: number; aguardando: number; cancelados: number };
}

const STATUSES: [string, string][] = [
  ['agendado', 'Agendado'],
  ['confirmado', 'Confirmado'],
  ['aguardando', 'Aguardando'],
  ['em_atendimento', 'Em atendimento'],
  ['finalizado', 'Finalizado'],
  ['cancelado', 'Cancelado'],
  ['faltou', 'Faltou'],
];

export function AgendaHeader(p: Props) {
  const d = parseISO(p.date);
  const label = p.view === 'monthly'
    ? format(d, "MMMM 'de' yyyy", { locale: ptBR })
    : p.view === 'weekly'
      ? `Semana de ${format(d, "d 'de' MMM", { locale: ptBR })}`
      : format(d, "EEEE, d 'de' MMMM", { locale: ptBR });

  const nav = (dir: -1 | 1) => {
    const next = p.view === 'monthly' ? addMonths(d, dir) : p.view === 'weekly' ? addWeeks(d, dir) : addDays(d, dir);
    p.onDateChange(format(next, 'yyyy-MM-dd'));
  };

  return (
    <div className="flex flex-col gap-3 pb-4 border-b border-border/60">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => p.onDateChange(format(new Date(), 'yyyy-MM-dd'))}>
            Hoje
          </Button>
          <div className="flex items-center rounded-md border">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => nav(-1)}><ChevronLeft className="h-4 w-4" /></Button>
            <Input
              type="date"
              value={p.date}
              onChange={(e) => p.onDateChange(e.target.value)}
              className="h-8 w-36 border-0 focus-visible:ring-0 text-sm"
            />
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => nav(1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
          <h2 className="text-lg font-semibold capitalize hidden md:block">{label}</h2>
        </div>

        <div className="flex items-center gap-1 rounded-md border p-0.5">
          <Button variant={p.view === 'daily' ? 'default' : 'ghost'} size="sm" className="h-7" onClick={() => p.onViewChange('daily')}>
            <List className="h-3.5 w-3.5 mr-1" /> Dia
          </Button>
          <Button variant={p.view === 'weekly' ? 'default' : 'ghost'} size="sm" className="h-7" onClick={() => p.onViewChange('weekly')}>
            <LayoutGrid className="h-3.5 w-3.5 mr-1" /> Semana
          </Button>
          <Button variant={p.view === 'monthly' ? 'default' : 'ghost'} size="sm" className="h-7" onClick={() => p.onViewChange('monthly')}>
            <CalendarDays className="h-3.5 w-3.5 mr-1" /> Mês
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={p.onNewBlock}><Ban className="h-4 w-4 mr-1" /> Bloquear</Button>
          <Button variant="outline" size="sm" onClick={p.onOpenColorScheme}><Palette className="h-4 w-4 mr-1" /> Cores</Button>
          <Button variant="outline" size="sm" onClick={p.onToggleWaiting}>
            Lista espera <Badge variant="secondary" className="ml-1">{p.waitingCount}</Badge>
          </Button>
          <Button size="sm" onClick={p.onNewAppointment}><Plus className="h-4 w-4 mr-1" /> Nova consulta</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar paciente, CPF ou telefone..."
            value={p.search}
            onChange={(e) => p.onSearchChange(e.target.value)}
            className="pl-8 h-8"
          />
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              <Filter className="h-4 w-4 mr-1" /> Médicos
              {p.medicoFilter.length > 0 && <Badge variant="secondary" className="ml-1">{p.medicoFilter.length}</Badge>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2 max-h-80 overflow-y-auto">
            {p.medicos.map((m: any) => (
              <label key={m.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/50 cursor-pointer">
                <Checkbox
                  checked={p.medicoFilter.includes(m.id)}
                  onCheckedChange={(v) => p.onMedicoFilterChange(v
                    ? [...p.medicoFilter, m.id]
                    : p.medicoFilter.filter(x => x !== m.id))}
                />
                <span className="text-sm">Dr(a). {m.nome || m.crm}</span>
              </label>
            ))}
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              <Filter className="h-4 w-4 mr-1" /> Status
              {p.statusFilter.length > 0 && <Badge variant="secondary" className="ml-1">{p.statusFilter.length}</Badge>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-52 p-2">
            {STATUSES.map(([k, l]) => (
              <label key={k} className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/50 cursor-pointer">
                <Checkbox
                  checked={p.statusFilter.includes(k)}
                  onCheckedChange={(v) => p.onStatusFilterChange(v
                    ? [...p.statusFilter, k]
                    : p.statusFilter.filter(x => x !== k))}
                />
                <span className="text-sm">{l}</span>
              </label>
            ))}
          </PopoverContent>
        </Popover>

        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          <span><b className="text-foreground">{p.totals.total}</b> total</span>
          <span className="text-success"><b>{p.totals.confirmados}</b> conf.</span>
          <span className="text-warning"><b>{p.totals.aguardando}</b> aguard.</span>
          <span className="text-destructive"><b>{p.totals.cancelados}</b> canc.</span>
        </div>
      </div>
    </div>
  );
}
