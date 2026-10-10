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
  planFeature?: string;
}

export interface MenuGroup {
  label: string;
  icon: LucideIcon;
  color: string;
  items: MenuItem[];
  roles?: AppRole[];
  superAdminOnly?: boolean;
  planFeature?: string;
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
    color: '#005ECC',
    items: [
      { label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
      { label: 'Tarefas', icon: ListChecks, href: '/tarefas', roles: ['admin', 'recepcao', 'enfermagem', 'financeiro', 'medico'] },
    ],
  },
  {
    label: 'Atendimento',
    icon: MonitorSmartphone,
    color: '#005ECC',
    roles: ['admin', 'recepcao', 'enfermagem', 'medico', 'financeiro'],
    items: [
      { label: 'Agenda', icon: CalendarRange, href: '/agenda' },
      { label: 'Recepção e caixa', icon: MonitorSmartphone, href: '/recepcao', roles: ['admin', 'recepcao', 'financeiro'] },
      { label: 'Fila e triagem', icon: ClipboardCheck, href: '/fila', roles: ['admin', 'recepcao', 'enfermagem', 'medico'] },
      { label: 'Salas e lista de espera', icon: DoorOpen, href: '/gestao-fluxo', roles: ['admin', 'recepcao'] },
      { label: 'Retornos', icon: CalendarCheck, href: '/retornos', roles: ['admin', 'medico', 'recepcao'] },
      { label: 'Risco de faltas', icon: ActivitySquare, href: '/analise-preditiva', roles: ['admin', 'recepcao'] },
    ],
  },
  {
    label: 'Pacientes',
    icon: Users,
    color: '#005ECC',
    roles: ['admin', 'recepcao', 'enfermagem', 'medico'],
    items: [
      { label: 'Cadastro e histórico', icon: Users, href: '/pacientes', roles: ['admin', 'recepcao', 'enfermagem'] },
      { label: 'Convênios', icon: Building2, href: '/convenios', roles: ['admin', 'recepcao'] },
      { label: 'Acesso ao portal do paciente', icon: UsersRound, href: '/portal-pacientes', roles: ['admin'] },
    ],
  },
  {
    label: 'Clínica',
    icon: Stethoscope,
    color: '#005ECC',
    roles: ['admin', 'medico', 'enfermagem'],
    items: [
      { label: 'Prontuários', icon: ScrollText, href: '/prontuarios', roles: ['admin', 'medico'] },
      { label: 'Prescrições e documentos', icon: BookMarked, href: '/documentos-clinicos', roles: ['admin', 'medico'] },
      { label: 'Sinais vitais', icon: ActivitySquare, href: '/vitais-graficos', roles: ['admin', 'medico', 'enfermagem'] },
      { label: 'Exames', icon: Microscope, href: '/exames', roles: ['admin', 'medico', 'enfermagem'], planFeature: 'exames' },
      { label: 'Modelos clínicos', icon: FolderKanban, href: '/todos-templates', roles: ['admin', 'medico'] },
      { label: 'Encaminhamentos', icon: Stethoscope, href: '/documentos-clinicos?tab=encaminhamentos', roles: ['admin', 'medico'] },
    ],
  },
  {
    label: 'Laboratório',
    icon: TestTubes,
    color: '#005ECC',
    roles: ['admin', 'medico', 'enfermagem', 'recepcao'],
    planFeature: 'exames',
    items: [
      { label: 'Painel do laboratório', icon: FlaskConical, href: '/laboratorio', roles: ['admin', 'medico', 'enfermagem'] },
      { label: 'Mapa de coleta', icon: MapPinned, href: '/mapa-coleta', roles: ['admin', 'enfermagem'] },
      { label: 'Guias externas', icon: FileText, href: '/guias-externas', roles: ['admin', 'recepcao', 'enfermagem'] },
      { label: 'Laudos', icon: ScrollText, href: '/laudos-lab', roles: ['admin', 'medico', 'enfermagem'] },
    ],
  },
  {
    label: 'Financeiro',
    icon: WalletCards,
    color: '#005ECC',
    roles: ['admin', 'financeiro'],
    items: [
      { label: 'Visão financeira', icon: CircleDollarSign, href: '/financeiro' },
      { label: 'Contas a receber e a pagar', icon: BadgeDollarSign, href: '/contas' },
      { label: 'Caixa e fluxo de caixa', icon: PiggyBank, href: '/fluxo-caixa' },
      { label: 'TISS e glosas', icon: FileText, href: '/faturamento-convenios' },
      { label: 'Repasses médicos', icon: HandCoins, href: '/repasses-medicos' },
      { label: 'Preços e serviços', icon: CircleDollarSign, href: '/precos-servicos' },
      { label: 'Cobrança de inadimplentes', icon: BadgeDollarSign, href: '/cobranca-inadimplentes' },
    ],
  },
  {
    label: 'Relatórios e indicadores',
    icon: FileBarChart,
    color: '#005ECC',
    roles: ['admin', 'financeiro', 'recepcao', 'enfermagem', 'medico'],
    items: [
      { label: 'Relatórios', icon: FileBarChart, href: '/relatorios', exact: true, roles: ['admin', 'financeiro'] },
      { label: 'Relatórios salvos', icon: FileBarChart, href: '/relatorios/salvos', roles: ['admin', 'financeiro'] },
      { label: 'Indicadores da clínica', icon: ActivitySquare, href: '/analytics', roles: ['admin'] },
      { label: 'Indicadores de produtividade', icon: ActivitySquare, href: '/indicadores', roles: ['admin', 'recepcao', 'enfermagem', 'financeiro', 'medico'] },
    ],
  },
  {
    label: 'Equipe',
    icon: UsersRound,
    color: '#005ECC',
    roles: ['admin'],
    items: [
      { label: 'Médicos e funcionários', icon: UsersRound, href: '/equipe', roles: ['admin'], exact: true },
      { label: 'Convites e acessos', icon: UserCog, href: '/equipe?aba=convites', roles: ['admin'] },
    ],
  },
  {
    label: 'Estoque e suprimentos',
    icon: PackageSearch,
    color: '#005ECC',
    roles: ['admin', 'enfermagem'],
    items: [
      { label: 'Estoque', icon: PackageSearch, href: '/estoque', roles: ['admin', 'enfermagem'] },
      { label: 'Itens com baixo estoque', icon: PackageSearch, href: '/estoque?alerta=critico', roles: ['admin', 'enfermagem'] },
    ],
  },
  {
    label: 'Comunicação',
    icon: MessageCircle,
    color: '#005ECC',
    items: [
      { label: 'Chat interno', icon: MessageCircle, href: '/chat' },
      { label: 'Mensagens e lembretes a pacientes', icon: Bell, href: '/automacoes?tab=fila', roles: ['admin'], planFeature: 'automacoes' },
    ],
  },
  {
    label: 'Automação e IA',
    icon: Sparkles,
    color: '#005ECC',
    roles: ['admin'],
    planFeature: 'automacoes',
    items: [
      { label: 'Automações da clínica', icon: Sparkles, href: '/automacoes', roles: ['admin'], exact: true },
      { label: 'Atendente de IA', icon: BotMessageSquare, href: '/agente-ia', roles: ['admin'], planFeature: 'agente_ia' },
    ],
  },
  {
    label: 'Configurações',
    icon: Settings2,
    color: '#005ECC',
    roles: ['admin', 'medico'],
    items: [
      { label: 'Dados da clínica', icon: Building2, href: '/configuracoes', roles: ['admin'], exact: true },
      { label: 'Horários e agenda online', icon: CalendarRange, href: '/configuracoes?tab=horarios', roles: ['admin'] },
      { label: 'Serviços e preços', icon: CircleDollarSign, href: '/precos-servicos', roles: ['admin'] },
      { label: 'Notificações', icon: Bell, href: '/configuracoes?tab=notificacoes', roles: ['admin'] },
      { label: 'Integrações disponíveis', icon: Settings2, href: '/configuracoes?tab=integracoes', roles: ['admin'] },
      { label: 'Interoperabilidade FHIR', icon: FileText, href: '/interoperabilidade', roles: ['admin', 'medico'] },
      { label: 'Plano e assinatura', icon: CreditCard, href: '/planos', roles: ['admin'] },
    ],
  },
  {
    label: 'Ajuda',
    icon: MessageCircle,
    color: '#005ECC',
    items: [
      { label: 'Treinamento e documentação', icon: BookMarked, href: '/treinamento' },
      { label: 'Suporte', icon: MessageCircle, href: '/suporte', roles: ['admin', 'recepcao', 'enfermagem', 'medico', 'financeiro'] },
      { label: 'Acesso assistido pelo suporte', icon: Shield, href: '/acesso-assistido', roles: ['admin'] },
    ],
  },
  {
    label: 'Painel da plataforma',
    icon: Gauge,
    color: '#005ECC',
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
    color: '#005ECC',
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
    color: '#005ECC',
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
    color: '#005ECC',
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
    color: '#005ECC',
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
