import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import {
  Users, Calendar, FileText, DollarSign, Stethoscope, Package,
  LayoutDashboard, ClipboardList, BarChart3, Settings, FlaskConical,
  Wallet, Search, UserCheck, Bot, Zap, ListTodo, TestTube,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { parseDateOnly } from '@/lib/dateOnly';

const PAGES = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, group: 'Navegação' },
  { label: 'Recepção', href: '/recepcao', icon: UserCheck, group: 'Navegação' },
  { label: 'Agenda', href: '/agenda', icon: Calendar, group: 'Navegação' },
  { label: 'Pacientes', href: '/pacientes', icon: Users, group: 'Navegação' },
  { label: 'Fila / Triagem', href: '/fila', icon: ClipboardList, group: 'Navegação' },
  { label: 'Caixa Diário', href: '/caixa', icon: DollarSign, group: 'Navegação' },
  { label: 'Tarefas', href: '/tarefas', icon: ListTodo, group: 'Navegação' },
  { label: 'Prontuários', href: '/prontuarios', icon: FileText, group: 'Clínica' },
  { label: 'Prescrições', href: '/prescricoes', icon: FileText, group: 'Clínica' },
  { label: 'Atestados', href: '/atestados', icon: FileText, group: 'Clínica' },
  { label: 'Encaminhamentos', href: '/encaminhamentos', icon: FileText, group: 'Clínica' },
  { label: 'Exames', href: '/exames', icon: FlaskConical, group: 'Clínica' },
  { label: 'Triagem', href: '/triagem', icon: Stethoscope, group: 'Clínica' },
  { label: 'Retornos', href: '/retornos', icon: Calendar, group: 'Clínica' },
  { label: 'Médicos', href: '/medicos', icon: Stethoscope, group: 'Operacional' },
  { label: 'Funcionários', href: '/funcionarios', icon: UserCheck, group: 'Operacional' },
  { label: 'Salas', href: '/salas', icon: Package, group: 'Operacional' },
  { label: 'Estoque', href: '/estoque', icon: Package, group: 'Operacional' },
  { label: 'Convênios', href: '/convenios', icon: DollarSign, group: 'Operacional' },
  { label: 'Templates', href: '/templates', icon: FileText, group: 'Operacional' },
  { label: 'Lista de Espera', href: '/lista-espera', icon: ClipboardList, group: 'Operacional' },
  { label: 'Laboratório', href: '/laboratorio', icon: TestTube, group: 'Laboratório' },
  { label: 'Mapa de Coleta', href: '/mapa-coleta', icon: TestTube, group: 'Laboratório' },
  { label: 'Laudos', href: '/laudos-lab', icon: FileText, group: 'Laboratório' },
  { label: 'Financeiro', href: '/financeiro', icon: DollarSign, group: 'Financeiro' },
  { label: 'Contas a Receber', href: '/contas-receber', icon: Wallet, group: 'Financeiro' },
  { label: 'Contas a Pagar', href: '/contas-pagar', icon: Wallet, group: 'Financeiro' },
  { label: 'Fluxo de Caixa', href: '/fluxo-caixa', icon: Wallet, group: 'Financeiro' },
  { label: 'Tabela de Preços', href: '/precos-exames', icon: DollarSign, group: 'Financeiro' },
  { label: 'Tipos de Consulta', href: '/tipos-consulta', icon: Stethoscope, group: 'Financeiro' },
  { label: 'Relatórios', href: '/relatorios', icon: BarChart3, group: 'Financeiro' },
  { label: 'Painel Admin', href: '/painel-admin', icon: Settings, group: 'Admin' },
  { label: 'Analytics', href: '/analytics', icon: BarChart3, group: 'Admin' },
  { label: 'Agente IA', href: '/agente-ia', icon: Bot, group: 'Admin' },
  { label: 'Automações', href: '/automacoes', icon: Zap, group: 'Admin' },
  { label: 'Planos', href: '/planos', icon: DollarSign, group: 'Admin' },
  { label: 'Documentação', href: '/documentacao', icon: FileText, group: 'Admin' },
  { label: 'Configurações', href: '/configuracoes', icon: Settings, group: 'Admin' },
];

interface PacienteResult {
  id: string;
  nome: string;
  cpf: string | null;
  data_nascimento: string | null;
  telefone: string | null;
}

interface MedicoResult {
  id: string;
  crm: string;
  especialidade: string | null;
  telefone: string | null;
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [pacientes, setPacientes] = useState<PacienteResult[]>([]);
  const [medicos, setMedicos] = useState<MedicoResult[]>([]);
  const [searching, setSearching] = useState(false);
  const navigate = useNavigate();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const searchSupabase = useCallback(async (q: string) => {
    if (!q.trim() || q.length < 2) {
      setPacientes([]);
      setMedicos([]);
      return;
    }
    setSearching(true);
    try {
      const [pacResult, medResult] = await Promise.all([
        supabase
          .from('pacientes')
          .select('id, nome, cpf, data_nascimento, telefone')
          .or(`nome.ilike.%${q}%,cpf.ilike.%${q}%`)
          .limit(5),
        supabase
          .from('medicos')
          .select('id, crm, especialidade, telefone')
          .or(`crm.ilike.%${q}%,especialidade.ilike.%${q}%`)
          .limit(3),
      ]);
      setPacientes((pacResult.data ?? []) as PacienteResult[]);
      setMedicos((medResult.data ?? []) as MedicoResult[]);
    } catch {
      // silently fail
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchSupabase(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, searchSupabase]);

  const handleSelect = (href: string) => {
    setOpen(false);
    setQuery('');
    navigate(href);
  };

  const filteredPages = query.trim().length > 0
    ? PAGES.filter(p => p.label.toLowerCase().includes(query.toLowerCase()))
    : PAGES.slice(0, 8);

  const showResults = query.trim().length >= 2;
  const hasAnyResult = filteredPages.length > 0 || pacientes.length > 0 || medicos.length > 0;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="group flex items-center gap-2.5 rounded-xl border border-border/50 bg-accent/30 px-3.5 py-2 text-sm text-muted-foreground/70 transition-all duration-200 hover:bg-accent/60 hover:text-muted-foreground hover:border-border/80 focus:outline-none focus:ring-2 focus:ring-ring md:w-56 lg:w-72"
        aria-label="Abrir busca global (⌘K)"
      >
        <Search className="h-4 w-4 shrink-0 opacity-50 group-hover:opacity-80 transition-opacity" />
        <span className="hidden sm:inline flex-1 text-left text-[13px]">Buscar...</span>
        <kbd className="hidden sm:inline-flex h-5 select-none items-center gap-1 rounded-md border border-border/50 bg-muted/50 px-1.5 font-mono text-[10px] font-medium opacity-50 group-hover:opacity-80 transition-opacity">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setQuery(''); }}>
        <CommandInput
          placeholder="Buscar pacientes, médicos, páginas..."
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {searching && (
            <div className="py-3 px-4 text-sm text-muted-foreground flex items-center gap-2">
              <div className="h-3 w-3 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              Buscando...
            </div>
          )}
          {!hasAnyResult && !searching && <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>}

          {showResults && pacientes.length > 0 && (
            <CommandGroup heading="Pacientes">
              {pacientes.map((p) => (
                <CommandItem
                  key={p.id}
                  value={`paciente-${p.id}-${p.nome}`}
                  onSelect={() => handleSelect('/pacientes')}
                  className="flex items-center gap-3 py-2.5 rounded-lg"
                >
                  <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Users className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{p.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.cpf ? `CPF: ${p.cpf}` : ''}
                      {p.data_nascimento ? ` · ${format(parseDateOnly(p.data_nascimento)!, 'dd/MM/yyyy', { locale: ptBR })}` : ''}
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-[10px] shrink-0 rounded-lg">Paciente</Badge>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {showResults && pacientes.length > 0 && medicos.length > 0 && <CommandSeparator />}

          {showResults && medicos.length > 0 && (
            <CommandGroup heading="Médicos">
              {medicos.map((m) => (
                <CommandItem
                  key={m.id}
                  value={`medico-${m.id}-${m.crm}`}
                  onSelect={() => handleSelect('/medicos')}
                  className="flex items-center gap-3 py-2.5 rounded-lg"
                >
                  <div className="h-8 w-8 rounded-xl bg-info/10 flex items-center justify-center shrink-0">
                    <Stethoscope className="h-4 w-4 text-info" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">CRM: {m.crm}</p>
                    <p className="text-xs text-muted-foreground">{m.especialidade ?? 'Sem especialidade'}</p>
                  </div>
                  <Badge variant="secondary" className="text-[10px] shrink-0 rounded-lg">Médico</Badge>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {(showResults && (pacientes.length > 0 || medicos.length > 0)) && filteredPages.length > 0 && <CommandSeparator />}

          {filteredPages.length > 0 && (
            <CommandGroup heading="Páginas">
              {filteredPages.map((page) => {
                const Icon = page.icon;
                return (
                  <CommandItem
                    key={page.href}
                    value={`page-${page.href}-${page.label}`}
                    onSelect={() => handleSelect(page.href)}
                    className="flex items-center gap-3 py-2 rounded-lg"
                  >
                    <div className="h-7 w-7 rounded-lg bg-accent/60 flex items-center justify-center shrink-0">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <span className="flex-1 text-sm">{page.label}</span>
                    <span className="text-[10px] text-muted-foreground/50">{page.group}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}
        </CommandList>
        <div className="border-t border-border/40 px-3 py-2 flex items-center gap-3 text-[11px] text-muted-foreground/60">
          <span><kbd className="font-mono rounded border border-border/30 px-1">↑↓</kbd> navegar</span>
          <span><kbd className="font-mono rounded border border-border/30 px-1">↵</kbd> abrir</span>
          <span><kbd className="font-mono rounded border border-border/30 px-1">Esc</kbd> fechar</span>
        </div>
      </CommandDialog>
    </>
  );
}
