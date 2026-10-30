import { nomeMedico } from '@/lib/formatters';
import { format, addDays, addWeeks, addMonths, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatWithDatePreference } from '@/lib/datePreference';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  ChevronLeft, ChevronRight, Filter, Plus, Palette, Ban, Search, X,
  CalendarDays, LayoutGrid, List, MoreHorizontal, Users2, Printer, Keyboard, Pin, SkipForward,
} from '@/components/icons/elolabIcons';
import { cn } from '@/lib/utils';
import { AgendaView } from './AgendaPage';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { normalizeAgendaDate } from '@/lib/agendaDate';
import { todaySaoPauloDateOnly } from '@/lib/dateOnly';

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
  defaultView: AgendaView | null;
  onSetDefaultView: (v: AgendaView) => void;
  legend?: Array<{ label: string; color: string }>;
  /** Dias (yyyy-MM-dd) com consultas, para marcar no mini‑calendário. */
  diasComConsulta?: Record<string, number>;
  /** Rola até a próxima consulta do dia (só na visão diária de hoje). */
  onIrParaProxima?: () => void;
}

const TOTAL_FILTERS: Record<'total' | 'confirmados' | 'aguardando' | 'cancelados', string[]> = {
  total: [],
  confirmados: ['confirmado'],
  aguardando: ['agendado', 'aguardando'],
  cancelados: ['cancelado'],
};

const STATUSES: [string, string][] = [
  ['agendado', 'Agendado'],
  ['confirmado', 'Confirmado'],
  ['aguardando', 'Aguardando'],
  ['aguardando_triagem', 'Aguardando triagem'],
  ['em_triagem', 'Em triagem'],
  ['fila_atendimento', 'Na fila de atendimento'],
  ['em_atendimento', 'Em atendimento'],
  ['finalizado', 'Finalizado'],
  ['atendimento_finalizado', 'Atendimento finalizado'],
  ['aguardando_pagamento', 'Aguardando pagamento'],
  ['aguardando_pagamento_adicional', 'Aguardando pagamento adicional'],
  ['pago', 'Pago'],
  ['cancelado', 'Cancelado'],
  ['faltou', 'Faltou'],
];

const pill = 'rounded-full border-border bg-card text-foreground hover:bg-accent';

export function AgendaHeader(p: Props) {
  const safeDate = normalizeAgendaDate(p.date);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const d = parseISO(safeDate);
  const formattedLabel = p.view === 'monthly'
    ? format(d, "MMMM 'de' yyyy", { locale: ptBR })
    : p.view === 'weekly'
      ? `Semana de ${format(d, "d 'de' MMM", { locale: ptBR })}`
      : format(d, "EEEE, d 'de' MMM", { locale: ptBR });
  const label = formattedLabel.replace(/^./u, (first) => first.toLocaleUpperCase('pt-BR'));

  const nav = (dir: -1 | 1) => {
    const next = p.view === 'monthly' ? addMonths(d, dir) : p.view === 'weekly' ? addWeeks(d, dir) : addDays(d, dir);
    p.onDateChange(format(next, 'yyyy-MM-dd'));
  };

  const today = todaySaoPauloDateOnly();
  const isToday = safeDate === today;
  const activeFilters = p.medicoFilter.length + p.statusFilter.length + (p.search ? 1 : 0);
  const sameFilter = (a: string[], b: string[]) => a.length === b.length && a.every(s => b.includes(s));
  const toggleTotal = (key: keyof typeof TOTAL_FILTERS) => {
    const alvo = TOTAL_FILTERS[key];
    p.onStatusFilterChange(sameFilter(p.statusFilter, alvo) ? [] : alvo);
  };
  const diasMarcados = Object.entries(p.diasComConsulta ?? {})
    .filter(([, total]) => total > 0)
    .map(([iso]) => parseISO(iso));

  return (
    <div className="flex flex-col gap-3 rounded-[24px] border border-border/60 bg-card p-3 shadow-xs sm:gap-4 sm:p-5">
      {/* Linha 1: título + navegação de data | ações principais */}
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-xl font-extrabold tracking-[-0.03em] text-foreground sm:text-[26px]">{label}</h1>
            {isToday && <Badge className="shrink-0 border-transparent bg-primary text-primary-foreground shadow-sm hover:bg-primary">HOJE</Badge>}
          </div>
          <div className="flex w-full items-center rounded-full border border-border bg-card p-0.5 shadow-xs sm:w-auto sm:shrink-0">
            <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 rounded-full sm:h-9 sm:w-9" onClick={() => nav(-1)} aria-label="Anterior">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className={cn('h-10 rounded-full px-3 text-xs font-semibold sm:h-9', isToday && 'text-primary')} onClick={() => p.onDateChange(todaySaoPauloDateOnly())}>
              Hoje
            </Button>
            <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 rounded-full sm:h-9 sm:w-9" onClick={() => nav(1)} aria-label="Próximo">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <div className="mx-0.5 h-5 w-px bg-border" />
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" aria-label="Data da agenda" aria-haspopup="dialog" className="h-10 flex-1 justify-center gap-2 rounded-full px-3 text-xs font-semibold tabular-nums sm:h-9 sm:flex-none">
                  <CalendarDays className="h-4 w-4 text-primary" />
                  {formatWithDatePreference(d, 'dd/MM/yyyy')}
                </Button>
              </PopoverTrigger>
              <PopoverContent data-elo-font-preview="agenda" align="start" className="w-auto rounded-2xl p-0">
                <Calendar
                  mode="single"
                  locale={ptBR}
                  selected={d}
                  defaultMonth={d}
                  onSelect={(dia) => {
                    if (!dia) return;
                    p.onDateChange(format(dia, 'yyyy-MM-dd'));
                    setCalendarOpen(false);
                  }}
                  modifiers={{ comConsulta: diasMarcados }}
                  modifiersClassNames={{ comConsulta: "relative font-semibold after:absolute after:bottom-1 after:left-1/2 after:h-1 after:w-1 after:-translate-x-1/2 after:rounded-full after:bg-primary after:content-['']" }}
                  classNames={{
                    day_selected: 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground after:bg-primary-foreground',
                    day_today: 'ring-1 ring-primary/50 text-primary',
                  }}
                />
                <p className="border-t border-border/60 px-3 py-2 text-[11px] text-muted-foreground">
                  <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-primary align-middle" /> dias com consulta
                </p>
              </PopoverContent>
            </Popover>
            {p.onIrParaProxima && (
              <>
                <div className="mx-0.5 h-5 w-px bg-border" />
                <Button variant="ghost" size="sm" onClick={p.onIrParaProxima} aria-label="Ir para a próxima consulta" title="Ir para a próxima consulta" className="h-10 gap-1.5 rounded-full px-3 text-xs font-semibold text-primary sm:h-9">
                  <SkipForward className="h-3.5 w-3.5" /> <span className="hidden xl:inline">Próxima</span>
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="flex w-full items-center gap-2 lg:w-auto lg:justify-end">
          <Button variant="outline" size="sm" onClick={p.onToggleWaiting} aria-label={`Alternar lista de espera${p.waitingCount ? `, ${p.waitingCount} pacientes` : ''}`} className={cn('hidden h-10 lg:inline-flex', pill)}>
            <Users2 className="h-4 w-4 md:mr-1.5" />
            <span className="hidden md:inline">Espera</span>
            {p.waitingCount > 0 && <Badge className="ml-1.5 h-5 border-transparent bg-primary px-1.5 text-[10px] text-primary-foreground hover:bg-primary">{p.waitingCount}</Badge>}
          </Button>
          <Button asChild variant="outline" size="icon" className={cn('h-11 w-11 shrink-0 lg:hidden', pill)}>
            <Link to="/lista-espera" aria-label={`Abrir lista de espera${p.waitingCount ? `, ${p.waitingCount} pacientes` : ''}`} title="Abrir lista de espera">
              <Users2 className="h-4 w-4" />
              <span className="sr-only">Abrir lista de espera</span>
            </Link>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className={cn('h-11 w-11 shrink-0 sm:h-10 sm:w-10', pill)} aria-label="Mais opções da agenda"><MoreHorizontal className="h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent data-elo-font-preview="agenda" align="end" className="w-56 rounded-xl">
              <DropdownMenuItem onSelect={p.onNewBlock}><Ban className="mr-2 h-4 w-4" /> Bloquear horário</DropdownMenuItem>
              <DropdownMenuItem onSelect={p.onOpenColorScheme}><Palette className="mr-2 h-4 w-4" /> Esquema de cores</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => window.print()}><Printer className="mr-2 h-4 w-4" /> Imprimir agenda</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => p.onSetDefaultView(p.view)}>
                <Pin className="mr-2 h-4 w-4" />
                Definir visão atual como padrão
                {p.defaultView === p.view && <Badge variant="secondary" className="ml-auto text-[10px]">Atual</Badge>}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-xs text-muted-foreground focus:bg-transparent" disabled>
                <Keyboard className="mr-2 h-3.5 w-3.5" />
                <span className="flex-1 leading-relaxed">← → navega · T hoje · N nova<br />D/W/M visão · / busca</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button size="sm" onClick={p.onNewAppointment} aria-label="Nova consulta" className="h-11 flex-1 shrink-0 rounded-full bg-primary text-primary-foreground shadow-md hover:brightness-110 sm:h-10 sm:flex-none sm:px-4">
            <Plus className="mr-1.5 h-4 w-4" /> <span className="whitespace-nowrap">Nova consulta</span>
          </Button>
        </div>
      </div>

      {/* Linha 2: visualização + busca + filtros | totais */}
      <div className="flex flex-col gap-2 2xl:flex-row 2xl:items-center">
        <div role="group" aria-label="Visualização da agenda" className="flex shrink-0 items-center gap-0.5 self-start rounded-full border border-border bg-muted/70 p-1">
          <Button aria-pressed={p.view === 'daily'} variant={p.view === 'daily' ? 'default' : 'ghost'} size="sm" className={cn('h-9 rounded-full px-3', p.view === 'daily' && 'bg-foreground text-background shadow-sm hover:bg-foreground/90')} onClick={() => p.onViewChange('daily')} aria-label="Visualização diária">
            <List className="h-3.5 w-3.5 md:mr-1" /> <span className="hidden md:inline">Dia</span>
          </Button>
          <Button aria-pressed={p.view === 'weekly'} variant={p.view === 'weekly' ? 'default' : 'ghost'} size="sm" className={cn('h-9 rounded-full px-3', p.view === 'weekly' && 'bg-foreground text-background shadow-sm hover:bg-foreground/90')} onClick={() => p.onViewChange('weekly')} aria-label="Visualização semanal">
            <LayoutGrid className="h-3.5 w-3.5 md:mr-1" /> <span className="hidden md:inline">Semana</span>
          </Button>
          <Button aria-pressed={p.view === 'monthly'} variant={p.view === 'monthly' ? 'default' : 'ghost'} size="sm" className={cn('h-9 rounded-full px-3', p.view === 'monthly' && 'bg-foreground text-background shadow-sm hover:bg-foreground/90')} onClick={() => p.onViewChange('monthly')} aria-label="Visualização mensal">
            <CalendarDays className="h-3.5 w-3.5 md:mr-1" /> <span className="hidden md:inline">Mês</span>
          </Button>
        </div>

        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <div className="relative w-full min-w-0 sm:min-w-[240px] sm:max-w-sm sm:flex-1">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar paciente, CPF ou telefone"
              value={p.search}
              onChange={(e) => p.onSearchChange(e.target.value)}
              aria-label="Buscar paciente, CPF ou telefone"
              className={cn('h-10 rounded-full border-border bg-card pl-9 text-sm focus-visible:ring-primary sm:h-9', p.search && 'pr-10')}
            />
            {p.search && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Limpar busca"
                onClick={() => p.onSearchChange('')}
                className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 rounded-full text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn('h-10 sm:h-9', pill, p.medicoFilter.length > 0 && 'border-primary/40 text-primary')}>
                <Filter className="h-3.5 w-3.5 mr-1.5" /> Médicos
                {p.medicoFilter.length > 0 && <Badge className="ml-1.5 h-4 border-transparent bg-primary px-1 text-[10px] text-primary-foreground hover:bg-primary">{p.medicoFilter.length}</Badge>}
              </Button>
            </PopoverTrigger>
            <PopoverContent data-elo-font-preview="agenda" className="max-h-80 w-64 overflow-y-auto rounded-xl p-2">
              <div className="mb-1 flex items-center justify-between border-b pb-2">
                <span className="text-xs font-medium">Filtrar médicos</span>
                {p.medicoFilter.length > 0 && (
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => p.onMedicoFilterChange([])}>Limpar</Button>
                )}
              </div>
              {p.medicos.map((m: any) => (
                <label key={m.id} className="flex cursor-pointer items-center gap-2 rounded p-1.5 hover:bg-muted/50">
                  <Checkbox
                    checked={p.medicoFilter.includes(m.id)}
                    onCheckedChange={(v) => p.onMedicoFilterChange(v
                      ? [...p.medicoFilter, m.id]
                      : p.medicoFilter.filter(x => x !== m.id))}
                  />
                  <span className="text-sm">{nomeMedico(m.nome || m.crm)}</span>
                </label>
              ))}
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn('h-10 sm:h-9', pill, p.statusFilter.length > 0 && 'border-primary/40 text-primary')}>
                <Filter className="h-3.5 w-3.5 mr-1.5" /> Status
                {p.statusFilter.length > 0 && <Badge className="ml-1.5 h-4 border-transparent bg-primary px-1 text-[10px] text-primary-foreground hover:bg-primary">{p.statusFilter.length}</Badge>}
              </Button>
            </PopoverTrigger>
            <PopoverContent data-elo-font-preview="agenda" className="w-56 rounded-xl p-2">
              <div className="mb-1 flex items-center justify-between border-b pb-2">
                <span className="text-xs font-medium">Filtrar status</span>
                {p.statusFilter.length > 0 && (
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => p.onStatusFilterChange([])}>Limpar</Button>
                )}
              </div>
              {STATUSES.map(([k, l]) => (
                <label key={k} className="flex cursor-pointer items-center gap-2 rounded p-1.5 hover:bg-muted/50">
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
            <Button variant="ghost" size="sm" className="h-8 rounded-full text-xs text-muted-foreground" onClick={() => {
              p.onMedicoFilterChange([]); p.onStatusFilterChange([]); p.onSearchChange('');
            }}>Limpar filtros</Button>
          )}
        </div>

        <div role="group" aria-label={`Resumo dos atendimentos: ${p.totals.total} no total, ${p.totals.confirmados} confirmados, ${p.totals.aguardando} aguardando e ${p.totals.cancelados} cancelados`} className="-mx-1 flex w-[calc(100%+0.5rem)] items-center gap-1.5 overflow-x-auto px-1 pb-1 text-xs 2xl:w-auto 2xl:shrink-0 2xl:overflow-visible 2xl:pb-0">
          <Stat label="Total" value={p.totals.total} active={p.statusFilter.length === 0} onClick={() => toggleTotal('total')} />
          <Stat label="Conf." value={p.totals.confirmados} tone="success" active={sameFilter(p.statusFilter, TOTAL_FILTERS.confirmados)} onClick={() => toggleTotal('confirmados')} />
          <Stat label="Aguard." value={p.totals.aguardando} tone="warning" active={sameFilter(p.statusFilter, TOTAL_FILTERS.aguardando)} onClick={() => toggleTotal('aguardando')} />
          <Stat label="Canc." value={p.totals.cancelados} tone="destructive" active={sameFilter(p.statusFilter, TOTAL_FILTERS.cancelados)} onClick={() => toggleTotal('cancelados')} />
        </div>
      </div>

      {p.legend && p.legend.length > 0 && (
        <ul aria-label="Legenda de cores da agenda" className="-mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5 px-0.5 text-[11px] text-muted-foreground">
          {p.legend.map(item => (
            <li key={`${item.label}-${item.color}`} className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full ring-1 ring-black/10" style={{ backgroundColor: item.color }} />
              {item.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value, tone, active, onClick }: { label: string; value: number; tone?: 'success' | 'warning' | 'destructive'; active?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={active && tone ? 'Clique para remover o filtro' : 'Clique para filtrar por este status'}
      className={cn(
        'flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 transition hover:-translate-y-0.5 hover:shadow-sm sm:min-h-9',
        tone === 'success' && 'border-success/30 bg-success/5',
        tone === 'warning' && 'border-warning/30 bg-warning/5',
        tone === 'destructive' && 'border-destructive/30 bg-destructive/5',
        active && tone && 'border-transparent bg-primary text-primary-foreground shadow-sm',
        active && !tone && 'border-primary/40',
      )}
    >
      <span className={cn(
        'text-sm font-extrabold tabular-nums',
        !active && tone === 'success' && 'text-success',
        !active && tone === 'warning' && 'text-warning-foreground',
        !active && tone === 'destructive' && 'text-destructive',
      )}>{value}</span>
      <span className={cn('text-[10px] uppercase tracking-wide', active && tone ? 'text-primary-foreground/75' : 'text-muted-foreground')}>{label}</span>
    </button>
  );
}
