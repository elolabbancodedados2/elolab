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
  DatabaseBackup,
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
      // `medico` faltava aqui, mas a rota de /tarefas já o libera — o médico
      // tinha acesso e nenhum caminho para chegar.
      { label: 'Tarefas', icon: ListChecks, href: '/tarefas', roles: ['admin', 'recepcao', 'enfermagem', 'financeiro', 'medico'] },
      { label: 'Segurança da Conta', icon: Shield, href: '/seguranca' },
    ],
  },
  {
    label: 'Atendimento',
    icon: MonitorSmartphone,
    color: '#0ea5e9',
    // getFilteredMenuGroups filtra nos DOIS níveis: sem `medico` aqui, o grupo
    // inteiro desaparece para o médico e o item Fila / Triagem nunca aparece,
    // por mais que o item o inclua. `financeiro` pelo mesmo motivo, para
    // Recepção & Caixa — a rota de /recepcao já o libera.
    roles: ['admin', 'recepcao', 'enfermagem', 'medico', 'financeiro'],
    items: [
      { label: 'Recepção & Caixa', icon: MonitorSmartphone, href: '/recepcao', roles: ['admin', 'recepcao', 'financeiro'] },
      // `medico` incluído: o painel do médico já oferecia um atalho para /fila
      // (DoctorDashboard), mas a rota e este menu barravam o papel — o médico
      // clicava e recebia "sem permissão". O banco sempre autorizou.
      { label: 'Fila / Triagem', icon: ClipboardCheck, href: '/fila', roles: ['admin', 'recepcao', 'enfermagem', 'medico'] },
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
      { label: 'Interoperabilidade', icon: FileText, href: '/interoperabilidade', roles: ['admin', 'medico'] },
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
      { label: 'Painel Lab', icon: FlaskConical, href: '/laboratorio', roles: ['admin', 'medico', 'enfermagem'] },
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
      { label: 'TISS & Glosas', icon: FileText, href: '/faturamento-convenios' },
      { label: 'Repasses Médicos', icon: HandCoins, href: '/repasses-medicos' },
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
    // `enfermagem` e `medico` incluídos para que Estoque e Templates apareçam:
    // as rotas dos dois já liberam esses papéis, mas o grupo derrubava os itens.
    roles: ['admin', 'enfermagem', 'medico'],
    items: [
      // Explícito porque /equipe é só de admin. Sem `roles`, o item herdaria o
      // grupo inteiro e apareceria para enfermagem e médico, que a rota nega.
      { label: 'Equipe', icon: UsersRound, href: '/equipe', roles: ['admin'] },
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
      { label: 'Meu Plano', icon: CreditCard, href: '/planos', roles: ['admin'] },
      { label: 'Analytics', icon: ActivitySquare, href: '/analytics' },
      { label: 'Automações', icon: Sparkles, href: '/automacoes' },
      { label: 'Agente IA', icon: BotMessageSquare, href: '/agente-ia' },
      { label: 'Configurações', icon: Settings2, href: '/configuracoes' },
      { label: 'Configurações Avançadas', icon: Gauge, href: '/configuracoes-avancadas' },
      { label: 'Acesso de Suporte', icon: Shield, href: '/acesso-assistido', roles: ['admin'] },
      { label: 'Direitos LGPD', icon: ScrollText, href: '/lgpd-pacientes' },
      { label: 'Suporte', icon: MessageCircle, href: '/suporte' },
    ],
  },
  {
    label: 'Plataforma',
    icon: Shield,
    color: '#dc2626',
    roles: ['admin'],
    superAdminOnly: true,
    items: [
      { label: 'Saúde da Plataforma', icon: ActivitySquare, href: '/admin/saude', superAdminOnly: true },
      { label: 'CRM', icon: Building2, href: '/admin/crm', superAdminOnly: true },
      { label: 'Clínicas', icon: Building2, href: '/admin/clinicas', superAdminOnly: true },
      { label: 'Painel Admin', icon: Shield, href: '/painel-admin', superAdminOnly: true },
      { label: 'Central de Suporte', icon: MessageCircle, href: '/admin/suporte', superAdminOnly: true },
      { label: 'Governança da IA', icon: BotMessageSquare, href: '/admin/ia', superAdminOnly: true },
      { label: 'Comunicação Global', icon: MessageCircle, href: '/admin/comunicacao', superAdminOnly: true },
      { label: 'Controle Operacional', icon: Gauge, href: '/admin/operacoes', superAdminOnly: true },
      { label: 'LGPD da Plataforma', icon: ScrollText, href: '/admin/lgpd', superAdminOnly: true },
      { label: 'Logs e Erros', icon: ActivitySquare, href: '/admin/erros', superAdminOnly: true },
      { label: 'Backups', icon: DatabaseBackup, href: '/admin/backups', superAdminOnly: true },
      { label: 'Relatório Executivo', icon: FileBarChart, href: '/admin/relatorio-executivo', superAdminOnly: true },
      { label: 'Cobranças SaaS', icon: CreditCard, href: '/admin/cobrancas', superAdminOnly: true },
      { label: 'Histórico Financeiro', icon: PiggyBank, href: '/admin/historico-financeiro', superAdminOnly: true },
      { label: 'Acesso Assistido', icon: Shield, href: '/admin/acesso-assistido', superAdminOnly: true },
      { label: 'Integrações por Clínica', icon: Gauge, href: '/admin/integracoes', superAdminOnly: true },
      { label: 'Filas e Webhooks', icon: ActivitySquare, href: '/admin/filas', superAdminOnly: true },
      { label: 'Incidentes', icon: ActivitySquare, href: '/admin/incidentes', superAdminOnly: true },
      { label: 'Central de Segurança', icon: Shield, href: '/admin/seguranca', superAdminOnly: true },
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
  isSuperAdmin = false,
  /**
   * O dono da plataforma não pertence a clínica alguma: ele administra o
   * produto, não atende paciente. Sem clínica, as telas de Agenda, Pacientes e
   * Prontuários abririam vazias — ruído, não recurso.
   *
   * Ao entrar numa clínica pela impersonação, o perfil recebe aquela clinica_id
   * e as telas voltam, porque aí elas têm dado para mostrar.
   */
  temClinica = true
): MenuGroup[] {
  const soPlataforma = isSuperAdmin && !temClinica;

  return menuGroups
    .filter((group) => (soPlataforma ? !!group.superAdminOnly : true))
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
