import {
  LayoutDashboard,
  Users,
  CalendarRange,
  ClipboardCheck,
  Shield,
  CircleDollarSign,
  HandCoins,
  PackageSearch,
  Settings2,
  Stethoscope,
  CreditCard,
  WalletCards,
  Building2,
  UserCog,
  FlaskConical,
  DoorOpen,
  MessageCircle,
  FolderKanban,
  Sparkles,
  BotMessageSquare,
  ActivitySquare,
  ListChecks,
  TestTubes,
  BookMarked,
  LucideIcon,
  MonitorSmartphone,
  MapPinned,
  BadgeDollarSign,
  Microscope,
  ScrollText,
  PiggyBank,
  FileBarChart,
  Gauge,
  CalendarCheck,
  UsersRound,
  FileText,
  Bell,
  MessageSquarePlus,
} from 'lucide-react';
import { AppRole } from '@/contexts/SupabaseAuthContext';

export interface MenuItem {
  label: string;
  icon: LucideIcon;
  href: string;
  /** Contador (número) ou etiqueta curta (ex.: "Em breve"). */
  badge?: number | string;
  roles?: AppRole[];
  external?: boolean;
  /** Exige correspondência exata para rotas que têm subpáginas próprias. */
  exact?: boolean;
  superAdminOnly?: boolean;
}

export interface MenuGroup {
  label: string;
  icon: LucideIcon;
  color: string;
  items: MenuItem[];
  roles?: AppRole[];
  superAdminOnly?: boolean;
}

export type NavigationMode = 'app' | 'platform';

/** Define o modo ativo pela rota; /feedback é compartilhada, mas seu conteúdo
 * administrativo pertence ao Painel Admin apenas para a conta da plataforma.
 */
export function getNavigationMode(pathname: string, isPlatformAdmin: boolean): NavigationMode {
  if (!isPlatformAdmin) return 'app';

  const platformPaths = ['/painel-admin', '/usuarios', '/documentacao', '/feedback'];
  return platformPaths.includes(pathname) || pathname === '/admin' || pathname.startsWith('/admin/')
    ? 'platform'
    : 'app';
}

export const menuGroups: MenuGroup[] = [
  {
    label: 'Início',
    icon: Gauge,
    color: '#6366f1',
    items: [
      // Preferências, histórico, indicadores, feedback e segurança
      // da conta ficam no menu do avatar (Navbar): são da pessoa, não do fluxo
      // de trabalho, e lotavam o grupo com 11 itens.
      { label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
      { label: 'Central de notificações', icon: Bell, href: '/notificacoes' },
      { label: 'Chat Interno', icon: MessageCircle, href: '/chat' },
      { label: 'Primeiros passos', icon: ListChecks, href: '/onboarding', roles: ['admin'] },
      { label: 'Tarefas', icon: ListChecks, href: '/tarefas', roles: ['admin', 'recepcao', 'enfermagem', 'financeiro', 'medico'] },
    ],
  },
  {
    label: 'Atendimento',
    icon: MonitorSmartphone,
    color: '#0ea5e9',
    roles: ['admin', 'recepcao', 'enfermagem', 'medico', 'financeiro'],
    items: [
      { label: 'Agenda', icon: CalendarRange, href: '/agenda' },
      { label: 'Recepção & Caixa', icon: MonitorSmartphone, href: '/recepcao', roles: ['admin', 'recepcao', 'financeiro'] },
      { label: 'Fila e triagem', icon: ClipboardCheck, href: '/fila', roles: ['admin', 'recepcao', 'enfermagem', 'medico'] },
      { label: 'Risco de faltas', icon: ActivitySquare, href: '/analise-preditiva', roles: ['admin', 'recepcao'] },
      { label: 'Salas e lista de espera', icon: DoorOpen, href: '/gestao-fluxo', roles: ['admin', 'recepcao'] },
    ],
  },
  {
    label: 'Pacientes',
    icon: Users,
    color: '#10b981',
    roles: ['admin', 'recepcao', 'enfermagem', 'medico'],
    items: [
      { label: 'Cadastro', icon: Users, href: '/pacientes', roles: ['admin', 'recepcao', 'enfermagem'] },
      { label: 'Retornos', icon: CalendarCheck, href: '/retornos', roles: ['admin', 'medico', 'recepcao'] },
      { label: 'Convênios', icon: Building2, href: '/convenios', roles: ['admin', 'recepcao'] },
    ],
  },
  {
    label: 'Clínica',
    icon: Stethoscope,
    color: '#8b5cf6',
    roles: ['admin', 'medico', 'enfermagem'],
    items: [
      { label: 'Prontuários', icon: ScrollText, href: '/prontuarios', roles: ['admin', 'medico'] },
      { label: 'Prescrições e documentos', icon: BookMarked, href: '/documentos-clinicos', roles: ['admin', 'medico'] },
      { label: 'Sinais vitais', icon: ActivitySquare, href: '/vitais-graficos', roles: ['admin', 'medico', 'enfermagem'] },
      { label: 'Exames', icon: Microscope, href: '/exames', roles: ['admin', 'medico', 'enfermagem'] },
      { label: 'Templates clínicos', icon: FolderKanban, href: '/todos-templates', roles: ['admin', 'medico'] },
    ],
  },
  {
    label: 'Integrações',
    icon: FileText,
    color: '#7c3aed',
    roles: ['admin', 'medico'],
    items: [
      { label: 'Interoperabilidade FHIR', icon: FileText, href: '/interoperabilidade', roles: ['admin', 'medico'] },
    ],
  },
  {
    label: 'Laboratório',
    icon: TestTubes,
    color: '#06b6d4',
    // `recepcao` incluído para que Guias Externas apareça: a rota de
    // /guias-externas já libera recepção, mas o grupo derrubava o item.
    roles: ['admin', 'medico', 'enfermagem', 'recepcao'],
    items: [
      // Sem `roles` o item vale para todos os papéis do grupo. Como /laboratorio
      // NÃO libera recepção, deixar implícito faria o item aparecer e negar no
      // clique — o defeito que esta revisão foi corrigir.
      { label: 'Painel do laboratório', icon: FlaskConical, href: '/laboratorio', roles: ['admin', 'medico', 'enfermagem'] },
      { label: 'Mapa de Coleta', icon: MapPinned, href: '/mapa-coleta', roles: ['admin', 'enfermagem'] },
      { label: 'Guias Externas', icon: FileText, href: '/guias-externas', roles: ['admin', 'recepcao', 'enfermagem'] },
      { label: 'Laudos', icon: ScrollText, href: '/laudos-lab', roles: ['admin', 'medico', 'enfermagem'] },
    ],
  },
  {
    label: 'Financeiro',
    icon: WalletCards,
    color: '#f59e0b',
    roles: ['admin', 'financeiro'],
    items: [
      { label: 'Visão financeira', icon: CircleDollarSign, href: '/financeiro' },
      { label: 'Contas', icon: BadgeDollarSign, href: '/contas' },
      { label: 'Fluxo de Caixa', icon: PiggyBank, href: '/fluxo-caixa' },
      { label: 'TISS & Glosas', icon: FileText, href: '/faturamento-convenios' },
      { label: 'Repasses Médicos', icon: HandCoins, href: '/repasses-medicos' },
      { label: 'Preços & Serviços', icon: CircleDollarSign, href: '/precos-servicos' },
      { label: 'Cobrança Inadimplentes', icon: BadgeDollarSign, href: '/cobranca-inadimplentes' },
    ],
  },
  {
    label: 'Relatórios e indicadores',
    icon: FileBarChart,
    color: '#0891b2',
    roles: ['admin', 'financeiro'],
    items: [
      { label: 'Relatórios', icon: FileBarChart, href: '/relatorios', exact: true, roles: ['admin', 'financeiro'] },
      { label: 'Relatórios salvos', icon: FileBarChart, href: '/relatorios/salvos', roles: ['admin', 'financeiro'] },
      { label: 'Indicadores da clínica', icon: ActivitySquare, href: '/analytics', roles: ['admin'] },
    ],
  },
  {
    label: 'Equipe',
    icon: UsersRound,
    color: '#ec4899',
    roles: ['admin'],
    items: [
      { label: 'Médicos, funcionários e convites', icon: UsersRound, href: '/equipe', roles: ['admin'] },
    ],
  },
  {
    label: 'Suprimentos',
    icon: PackageSearch,
    color: '#ea580c',
    roles: ['admin', 'enfermagem'],
    items: [
      { label: 'Estoque', icon: PackageSearch, href: '/estoque', roles: ['admin', 'enfermagem'] },
    ],
  },
  {
    label: 'Automação e IA',
    icon: Sparkles,
    color: '#db2777',
    roles: ['admin'],
    items: [
      { label: 'Automações', icon: Sparkles, href: '/automacoes', roles: ['admin'] },
      { label: 'Agente IA', icon: BotMessageSquare, href: '/agente-ia', roles: ['admin'] },
    ],
  },
  {
    label: 'Configurações',
    icon: Settings2,
    color: '#64748b',
    roles: ['admin'],
    items: [
      { label: 'Configurações', icon: Settings2, href: '/configuracoes' },
      { label: 'Configurações Avançadas', icon: Gauge, href: '/configuracoes-avancadas' },
      { label: 'Alterar plano', icon: CreditCard, href: '/planos', roles: ['admin'] },
      { label: 'Acesso assistido pelo suporte', icon: Shield, href: '/acesso-assistido', roles: ['admin'] },
      { label: 'Solicitações LGPD de pacientes', icon: ScrollText, href: '/lgpd-pacientes' },
    ],
  },
  {
    label: 'Ajuda',
    icon: MessageCircle,
    color: '#14b8a6',
    items: [
      { label: 'Treinamento', icon: BookMarked, href: '/treinamento' },
      { label: 'Falar com o Suporte', icon: MessageCircle, href: '/suporte', roles: ['admin', 'recepcao', 'enfermagem', 'medico', 'financeiro'] },
    ],
  },
  {
    label: 'Painel da plataforma',
    icon: Gauge,
    color: '#6366f1',
    roles: ['admin'],
    superAdminOnly: true,
    items: [
      { label: 'Visão geral', icon: LayoutDashboard, href: '/painel-admin', exact: true, superAdminOnly: true },
      { label: 'Saúde do serviço', icon: ActivitySquare, href: '/admin/saude', superAdminOnly: true },
      { label: 'Incidentes', icon: ActivitySquare, href: '/admin/incidentes', superAdminOnly: true },
    ],
  },
  {
    label: 'Clientes',
    icon: Building2,
    color: '#0ea5e9',
    roles: ['admin'],
    superAdminOnly: true,
    items: [
      { label: 'Carteira de clientes', icon: Building2, href: '/admin/crm', superAdminOnly: true },
      { label: 'Clínicas', icon: Building2, href: '/admin/clinicas', superAdminOnly: true },
      { label: 'Contas e acessos', icon: Users, href: '/usuarios', superAdminOnly: true },
      { label: 'Entrada de clientes', icon: ListChecks, href: '/admin/onboarding', superAdminOnly: true },
      { label: 'Atendimento', icon: MessageCircle, href: '/admin/suporte', superAdminOnly: true },
      { label: 'Acesso assistido', icon: Shield, href: '/admin/acesso-assistido', superAdminOnly: true },
    ],
  },
  {
    label: 'Receita',
    icon: CreditCard,
    color: '#16a34a',
    roles: ['admin'],
    superAdminOnly: true,
    items: [
      { label: 'Cobranças e assinaturas', icon: CreditCard, href: '/admin/cobrancas', superAdminOnly: true },
      { label: 'Resumo do negócio', icon: FileBarChart, href: '/admin/relatorio-executivo', superAdminOnly: true },
      { label: 'Histórico financeiro', icon: PiggyBank, href: '/admin/historico-financeiro', superAdminOnly: true },
    ],
  },
  {
    label: 'Produto e comunicação',
    icon: MessageSquarePlus,
    color: '#db2777',
    roles: ['admin'],
    superAdminOnly: true,
    items: [
      { label: 'Comunicados aos clientes', icon: MessageCircle, href: '/admin/comunicacao', superAdminOnly: true },
      { label: 'Opiniões dos clientes', icon: MessageSquarePlus, href: '/feedback', superAdminOnly: true },
      { label: 'Documentação e ajuda', icon: BookMarked, href: '/documentacao', superAdminOnly: true },
      { label: 'Configuração da IA', icon: BotMessageSquare, href: '/admin/ia', superAdminOnly: true },
    ],
  },
  {
    label: 'Controles da plataforma',
    icon: Shield,
    color: '#64748b',
    roles: ['admin'],
    superAdminOnly: true,
    items: [
      { label: 'Segurança e privacidade', icon: Shield, href: '/admin/seguranca', superAdminOnly: true },
      { label: 'Solicitações de privacidade', icon: ScrollText, href: '/admin/lgpd', superAdminOnly: true },
      { label: 'Integrações de clientes', icon: Settings2, href: '/admin/integracoes', superAdminOnly: true },
      { label: 'Operação do serviço', icon: Gauge, href: '/admin/operacoes', superAdminOnly: true },
      { label: 'Relatórios agendados', icon: FileBarChart, href: '/admin/relatorios-agendados', superAdminOnly: true },
    ],
  },
];

/**
 * Filter menu groups based on user roles and superadmin status
 */
export function getFilteredMenuGroups(
  userRoles: AppRole[],
  isAdmin: boolean,
  isSuperAdmin = false,
  /**
   * O dono da plataforma não pertence a clínica alguma: ele administra o
   * produto, não atende paciente. Sem clínica, as telas de Agenda, Pacientes e
   * Prontuários abririam vazias — ruído, não recurso.
   *
   * Ao entrar numa clínica pela impersonação, o perfil recebe aquela clinica_id
   * e as telas voltam, porque aí elas têm dado para mostrar.
   */
  temClinica = true,
  mode?: NavigationMode
): MenuGroup[] {
  const soPlataforma = isSuperAdmin && !temClinica;
  const modoExplicito = mode;

  return menuGroups
    .filter((group) => {
      if (modoExplicito === 'platform') return !!group.superAdminOnly;
      if (modoExplicito === 'app') return !group.superAdminOnly;
      return soPlataforma ? !!group.superAdminOnly : true;
    })
    .filter((group) => {
      if (group.superAdminOnly && !isSuperAdmin) return false;
      if (isAdmin || isSuperAdmin) return true;
      if (!group.roles || group.roles.length === 0) return true;
      return group.roles.some((role) => userRoles.includes(role));
    })
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (item.superAdminOnly && !isSuperAdmin) return false;
        if (isAdmin || isSuperAdmin) return true;
        if (!item.roles || item.roles.length === 0) return true;
        return item.roles.some((role) => userRoles.includes(role));
      }),
    }))
    .filter((group) => group.items.length > 0);
}
