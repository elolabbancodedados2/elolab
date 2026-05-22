import {
  LayoutDashboard,
  Users,
  CalendarRange,
  ClipboardCheck,
  Shield,
  CircleDollarSign,
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
} from 'lucide-react';
import { AppRole } from '@/contexts/SupabaseAuthContext';

export interface MenuItem {
  label: string;
  icon: LucideIcon;
  href: string;
  badge?: number;
  roles?: AppRole[];
  external?: boolean;
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

export const menuGroups: MenuGroup[] = [
  {
    label: 'Início',
    icon: Gauge,
    color: '#6366f1',
    items: [
      { label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
      { label: 'Agenda', icon: CalendarRange, href: '/agenda' },
      { label: 'Chat Interno', icon: MessageCircle, href: '/chat' },
      { label: 'Tarefas', icon: ListChecks, href: '/tarefas', roles: ['admin', 'recepcao', 'enfermagem', 'financeiro'] },
      { label: 'Segurança da Conta', icon: Shield, href: '/seguranca' },
    ],
  },
  {
    label: 'Atendimento',
    icon: MonitorSmartphone,
    color: '#0ea5e9',
    roles: ['admin', 'recepcao', 'enfermagem'],
    items: [
      { label: 'Recepção & Caixa', icon: MonitorSmartphone, href: '/recepcao', roles: ['admin', 'recepcao', 'financeiro'] },
      { label: 'Fila / Triagem', icon: ClipboardCheck, href: '/fila', roles: ['admin', 'recepcao', 'enfermagem'] },
      { label: 'Salas & Espera', icon: DoorOpen, href: '/gestao-fluxo', roles: ['admin', 'recepcao'] },
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
      { label: 'Documentos Clínicos', icon: BookMarked, href: '/documentos-clinicos', roles: ['admin', 'medico'] },
      { label: 'Exames', icon: Microscope, href: '/exames', roles: ['admin', 'medico', 'enfermagem'] },
    ],
  },
  {
    label: 'Laboratório',
    icon: TestTubes,
    color: '#06b6d4',
    roles: ['admin', 'medico', 'enfermagem'],
    items: [
      { label: 'Painel Lab', icon: FlaskConical, href: '/laboratorio' },
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
      { label: 'Visão Geral', icon: CircleDollarSign, href: '/financeiro' },
      { label: 'Contas', icon: BadgeDollarSign, href: '/contas' },
      { label: 'Fluxo de Caixa', icon: PiggyBank, href: '/fluxo-caixa' },
      { label: 'Preços & Serviços', icon: CircleDollarSign, href: '/precos-servicos' },
      { label: 'Relatórios', icon: FileBarChart, href: '/relatorios' },
      { label: 'Relatórios Salvos', icon: FileBarChart, href: '/relatorios/salvos' },
      { label: 'Cobrança Inadimplentes', icon: BadgeDollarSign, href: '/cobranca-inadimplentes' },
    ],
  },
  {
    label: 'Equipe',
    icon: UsersRound,
    color: '#ec4899',
    roles: ['admin'],
    items: [
      { label: 'Equipe', icon: UsersRound, href: '/equipe' },
      { label: 'Estoque', icon: PackageSearch, href: '/estoque', roles: ['admin', 'enfermagem'] },
      { label: 'Templates', icon: FolderKanban, href: '/todos-templates', roles: ['admin', 'medico'] },
    ],
  },
  {
    label: 'Administração',
    icon: Settings2,
    color: '#ef4444',
    roles: ['admin'],
    items: [
      { label: 'Analytics', icon: ActivitySquare, href: '/analytics' },
      { label: 'Automações', icon: Sparkles, href: '/automacoes' },
      { label: 'Configurações', icon: Settings2, href: '/configuracoes' },
      { label: 'Direitos LGPD', icon: ScrollText, href: '/lgpd-pacientes' },
    ],
  },
  {
    label: 'Plataforma',
    icon: Shield,
    color: '#dc2626',
    roles: ['admin'],
    superAdminOnly: true,
    items: [
      { label: 'Painel Admin', icon: Shield, href: '/painel-admin', superAdminOnly: true },
      { label: 'Agente IA', icon: BotMessageSquare, href: '/agente-ia', superAdminOnly: true },
      { label: 'Planos', icon: CreditCard, href: '/planos', superAdminOnly: true },
      { label: 'Documentação', icon: BookMarked, href: '/documentacao', superAdminOnly: true },
    ],
  },
];

/**
 * Filter menu groups based on user roles and superadmin status
 */
export function getFilteredMenuGroups(
  userRoles: AppRole[],
  isAdmin: boolean,
  isSuperAdmin = false
): MenuGroup[] {
  return menuGroups
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
