import { format, addDays, addWeeks, addMonths, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  ChevronLeft, ChevronRight, Filter, Plus, Palette, Ban, Search,
  CalendarDays, LayoutGrid, List, MoreHorizontal, Users2, Printer, Keyboard,
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
      : format(d, "EEEE, d 'de' MMM", { locale: ptBR });

  const nav = (dir: -1 | 1) => {
    const next = p.view === 'monthly' ? addMonths(d, dir) : p.view === 'weekly' ? addWeeks(d, dir) : addDays(d, dir);
    p.onDateChange(format(next, 'yyyy-MM-dd'));
  };

  const isToday = p.date === format(new Date(), 'yyyy-MM-dd');
  const activeFilters = p.medicoFilter.length + p.statusFilter.length + (p.search ? 1 : 0);

  return (
    <div className="flex flex-col gap-3 pb-3 border-b border-border/60">
      {/* Row 1: title + nav + view + primary actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-xl font-semibold capitalize truncate">{label}</h1>
          {isToday && p.view === 'daily' && <Badge variant="secondary" className="text-[10px]">HOJE</Badge>}
          <div className="flex items-center rounded-md border shrink-0">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => nav(-1)} aria-label="Anterior">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className="h-8 px-2 text-xs font-medium" onClick={() => p.onDateChange(format(new Date(), 'yyyy-MM-dd'))}>
              Hoje
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => nav(1)} aria-label="Próximo">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <div className="w-px h-5 bg-border" />
            <Input
              type="date"
              value={p.date}
              onChange={(e) => p.onDateChange(e.target.value)}
              className="h-8 w-32 border-0 focus-visible:ring-0 text-sm"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-md border p-0.5">
            <Button variant={p.view === 'daily' ? 'default' : 'ghost'} size="sm" className="h-7 px-2.5" onClick={() => p.onViewChange('daily')}>
              <List className="h-3.5 w-3.5 md:mr-1" /> <span className="hidden md:inline">Dia</span>
            </Button>
            <Button variant={p.view === 'weekly' ? 'default' : 'ghost'} size="sm" className="h-7 px-2.5" onClick={() => p.onViewChange('weekly')}>
              <LayoutGrid className="h-3.5 w-3.5 md:mr-1" /> <span className="hidden md:inline">Semana</span>
            </Button>
            <Button variant={p.view === 'monthly' ? 'default' : 'ghost'} size="sm" className="h-7 px-2.5" onClick={() => p.onViewChange('monthly')}>
              <CalendarDays className="h-3.5 w-3.5 md:mr-1" /> <span className="hidden md:inline">Mês</span>
            </Button>
          </div>

          <Button variant="outline" size="sm" onClick={p.onToggleWaiting} className="h-8">
            <Users2 className="h-4 w-4 md:mr-1.5" />
            <span className="hidden md:inline">Espera</span>
            {p.waitingCount > 0 && <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px]">{p.waitingCount}</Badge>}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onSelect={p.onNewBlock}><Ban className="mr-2 h-4 w-4" /> Bloquear horário</DropdownMenuItem>
              <DropdownMenuItem onSelect={p.onOpenColorScheme}><Palette className="mr-2 h-4 w-4" /> Esquema de cores</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => window.print()}><Printer className="mr-2 h-4 w-4" /> Imprimir agenda</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-xs text-muted-foreground focus:bg-transparent" disabled>
                <Keyboard className="mr-2 h-3.5 w-3.5" />
                <span className="flex-1">← → nav · T hoje · N nova · / buscar</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button size="sm" onClick={p.onNewAppointment} className="h-8 shadow-sm">
            <Plus className="h-4 w-4 md:mr-1" /> <span className="hidden md:inline">Nova consulta</span>
          </Button>
        </div>
      </div>

      {/* Row 2: search + filters + totals */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar paciente, CPF, telefone..."
            value={p.search}
            onChange={(e) => p.onSearchChange(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8">
              <Filter className="h-3.5 w-3.5 mr-1.5" /> Médicos
              {p.medicoFilter.length > 0 && <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">{p.medicoFilter.length}</Badge>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2 max-h-80 overflow-y-auto">
            <div className="flex items-center justify-between pb-2 mb-1 border-b">
              <span className="text-xs font-medium">Filtrar médicos</span>
              {p.medicoFilter.length > 0 && (
                <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => p.onMedicoFilterChange([])}>Limpar</Button>
              )}
            </div>
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
            <Button variant="outline" size="sm" className="h-8">
              <Filter className="h-3.5 w-3.5 mr-1.5" /> Status
              {p.statusFilter.length > 0 && <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">{p.statusFilter.length}</Badge>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-52 p-2">
            <div className="flex items-center justify-between pb-2 mb-1 border-b">
              <span className="text-xs font-medium">Filtrar status</span>
              {p.statusFilter.length > 0 && (
                <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => p.onStatusFilterChange([])}>Limpar</Button>
              )}
            </div>
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

        {activeFilters > 0 && (
          <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={() => {
            p.onMedicoFilterChange([]); p.onStatusFilterChange([]); p.onSearchChange('');
          }}>Limpar filtros</Button>
        )}

        <div className="ml-auto flex items-center gap-1.5 text-xs">
          <Stat label="Total" value={p.totals.total} />
          <Stat label="Conf." value={p.totals.confirmados} tone="success" />
          <Stat label="Aguard." value={p.totals.aguardando} tone="warning" />
          <Stat label="Canc." value={p.totals.cancelados} tone="destructive" />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'success' | 'warning' | 'destructive' }) {
  return (
    <div className={cn(
      'flex items-center gap-1.5 rounded-md border px-2 py-1',
      tone === 'success' && 'border-success/30 bg-success/5',
      tone === 'warning' && 'border-warning/30 bg-warning/5',
      tone === 'destructive' && 'border-destructive/30 bg-destructive/5',
    )}>
      <span className={cn(
        'text-sm font-semibold tabular-nums',
        tone === 'success' && 'text-success',
        tone === 'warning' && 'text-warning',
        tone === 'destructive' && 'text-destructive',
      )}>{value}</span>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
    </div>
  );
}
