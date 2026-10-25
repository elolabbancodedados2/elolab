import type { Ionicons } from '@expo/vector-icons';
import type { AppRole, MobileProfile } from '../auth/AuthContext';

// Native mirror of src/config/sidebarMenu.ts: same labels, roles and plan features.
// `route` is the native screen; `web` is the matching web route, used for documented hand-offs.
export type CatalogItem = { key: string; label: string; route: string; web: string; roles?: AppRole[]; platform?: boolean; planFeature?: string };
export type CatalogGroup = { title: string; icon: keyof typeof Ionicons.glyphMap; roles?: AppRole[]; platform?: boolean; planFeature?: string; items: CatalogItem[] };

const all: AppRole[] = ['admin', 'recepcao', 'enfermagem', 'medico', 'financeiro'];
const m = (key: string, label: string, web: string, extra: Partial<CatalogItem> = {}): CatalogItem => ({ key, label, web, route: `/modules/${key}`, ...extra });

export const catalog: CatalogGroup[] = [
  { title: 'Início', icon: 'home-outline', items: [
    m('dashboard', 'Dashboard', '/dashboard', { route: '/(tabs)' }),
    m('tarefas', 'Tarefas', '/tarefas', { roles: all }),
    m('minha-fila', 'Minha fila', '/minha-fila', { roles: all }),
  ] },
  { title: 'Atendimento', icon: 'calendar-outline', roles: all, items: [
    m('agenda', 'Agenda', '/agenda', { route: '/(tabs)/agenda', roles: ['admin', 'recepcao', 'enfermagem', 'medico'] }),
    m('recepcao', 'Recepção e caixa', '/recepcao', { roles: ['admin', 'recepcao', 'financeiro'] }),
    m('fila', 'Fila e triagem', '/fila', { route: '/(tabs)/care', roles: ['admin', 'recepcao', 'enfermagem', 'medico'] }),
    m('gestao-fluxo', 'Salas e lista de espera', '/gestao-fluxo', { roles: ['admin', 'recepcao'] }),
    m('retornos', 'Retornos', '/retornos', { roles: ['admin', 'medico', 'recepcao'] }),
    m('higiene-salas', 'Higienização de salas', '/higiene-salas', { roles: ['admin', 'recepcao', 'enfermagem'] }),
    m('patrimonio', 'Patrimônio e manutenção', '/patrimonio-equipamentos', { roles: ['admin', 'recepcao', 'enfermagem'] }),
    m('risco-faltas', 'Risco de faltas', '/analise-preditiva', { roles: ['admin', 'recepcao'] }),
  ] },
  { title: 'Pacientes', icon: 'people-outline', roles: all, items: [
    m('pacientes', 'Cadastro e histórico', '/pacientes', { route: '/(tabs)/patients', roles: ['admin', 'recepcao', 'enfermagem', 'medico'] }),
    m('convenios', 'Convênios', '/convenios', { roles: ['admin', 'recepcao', 'financeiro'] }),
    m('portal-pacientes', 'Acesso ao portal do paciente', '/portal-pacientes', { roles: ['admin'] }),
  ] },
  { title: 'Clínica', icon: 'medical-outline', roles: ['admin', 'medico', 'enfermagem'], items: [
    m('prontuarios', 'Prontuários', '/prontuarios', { roles: ['admin', 'medico'] }),
    m('documentos', 'Prescrições e documentos', '/documentos-clinicos', { roles: ['admin', 'medico'] }),
    m('sinais-vitais', 'Sinais vitais', '/vitais-graficos', { roles: ['admin', 'medico', 'enfermagem'] }),
    m('exames', 'Exames', '/exames', { roles: ['admin', 'medico', 'enfermagem'], planFeature: 'exames' }),
    m('encaminhamentos', 'Encaminhamentos', '/documentos-clinicos?tab=encaminhamentos', { roles: ['admin', 'medico'] }),
    m('seguranca-assistencial', 'Segurança assistencial', '/seguranca-assistencial', { roles: ['admin', 'medico', 'enfermagem'] }),
    m('modelos', 'Modelos clínicos', '/todos-templates', { roles: ['admin', 'medico'] }),
  ] },
  { title: 'Laboratório', icon: 'flask-outline', roles: ['admin', 'medico', 'enfermagem', 'recepcao'], planFeature: 'exames', items: [
    m('laboratorio', 'Painel do laboratório', '/laboratorio', { roles: ['admin', 'medico', 'enfermagem'] }),
    m('mapa-coleta', 'Mapa de coleta', '/mapa-coleta', { roles: ['admin', 'enfermagem'] }),
    m('laudos', 'Laudos', '/laudos-lab', { roles: ['admin', 'medico', 'enfermagem'] }),
    m('guias-externas', 'Guias externas', '/guias-externas', { roles: ['admin', 'recepcao', 'enfermagem'] }),
  ] },
  { title: 'Financeiro', icon: 'wallet-outline', roles: ['admin', 'financeiro'], items: [
    m('financeiro', 'Visão financeira', '/financeiro'),
    m('fluxo-caixa', 'Caixa e fluxo de caixa', '/fluxo-caixa'),
    m('contas', 'Contas a receber e a pagar', '/contas'),
    m('inadimplentes', 'Cobrança de inadimplentes', '/cobranca-inadimplentes'),
    m('repasses', 'Repasses médicos', '/repasses-medicos'),
    m('faturamento-convenios', 'TISS e glosas', '/faturamento-convenios'),
    m('precos', 'Preços e serviços', '/precos-servicos'),
  ] },
  { title: 'Relatórios e indicadores', icon: 'bar-chart-outline', roles: all, items: [
    m('indicadores', 'Indicadores de produtividade', '/indicadores', { roles: all }),
    m('relatorios', 'Relatórios', '/relatorios', { roles: ['admin', 'financeiro'] }),
    m('analytics', 'Indicadores da clínica', '/analytics', { roles: ['admin'] }),
    m('relatorios-salvos', 'Relatórios salvos', '/relatorios/salvos', { roles: ['admin', 'financeiro'] }),
  ] },
  { title: 'Equipe', icon: 'people-circle-outline', roles: ['admin'], items: [
    m('equipe', 'Médicos e funcionários', '/equipe', { roles: ['admin'] }),
    m('convites', 'Convites e acessos', '/equipe?aba=convites', { roles: ['admin'] }),
  ] },
  { title: 'Estoque e suprimentos', icon: 'cube-outline', roles: ['admin', 'enfermagem'], items: [
    m('estoque', 'Estoque', '/estoque', { roles: ['admin', 'enfermagem'] }),
    m('estoque-critico', 'Itens com baixo estoque', '/estoque?alerta=critico', { route: '/modules/estoque?alerta=critico', roles: ['admin', 'enfermagem'] }),
  ] },
  { title: 'Comunicação', icon: 'chatbubbles-outline', items: [
    m('chat', 'Chat interno', '/chat'),
    m('mensagens-pacientes', 'Mensagens e lembretes a pacientes', '/automacoes?tab=fila', { roles: ['admin'], planFeature: 'automacoes' }),
  ] },
  { title: 'Automação e IA', icon: 'sparkles-outline', roles: ['admin'], planFeature: 'automacoes', items: [
    m('automacoes', 'Automações da clínica', '/automacoes', { roles: ['admin'] }),
    m('agente-ia', 'Atendente de IA', '/agente-ia', { roles: ['admin'], planFeature: 'agente_ia' }),
  ] },
  { title: 'Configurações', icon: 'settings-outline', roles: ['admin', 'medico'], items: [
    m('configuracoes', 'Dados da clínica', '/configuracoes', { roles: ['admin'] }),
    m('horarios', 'Horários e agenda online', '/configuracoes?tab=horarios', { roles: ['admin'] }),
    m('servicos-precos', 'Serviços e preços', '/precos-servicos', { route: '/modules/precos', roles: ['admin'] }),
    m('notificacoes-config', 'Notificações', '/configuracoes?tab=notificacoes', { roles: ['admin'] }),
    m('integracoes', 'Integrações disponíveis', '/configuracoes?tab=integracoes', { roles: ['admin'] }),
    m('fhir', 'Interoperabilidade FHIR', '/interoperabilidade', { roles: ['admin', 'medico'] }),
    m('planos', 'Plano e assinatura', '/planos', { roles: ['admin'] }),
  ] },
  { title: 'Ajuda', icon: 'help-circle-outline', items: [
    m('treinamento', 'Treinamento e documentação', '/treinamento'),
    m('suporte', 'Suporte', '/suporte', { roles: all }),
    m('acesso-assistido', 'Acesso assistido pelo suporte', '/acesso-assistido', { roles: ['admin'] }),
  ] },
  { title: 'Painel da plataforma', icon: 'speedometer-outline', roles: ['admin'], platform: true, items: [
    m('admin-visao', 'Visão geral', '/painel-admin', { platform: true }),
    m('admin-saude', 'Saúde do serviço', '/admin/saude', { platform: true }),
    m('admin-incidentes', 'Incidentes', '/admin/incidentes', { platform: true }),
  ] },
  { title: 'Clientes', icon: 'business-outline', roles: ['admin'], platform: true, items: [
    m('admin-crm', 'Carteira de clientes', '/admin/crm', { platform: true }),
    m('admin-clinicas', 'Clínicas', '/admin/clinicas', { platform: true }),
    m('admin-usuarios', 'Contas e acessos', '/usuarios', { platform: true }),
    m('admin-onboarding', 'Entrada de clientes', '/admin/onboarding', { platform: true }),
    m('admin-suporte', 'Atendimento', '/admin/suporte', { platform: true }),
    m('admin-acesso-assistido', 'Acesso assistido', '/admin/acesso-assistido', { platform: true }),
  ] },
  { title: 'Receita', icon: 'card-outline', roles: ['admin'], platform: true, items: [
    m('admin-cobrancas', 'Cobranças e assinaturas', '/admin/cobrancas', { platform: true }),
    m('admin-executivo', 'Resumo do negócio', '/admin/relatorio-executivo', { platform: true }),
    m('admin-historico-financeiro', 'Histórico financeiro', '/admin/historico-financeiro', { platform: true }),
  ] },
  { title: 'Produto e comunicação', icon: 'megaphone-outline', roles: ['admin'], platform: true, items: [
    m('admin-comunicacao', 'Comunicados aos clientes', '/admin/comunicacao', { platform: true }),
    m('admin-feedback', 'Opiniões dos clientes', '/feedback', { platform: true }),
    m('admin-documentacao', 'Documentação e ajuda', '/documentacao', { platform: true }),
    m('admin-ia', 'Configuração da IA', '/admin/ia', { platform: true }),
  ] },
  { title: 'Controles da plataforma', icon: 'shield-checkmark-outline', roles: ['admin'], platform: true, items: [
    m('admin-seguranca', 'Segurança e privacidade', '/admin/seguranca', { platform: true }),
    m('admin-lgpd', 'Solicitações de privacidade', '/admin/lgpd', { platform: true }),
    m('admin-integracoes', 'Integrações de clientes', '/admin/integracoes', { platform: true }),
    m('admin-operacoes', 'Operação do serviço', '/admin/operacoes', { platform: true }),
    m('admin-relatorios-agendados', 'Relatórios agendados', '/admin/relatorios-agendados', { platform: true }),
  ] },
];

// Personal screens reachable from the account card, notifications bell and Home.
export const personal: CatalogItem[] = [
  m('perfil', 'Perfil e preferências', '/preferencias'),
  m('seguranca', 'Segurança da conta', '/seguranca'),
  m('notificacoes', 'Notificações', '/notificacoes'),
  m('meu-historico', 'Meu histórico', '/meu-historico'),
  m('feedback', 'Enviar opinião', '/feedback'),
];

export const WEB_BASE_URL = 'https://app.elolab.com.br';

export function hasRole(roles: AppRole[], required?: AppRole[]) {
  return !required?.length || roles.includes('admin') || required.some(role => roles.includes(role));
}

/** Same rules as getFilteredMenuGroups + plan filtering on the web sidebar. */
export function canOpen(profile: MobileProfile | null, hasFeature: (f?: string) => boolean, item: CatalogItem, group?: CatalogGroup) {
  if (!profile) return false;
  const platformOnly = profile.isPlatformAdmin && !profile.clinicaId;
  if (item.platform || group?.platform) return profile.isPlatformAdmin;
  if (platformOnly) return false;
  return hasRole(profile.roles, group?.roles) && hasRole(profile.roles, item.roles) && hasFeature(group?.planFeature) && hasFeature(item.planFeature);
}

export function findItem(key: string): { item: CatalogItem; group?: CatalogGroup } | null {
  for (const group of catalog) {
    const item = group.items.find(entry => entry.key === key);
    if (item) return { item, group };
  }
  const item = personal.find(entry => entry.key === key);
  return item ? { item } : null;
}
