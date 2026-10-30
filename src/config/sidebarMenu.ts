import {
  LayoutDashboard,
  Users,
  CalendarRange,
  ClipboardCheck,
  Shield,
  ShieldCheck,
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
  Inbox,
  TestTubes,
  BookMarked,
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
  Wrench,
} from '@/components/icons/elolabIcons';
import type { EloLabIcon } from '@/components/icons/elolabIcons';
import { AppRole } from '@/contexts/SupabaseAuthContext';

export interface MenuItem {
  label: string;
  icon: EloLabIcon;
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
  icon: EloLabIcon;
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
  return platformPaths.includes(pathname) || pathname.startsWith('/usuarios/') || pathname === '/admin' || pathname.startsWith('/admin/')
    ? 'platform'
    : 'app';
}

export const menuGroups: MenuGroup[] = [
  {
    label: 'Início',
    icon: Gauge,
    items: [
      { label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
      { label: 'Tarefas', icon: ListChecks, href: '/tarefas', roles: ['admin', 'recepcao', 'enfermagem', 'financeiro', 'medico'] },
      { label: 'Minha fila', icon: Inbox, href: '/minha-fila', roles: ['admin', 'recepcao', 'enfermagem', 'financeiro', 'medico'] },
    ],
  },
  {
    label: 'Atendimento',
    icon: MonitorSmartphone,
    roles: ['admin', 'recepcao', 'enfermagem', 'medico', 'financeiro'],
    items: [
      { label: 'Agenda', icon: CalendarRange, href: '/agenda', roles: ['admin', 'recepcao', 'enfermagem', 'medico'] },
      { label: 'Recepção e caixa', icon: MonitorSmartphone, href: '/recepcao', roles: ['admin', 'recepcao', 'financeiro'] },
      { label: 'Fila e triagem', icon: ClipboardCheck, href: '/fila', roles: ['admin', 'recepcao', 'enfermagem', 'medico'] },
      { label: 'Salas e lista de espera', icon: DoorOpen, href: '/gestao-fluxo', roles: ['admin', 'recepcao'] },
      { label: 'Retornos', icon: CalendarCheck, href: '/retornos', roles: ['admin', 'medico', 'recepcao'] },
    ],
  },
  {
    label: 'Pacientes',
    icon: Users,
    roles: ['admin', 'recepcao', 'enfermagem', 'medico', 'financeiro'],
    items: [
      { label: 'Cadastro e histórico', icon: Users, href: '/pacientes', roles: ['admin', 'recepcao', 'enfermagem', 'medico'] },
      { label: 'Convênios', icon: Building2, href: '/convenios', roles: ['admin', 'recepcao', 'financeiro'] },
      { label: 'Acesso ao portal do paciente', icon: UsersRound, href: '/portal-pacientes', roles: ['admin'] },
    ],
  },
  {
    label: 'Clínica',
    icon: Stethoscope,
    roles: ['admin', 'medico', 'enfermagem'],
    items: [
      { label: 'Prontuários', icon: ScrollText, href: '/prontuarios', roles: ['admin', 'medico'] },
      { label: 'Prescrições e documentos', icon: BookMarked, href: '/documentos-clinicos', roles: ['admin', 'medico'] },
      { label: 'Sinais vitais', icon: ActivitySquare, href: '/vitais-graficos', roles: ['admin', 'medico', 'enfermagem'] },
      { label: 'Exames', icon: Microscope, href: '/exames', roles: ['admin', 'medico', 'enfermagem'], planFeature: 'exames' },
      { label: 'Encaminhamentos', icon: Stethoscope, href: '/documentos-clinicos?tab=encaminhamentos', roles: ['admin', 'medico'] },
      { label: 'Segurança assistencial', icon: ShieldCheck, href: '/seguranca-assistencial', roles: ['admin', 'medico', 'enfermagem'] },
      { label: 'Modelos clínicos', icon: FolderKanban, href: '/todos-templates', roles: ['admin', 'medico'] },
    ],
  },
  {
    label: 'Laboratório',
    icon: TestTubes,
    roles: ['admin', 'medico', 'enfermagem', 'recepcao'],
    planFeature: 'exames',
    items: [
      { label: 'Painel do laboratório', icon: FlaskConical, href: '/laboratorio', roles: ['admin', 'medico', 'enfermagem'] },
      { label: 'Mapa de coleta', icon: MapPinned, href: '/mapa-coleta', roles: ['admin', 'enfermagem'] },
      { label: 'Laudos', icon: ScrollText, href: '/laudos-lab', roles: ['admin', 'medico', 'enfermagem'] },
      { label: 'Guias externas', icon: FileText, href: '/guias-externas', roles: ['admin', 'recepcao', 'enfermagem'] },
    ],
  },
  {
    label: 'Financeiro',
    icon: WalletCards,
    roles: ['admin', 'financeiro'],
    items: [
      { label: 'Visão financeira', icon: CircleDollarSign, href: '/financeiro' },
      { label: 'Caixa e fluxo de caixa', icon: PiggyBank, href: '/fluxo-caixa' },
      { label: 'Contas a receber e a pagar', icon: BadgeDollarSign, href: '/contas' },
      { label: 'Cobrança de inadimplentes', icon: BadgeDollarSign, href: '/cobranca-inadimplentes' },
      { label: 'Repasses médicos', icon: HandCoins, href: '/repasses-medicos' },
      { label: 'TISS e glosas', icon: FileText, href: '/faturamento-convenios' },
      { label: 'Preços e serviços', icon: CircleDollarSign, href: '/precos-servicos' },
    ],
  },
  {
    label: 'Gestão da clínica',
    icon: Building2,
    items: [
      { label: 'Médicos e funcionários', icon: UsersRound, href: '/equipe', roles: ['admin'], exact: true },
      { label: 'Convites e acessos', icon: UserCog, href: '/equipe?aba=convites', roles: ['admin'] },
      { label: 'Estoque', icon: PackageSearch, href: '/estoque', roles: ['admin', 'enfermagem'] },
      { label: 'Itens com baixo estoque', icon: PackageSearch, href: '/estoque?alerta=critico', roles: ['admin', 'enfermagem'] },
      { label: 'Higienização de salas', icon: ClipboardCheck, href: '/higiene-salas', roles: ['admin', 'recepcao', 'enfermagem'] },
      { label: 'Patrimônio e manutenção', icon: Wrench, href: '/patrimonio-equipamentos', roles: ['admin', 'recepcao', 'enfermagem'] },
    ],
  },
  {
    label: 'Comunicação e automação',
    icon: MessageCircle,
    items: [
      { label: 'Chat interno', icon: MessageCircle, href: '/chat' },
      { label: 'Mensagens e lembretes a pacientes', icon: Bell, href: '/automacoes?tab=fila', roles: ['admin'], planFeature: 'automacoes' },
      { label: 'Automações da clínica', icon: Sparkles, href: '/automacoes', roles: ['admin'], exact: true, planFeature: 'automacoes' },
      { label: 'Atendente de IA', icon: BotMessageSquare, href: '/agente-ia', roles: ['admin'], planFeature: 'agente_ia' },
    ],
  },
  {
    label: 'Relatórios e indicadores',
    icon: FileBarChart,
    roles: ['admin', 'financeiro', 'recepcao', 'enfermagem', 'medico'],
    items: [
      { label: 'Indicadores de produtividade', icon: ActivitySquare, href: '/indicadores', roles: ['admin', 'recepcao', 'enfermagem', 'financeiro', 'medico'] },
      { label: 'Relatórios', icon: FileBarChart, href: '/relatorios', exact: true, roles: ['admin', 'financeiro'] },
      { label: 'Indicadores da clínica', icon: ActivitySquare, href: '/analytics', roles: ['admin'] },
      { label: 'Relatórios salvos', icon: FileBarChart, href: '/relatorios/salvos', roles: ['admin', 'financeiro'] },
      { label: 'Risco de faltas', icon: ActivitySquare, href: '/analise-preditiva', roles: ['admin', 'recepcao'] },
    ],
  },
  {
    label: 'Configurações',
    icon: Settings2,
    roles: ['admin', 'medico'],
    items: [
      { label: 'Dados da clínica', icon: Building2, href: '/configuracoes', roles: ['admin'], exact: true },
      { label: 'Horários e agenda online', icon: CalendarRange, href: '/configuracoes?tab=horarios', roles: ['admin'] },
      { label: 'Notificações', icon: Bell, href: '/configuracoes?tab=notificacoes', roles: ['admin'] },
      { label: 'Integrações disponíveis', icon: Settings2, href: '/configuracoes?tab=integracoes', roles: ['admin'] },
      { label: 'Interoperabilidade FHIR', icon: FileText, href: '/interoperabilidade', roles: ['admin', 'medico'] },
      { label: 'Plano e assinatura', icon: CreditCard, href: '/planos', roles: ['admin'] },
    ],
  },
  {
    label: 'Ajuda',
    icon: MessageCircle,
    items: [
      { label: 'Treinamento e documentação', icon: BookMarked, href: '/treinamento' },
      { label: 'Suporte', icon: MessageCircle, href: '/suporte', roles: ['admin', 'recepcao', 'enfermagem', 'medico', 'financeiro'] },
      { label: 'Acesso assistido pelo suporte', icon: Shield, href: '/acesso-assistido', roles: ['admin'] },
    ],
  },
  {
    label: 'Painel da plataforma',
    icon: Gauge,
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
