import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Calendar, ClipboardList, FileText, FlaskConical, Search, Users, Wallet } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';
import { useSupabaseAuth, type AppRole } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';

type SearchType = 'paciente' | 'consulta' | 'exame' | 'pagamento' | 'tarefa' | 'documento';
type Result = { tipo: SearchType; id: string; titulo: string; subtitulo: string | null; href: string; data_referencia: string | null };

const TYPE_META: Record<SearchType, { label: string; icon: typeof Users }> = {
  paciente: { label: 'Pacientes', icon: Users }, consulta: { label: 'Consultas', icon: Calendar },
  exame: { label: 'Exames', icon: FlaskConical }, pagamento: { label: 'Pagamentos', icon: Wallet },
  tarefa: { label: 'Tarefas', icon: ClipboardList }, documento: { label: 'Documentos', icon: FileText },
};

const PAGES: Array<{ label: string; href: string; roles: AppRole[] }> = [
  { label: 'Dashboard', href: '/dashboard', roles: ['admin', 'medico', 'recepcao', 'enfermagem', 'financeiro'] },
  { label: 'Agenda', href: '/agenda', roles: ['admin', 'medico', 'recepcao', 'enfermagem'] },
  { label: 'Pacientes', href: '/pacientes', roles: ['admin', 'recepcao', 'enfermagem'] },
  { label: 'Fila e triagem', href: '/fila', roles: ['admin', 'medico', 'recepcao', 'enfermagem'] },
  { label: 'Tarefas', href: '/tarefas', roles: ['admin', 'medico', 'recepcao', 'enfermagem', 'financeiro'] },
  { label: 'Notificações', href: '/notificacoes', roles: ['admin', 'medico', 'recepcao', 'enfermagem', 'financeiro'] },
  { label: 'Documentos clínicos', href: '/documentos-clinicos', roles: ['admin', 'medico'] },
  { label: 'Exames', href: '/exames', roles: ['admin', 'medico', 'enfermagem'] },
  { label: 'Pagamentos', href: '/pagamentos', roles: ['admin', 'financeiro'] },
  { label: 'Financeiro', href: '/financeiro', roles: ['admin', 'financeiro'] },
  { label: 'Configurações', href: '/configuracoes', roles: ['admin'] },
];

export function GlobalSearch() {
  const [open, setOpen] = useState(false), [query, setQuery] = useState(''), [results, setResults] = useState<Result[]>([]);
  const [searching, setSearching] = useState(false), [error, setError] = useState(false);
  const { profile } = useSupabaseAuth();
  const navigate = useNavigate();
  const requestRef = useRef(0);
  const normalized = query.trim();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setOpen(value => !value); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const search = useCallback(async (term: string) => {
    const request = ++requestRef.current;
    if (term.length < 2) { setResults([]); setError(false); setSearching(false); return; }
    setSearching(true); setError(false);
    const { data, error: rpcError } = await (supabase as any).rpc('busca_global', { p_termo: term, p_limite: 5 });
    if (request !== requestRef.current) return;
    setSearching(false);
    if (rpcError) { setResults([]); setError(true); return; }
    setResults((data ?? []) as Result[]);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void search(normalized), 250);
    return () => window.clearTimeout(timer);
  }, [normalized, search]);

  const pages = useMemo(() => PAGES.filter(page => page.roles.some(role => profile?.roles.includes(role)))
    .filter(page => !normalized || page.label.toLocaleLowerCase('pt-BR').includes(normalized.toLocaleLowerCase('pt-BR')))
    .slice(0, normalized ? 6 : 5), [normalized, profile?.roles]);
  const grouped = useMemo(() => Object.entries(TYPE_META).map(([type, meta]) => ({ type: type as SearchType, ...meta, items: results.filter(item => item.tipo === type) })).filter(group => group.items.length), [results]);
  const select = (href: string) => { setOpen(false); setQuery(''); setResults([]); navigate(href); };
  const close = (value: boolean) => { setOpen(value); if (!value) { requestRef.current++; setQuery(''); setResults([]); setError(false); } };

  return <>
    <button type="button" onClick={() => setOpen(true)} className="group flex min-h-10 items-center gap-2 rounded-xl border border-border/50 bg-accent/30 px-3 text-sm text-muted-foreground transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:w-56 lg:w-72" aria-label="Abrir busca global, atalho Control K">
      <Search className="h-4 w-4 shrink-0" aria-hidden="true"/><span className="hidden flex-1 text-left sm:inline">Buscar no sistema...</span><kbd className="hidden rounded border px-1.5 font-mono text-[10px] sm:inline">Ctrl K</kbd>
    </button>
    <CommandDialog open={open} onOpenChange={close}>
      <CommandInput placeholder="Nome, CPF, telefone, exame, tarefa..." value={query} onValueChange={setQuery}/>
      <CommandList className="max-h-[min(65vh,32rem)]">
        {normalized.length === 1 && <p className="px-4 py-3 text-sm text-muted-foreground">Digite pelo menos 2 caracteres.</p>}
        {searching && <p className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground" role="status"><span className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent"/>Buscando com segurança...</p>}
        {error && <div className="flex items-center justify-between gap-3 px-4 py-3" role="alert"><span className="flex items-center gap-2 text-sm text-destructive"><AlertCircle className="h-4 w-4"/>Não foi possível buscar.</span><Button size="sm" variant="outline" onClick={() => void search(normalized)}>Tentar novamente</Button></div>}
        {!searching && !error && normalized.length >= 2 && !results.length && !pages.length && <CommandEmpty>Nenhum resultado encontrado nesta clínica.</CommandEmpty>}
        {grouped.map((group, index) => <div key={group.type}>{index > 0 && <CommandSeparator/>}<CommandGroup heading={group.label}>{group.items.map(item => { const Icon = group.icon; return <CommandItem key={`${item.tipo}-${item.id}`} value={`${item.tipo}-${item.id}-${item.titulo}`} onSelect={() => select(item.href)} className="gap-3 py-2.5"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10"><Icon className="h-4 w-4 text-primary"/></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{item.titulo}</span>{item.subtitulo && <span className="block truncate text-xs text-muted-foreground">{item.subtitulo}</span>}</span><Badge variant="secondary" className="hidden shrink-0 text-[10px] sm:inline-flex">{group.label.slice(0, -1)}</Badge></CommandItem>})}</CommandGroup></div>)}
        {pages.length > 0 && <><CommandSeparator/><CommandGroup heading="Páginas">{pages.map(page => <CommandItem key={page.href} value={`pagina-${page.label}`} onSelect={() => select(page.href)} className="gap-3"><Search className="h-4 w-4 text-muted-foreground"/><span>{page.label}</span></CommandItem>)}</CommandGroup></>}
      </CommandList>
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t px-3 py-2 text-[11px] text-muted-foreground"><span>↑↓ navegar</span><span>Enter abrir</span><span>Esc fechar</span><span className="ml-auto hidden sm:inline">Resultados limitados à sua clínica e função</span></div>
    </CommandDialog>
  </>;
}
