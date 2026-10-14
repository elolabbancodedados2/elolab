// Arquivo TEMPORÁRIO apenas para conferir o redesign sem backend. Não faz parte do app.
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { Users, Calendar, FileText, Search } from 'lucide-react';
import './index.css';
import logo from '@/assets/elolab-logo-identidade-dark.png';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SidebarNavItem } from '@/components/layout/SidebarNavItem';
import { menuGroups } from '@/config/sidebarMenu';
import { AdminDashboardOverview } from '@/components/dashboard/AdminDashboardOverview';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const screen = new URLSearchParams(location.search).get('tela') || 'inicio';

function Shell({ children, active }: { children: React.ReactNode; active: string }) {
  const grupos = menuGroups.slice(0, 6);
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="flex w-[286px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        <div className="flex h-[76px] items-center px-5"><img src={logo} alt="EloLab" className="w-[168px]" /></div>
        <div className="px-4 pb-4"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sidebar-foreground/50" /><Input placeholder="Buscar no menu" className="h-10 rounded-full border-white/10 bg-white/5 pl-10 text-white placeholder:text-sidebar-foreground/50" /></div></div>
        <nav className="flex-1 space-y-3 px-3">
          {grupos.map(g => (
            <div key={g.label}>
              <p className="px-3 py-2 text-[10.5px] font-bold uppercase tracking-[0.12em] text-sidebar-foreground/55">{g.label}</p>
              {g.items.slice(0, 4).map(item => <SidebarNavItem key={item.href} item={item} collapsed={false} groupColor={g.color} />)}
            </div>
          ))}
        </nav>
      </aside>
      <div className="flex-1">
        <header className="flex h-[72px] items-center gap-2 px-8">
          <div className="flex h-11 w-96 items-center gap-2 rounded-full border border-border/70 bg-card px-4 text-sm text-muted-foreground shadow-xs"><Search className="h-4 w-4" />Buscar paciente, CPF, exame… <kbd className="ml-auto rounded border px-1.5 text-[10px]">Ctrl K</kbd></div>
          <div className="flex-1" />
          <Button className="h-10">+ Novo</Button>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[image:var(--gradient-primary)] text-xs font-bold text-white shadow-glow">AL</div>
        </header>
        <main className="mx-auto max-w-[1600px] px-8 pb-10 pt-2" data-active={active}>{children}</main>
      </div>
    </div>
  );
}

function Inicio() {
  return (
    <AdminDashboardOverview
      nome="Ana" saudacao="Bom dia" dataLabel="terça-feira, 13 de outubro" horarioLabel="09:18"
      metricas={{ consultas: 14, fila: 3, finalizadas: 5, receita: 'R$ 2.890,00' }}
      agenda={[
        { id: '1', horario: '09:30', paciente: 'Rita Costa', tipo: 'Retorno', status: 'Triada' },
        { id: '2', horario: '10:00', paciente: 'Lucas Almeida', tipo: 'Primeira consulta', status: 'Confirmado' },
        { id: '3', horario: '10:30', paciente: 'Paula Reis', tipo: 'Retorno', status: 'Agendado' },
        { id: '4', horario: '11:00', paciente: 'Carlos Farias', tipo: 'Exame', status: 'Confirmado' },
      ]}
      alertas={[
        { id: 'fila', titulo: 'Pacientes na fila', detalhe: '3 aguardando atendimento', href: '/fila', tom: 'attention' },
        { id: 'financeiro', titulo: 'Valores em atraso', detalhe: 'R$ 1.240,00 em aberto', href: '/cobranca-inadimplentes', tom: 'attention' },
        { id: 'estoque', titulo: 'Estoque baixo', detalhe: '2 itens precisam de reposição', href: '/estoque', tom: 'info' },
      ]}
      desempenho={{ percentual: 36, descricao: '5 de 14 consultas finalizadas hoje' }}
      fluxoFinanceiro={[
        { name: 'mai', receitas: 31000, despesas: 18000 }, { name: 'jun', receitas: 35000, despesas: 19000 },
        { name: 'jul', receitas: 33000, despesas: 21000 }, { name: 'ago', receitas: 41000, despesas: 22000 },
        { name: 'set', receitas: 43000, despesas: 20000 }, { name: 'out', receitas: 48200, despesas: 23000 },
      ]}
      acoes={[{ label: 'Agendar consulta', href: '/agenda', icon: 'calendar' }, { label: 'Novo paciente', href: '/pacientes', icon: 'patient' }, { label: 'Abrir fila', href: '/fila', icon: 'queue' }, { label: 'Prontuários', href: '/prontuarios', icon: 'document' }]}
    />
  );
}

function Pacientes() {
  const rows = [
    ['Rita Costa', '123.456.789-00', 'Unimed', '11/09/2026', 'Em dia'],
    ['João Pereira', '987.654.321-00', 'Particular', '02/10/2026', 'Em atendimento'],
    ['Mariana Souza', '456.789.123-00', 'Bradesco Saúde', '13/10/2026', 'Em dia'],
    ['Carlos Farias', '741.852.963-00', 'Unimed', '14/03/2026', 'Sem retorno há 7 meses'],
  ];
  return (
    <div className="space-y-5">
      <PageHeader title="Pacientes" description="Cadastro, histórico e acompanhamento dos pacientes da clínica." icon={<Users />} actions={<><Button variant="outline">Exportar</Button><Button>+ Novo paciente</Button></>} />
      <Tabs defaultValue="todos"><TabsList><TabsTrigger value="todos">Todos</TabsTrigger><TabsTrigger value="hoje">Com consulta hoje</TabsTrigger><TabsTrigger value="sem">Sem retorno</TabsTrigger></TabsList></Tabs>
      <Card>
        <CardContent className="p-2">
          <Table>
            <TableHeader><TableRow><TableHead>Paciente</TableHead><TableHead>Convênio</TableHead><TableHead>Última consulta</TableHead><TableHead>Situação</TableHead></TableRow></TableHeader>
            <TableBody>{rows.map(r => <TableRow key={r[0]}><TableCell><p className="font-bold">{r[0]}</p><p className="text-xs text-muted-foreground">{r[1]}</p></TableCell><TableCell><Badge variant="outline">{r[2]}</Badge></TableCell><TableCell>{r[3]}</TableCell><TableCell><Badge variant={r[4] === 'Em dia' ? 'premium' : 'secondary'}>{r[4]}</Badge></TableCell></TableRow>)}</TableBody>
          </Table>
        </CardContent>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <EmptyState icon={FileText} title="Nenhum documento ainda" description="Os atestados, receitas e laudos emitidos para este paciente aparecem aqui." action={{ label: 'Emitir documento', onClick: () => undefined }} tips={['Use modelos prontos para ganhar tempo', 'Assine digitalmente com certificado ICP']} />
        <Card><CardHeader><CardTitle>Botões e selos</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2"><Button>Principal</Button><Button variant="outline">Contorno</Button><Button variant="secondary">Secundário</Button><Button variant="premium">Premium</Button><Badge>Novo</Badge><Badge variant="premium">Premium</Badge><Badge variant="outline">Unimed</Badge><Button variant="ghost"><Calendar />Agenda</Button></CardContent></Card>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <MemoryRouter initialEntries={[screen === 'pacientes' ? '/pacientes' : '/dashboard']}>
    <TooltipProvider>
      <Shell active={screen}>{screen === 'pacientes' ? <Pacientes /> : <Inicio />}</Shell>
    </TooltipProvider>
  </MemoryRouter>,
);
