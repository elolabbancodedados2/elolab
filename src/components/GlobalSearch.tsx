import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Calendar, ClipboardList, FileText, FlaskConical, LayoutGrid, Search, Users, Wallet } from '@/components/icons/elolabIcons';
import { getFilteredMenuGroups } from '@/config/sidebarMenu';
import { useUserPlan } from '@/hooks/useSubscriptionPlan';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';
import { useSupabaseAuth, type AppRole } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { normalizarTexto } from '@/lib/buscaPaciente';

type SearchType = 'paciente' | 'consulta' | 'exame' | 'pagamento' | 'tarefa' | 'documento';
type Result = { tipo: SearchType; id: string; titulo: string; subtitulo: string | null; href: string; data_referencia: string | null };

const TYPE_META: Record<SearchType, { label: string; icon: typeof Users }> = {
  paciente: { label: 'Pacientes', icon: Users }, consulta: { label: 'Consultas', icon: Calendar },
  exame: { label: 'Exames', icon: FlaskConical }, pagamento: { label: 'Pagamentos', icon: Wallet },
  tarefa: { label: 'Tarefas', icon: ClipboardList }, documento: { label: 'Documentos', icon: FileText },
};

export function GlobalSearch() {
  const [open, setOpen] = useState(false), [query, setQuery] = useState(''), [results, setResults] = useState<Result[]>([]);
  const [searching, setSearching] = useState(false), [error, setError] = useState(false);
  const { profile, isAdmin, isSuperAdmin } = useSupabaseAuth();
  const { hasFeature, isLoading: planLoading, isError: planError } = useUserPlan();
  const navigate = useNavigate();
  const requestRef = useRef(0);
  const normalized = query.trim();
  const normalizedSearch = normalizarTexto(normalized);

  // Único atalho Ctrl/Cmd+K do app: abre e fecha a busca global.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && (event.code === 'KeyK' || event.key?.toLowerCase() === 'k')) { event.preventDefault(); setOpen(value => !value); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const search = useCallback(async (term: string) => {
    const request = ++requestRef.current;
    if (term.length < 2) { setResults([]); setError(false); setSearching(false); return; }
    setSearching(true); setError(false);
    try {
      const { data, error: rpcError } = await supabase.rpc('busca_global', { p_termo: term, p_limite: 5 });
      if (request !== requestRef.current) return;
      if (rpcError) throw rpcError;
      setResults((data ?? []) as Result[]);
      setError(false);
    } catch {
      if (request !== requestRef.current) return;
      setResults([]);
      setError(true);
    } finally {
      if (request === requestRef.current) setSearching(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void search(normalized), 250);
    return () => window.clearTimeout(timer);
  }, [normalized, search]);

  // Módulos vêm do mesmo filtro de perfil e plano do menu lateral.
  const modules = useMemo(() => {
    const hasPlanFeature = (feature?: string) => !feature || (!planLoading && !planError && hasFeature(feature));
    return getFilteredMenuGroups(profile?.roles ?? [], isAdmin(), isSuperAdmin, !!profile?.clinica_id, 'app')
      .filter(group => hasPlanFeature(group.planFeature))
      .flatMap(group => group.items.filter(item => !item.external && hasPlanFeature(item.planFeature)).map(item => ({ label: item.label, href: item.href, group: group.label })))
      // Destinos pessoais ficam no menu da conta, fora da barra lateral.
      .concat(profile?.roles?.length ? [{ label: 'Minhas notificações', href: '/notificacoes', group: 'Minha conta' }, { label: 'Minhas preferências', href: '/preferencias', group: 'Minha conta' }] : []);
  }, [profile?.roles, profile?.clinica_id, isAdmin, isSuperAdmin, planLoading, planError, hasFeature]);
  const pages = useMemo(() => modules
    .filter(page => !normalizedSearch || normalizarTexto(`${page.label} ${page.group}`).includes(normalizedSearch))
    .slice(0, normalizedSearch ? 6 : 5), [modules, normalizedSearch]);
  const grouped = useMemo(() => Object.entries(TYPE_META).map(([type, meta]) => ({ type: type as SearchType, ...meta, items: results.filter(item => item.tipo === type) })).filter(group => group.items.length), [results]);
  const select = (href: string) => { setOpen(false); setQuery(''); setResults([]); navigate(href); };
  const close = (value: boolean) => { setOpen(value); if (!value) { requestRef.current++; setQuery(''); setResults([]); setError(false); } };

  return <>
    <button type="button" onClick={() => setOpen(true)} className="group flex min-h-11 min-w-0 w-full items-center gap-2 rounded-lg border border-border bg-secondary px-3 text-sm text-muted-foreground transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Abrir busca global, atalho Control K">
      <Search className="h-4 w-4 shrink-0" aria-hidden="true"/><span className="hidden min-w-0 flex-1 truncate text-left text-xs min-[360px]:inline sm:hidden">Buscar</span><span className="hidden min-w-0 flex-1 truncate text-left sm:inline">Buscar no sistema...</span><kbd className="hidden shrink-0 rounded border px-1.5 font-mono text-[10px] sm:inline">Ctrl K</kbd>
    </button>
    <CommandDialog open={open} onOpenChange={close} title="Busca global" shouldFilter={false}>
      <CommandInput placeholder="Nome, CPF, telefone, exame, tarefa..." value={query} onValueChange={setQuery}/>
      <CommandList className="max-h-[min(65vh,32rem)]">
        {normalized.length === 1 && <p className="px-4 py-3 text-sm text-muted-foreground">Digite pelo menos 2 caracteres.</p>}
        {searching && <p className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground" role="status"><span className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent"/>Buscando com segurança...</p>}
        {error && <div className="flex items-center justify-between gap-3 px-4 py-3" role="alert"><span className="flex items-center gap-2 text-sm text-destructive"><AlertCircle className="h-4 w-4"/>Não foi possível buscar.</span><Button size="sm" variant="outline" onClick={() => void search(normalized)}>Tentar novamente</Button></div>}
        {!searching && !error && normalized.length >= 2 && !results.length && !pages.length && <CommandEmpty>Nenhum resultado encontrado nesta clínica.</CommandEmpty>}
        {grouped.map((group, index) => <div key={group.type}>{index > 0 && <CommandSeparator/>}<CommandGroup heading={group.label}>{group.items.map(item => { const Icon = group.icon; return <CommandItem key={`${item.tipo}-${item.id}`} value={`${item.tipo}-${item.id}-${item.titulo}`} onSelect={() => select(item.href)} className="gap-3 py-2.5"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10"><Icon className="h-4 w-4 text-primary"/></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{item.titulo}</span>{item.subtitulo && <span className="block truncate text-xs text-muted-foreground">{item.subtitulo}</span>}</span><Badge variant="secondary" className="hidden shrink-0 text-[10px] sm:inline-flex">{group.label.slice(0, -1)}</Badge></CommandItem>})}</CommandGroup></div>)}
        {pages.length > 0 && <><CommandSeparator/><CommandGroup heading="Módulos">{pages.map(page => <CommandItem key={page.href} value={`modulo-${normalizarTexto(page.label)}-${page.href}`} onSelect={() => select(page.href)} className="gap-3"><LayoutGrid className="h-4 w-4 text-muted-foreground" aria-hidden="true"/><span className="min-w-0 flex-1"><span className="block truncate text-sm">{page.label}</span><span className="block truncate text-xs text-muted-foreground">{page.group}</span></span><Badge variant="secondary" className="shrink-0 text-[10px]">Módulo</Badge></CommandItem>)}</CommandGroup></>}
      </CommandList>
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t px-3 py-2 text-[11px] text-muted-foreground"><span>↑↓ navegar</span><span>Enter abrir</span><span>Esc fechar</span><span className="ml-auto hidden sm:inline">Resultados limitados à sua clínica e função</span></div>
    </CommandDialog>
  </>;
}
