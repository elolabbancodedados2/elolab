import { menuGroups } from '@/config/sidebarMenu';

const labelsByPath: Record<string, string> = {
  '/': 'Início',
  '/auth': 'Acesso à clínica',
  '/landing': 'Início',
  '/demonstracao': 'Demonstração da clínica',
  '/aceitar-convite': 'Aceitar convite',
  '/redefinir-senha': 'Redefinir senha',
  '/politica-privacidade': 'Política de privacidade',
  '/politica-cookies': 'Política de cookies',
  '/termos-uso': 'Termos de uso',
  '/dashboard': 'Painel principal',
  '/boas-vindas': 'Boas-vindas',
  '/chat': 'Chat interno',
  '/notificacoes': 'Central de notificações',
  '/portal-pacientes': 'Portal do paciente',
  '/meu-historico': 'Meu histórico',
  '/preferencias': 'Minhas preferências',
  '/feedback': 'Enviar feedback',
  '/indicadores': 'Indicadores de produtividade',
  '/treinamento': 'Treinamento',
  '/agenda': 'Agenda',
  '/prontuarios': 'Prontuários',
  '/documentos-clinicos': 'Documentos clínicos',
  '/exames': 'Exames',
  '/retornos': 'Retornos',
  '/laboratorio': 'Laboratório',
  '/mapa-coleta': 'Mapa de coleta',
  '/guias-externas': 'Guias externas',
  '/laudos-lab': 'Laudos laboratoriais',
  '/pacientes': 'Pacientes',
  '/fila': 'Fila de atendimento',
  '/equipe': 'Equipe',
  '/gestao-fluxo': 'Salas e lista de espera',
  '/estoque': 'Estoque',
  '/convenios': 'Convênios',
  '/faturamento-convenios': 'Faturamento de convênios',
  '/repasses-medicos': 'Repasses médicos',
  '/interoperabilidade': 'Interoperabilidade',
  '/todos-templates': 'Modelos clínicos',
  '/tarefas': 'Tarefas',
  '/recepcao': 'Recepção e caixa',
  '/financeiro': 'Financeiro',
  '/contas': 'Contas a receber e a pagar',
  '/fluxo-caixa': 'Fluxo de caixa',
  '/precos-servicos': 'Preços e serviços',
  '/relatorios': 'Relatórios',
  '/relatorios/salvos': 'Relatórios salvos',
  '/cobranca-inadimplentes': 'Cobrança de inadimplentes',
  '/usuarios': 'Usuários',
  '/configuracoes': 'Configurações',
  '/onboarding': 'Configuração inicial',
  '/configuracoes-avancadas': 'Configurações avançadas',
  '/automacoes': 'Automações',
  '/agente-ia': 'Atendente de IA',
  '/analytics': 'Indicadores da clínica',
  '/planos': 'Planos e assinatura',
  '/documentacao': 'Documentação',
  '/painel-admin': 'Visão geral da plataforma',
  '/suporte': 'Suporte',
  '/acesso-assistido': 'Acesso assistido',
  '/seguranca': 'Segurança da conta',
  '/lgpd-pacientes': 'Privacidade de pacientes',
  '/vitais-graficos': 'Sinais vitais',
  '/seguranca-assistencial': 'Qualidade e segurança assistencial',
  '/higiene-salas': 'Higienização de salas',
  '/patrimonio-equipamentos': 'Patrimônio e manutenção',
  '/analise-preditiva': 'Risco de faltas',
  '/admin/clinicas': 'Clínicas',
  '/admin/crm': 'Carteira de clientes',
  '/admin/saude': 'Saúde do serviço',
  '/admin/suporte': 'Suporte da plataforma',
  '/admin/ia': 'Configuração da IA',
  '/admin/comunicacao': 'Comunicação com clientes',
  '/admin/operacoes': 'Operação do serviço',
  '/admin/lgpd': 'Solicitações de privacidade',
  '/admin/erros': 'Erros do sistema',
  '/admin/backups': 'Backups',
  '/admin/relatorio-executivo': 'Resumo do negócio',
  '/admin/cobrancas': 'Cobranças e assinaturas',
  '/admin/historico-financeiro': 'Histórico financeiro',
  '/admin/acesso-assistido': 'Acesso assistido',
  '/admin/integracoes': 'Integrações de clientes',
  '/admin/filas': 'Filas do sistema',
  '/admin/incidentes': 'Incidentes',
  '/admin/seguranca': 'Segurança da plataforma',
  '/admin/consumo': 'Consumo do sistema',
  '/admin/onboarding': 'Entrada de clientes',
  '/admin/dominios': 'Domínios',
  '/admin/relatorios-agendados': 'Relatórios agendados',
};

const labelsByMenuPath: Record<string, string> = Object.fromEntries(
  menuGroups.flatMap((group) => group.items.map((item) => [item.href.split('?')[0], item.label] as const)),
);

export function getRouteLabel(pathname: string): string {
  const path = pathname.replace(/\/+$/, '') || '/';
  const explicit = labelsByPath[path] || labelsByMenuPath[path];
  if (explicit) return explicit;
  if (path.startsWith('/agendar/')) return 'Agendamento online';
  if (path.startsWith('/portal-guias/')) return 'Portal de guias';
  if (path.startsWith('/verificar-assinatura/')) return 'Verificar assinatura';
  if (path.startsWith('/planos/checkout/')) return 'Checkout do plano';

  const segment = path.split('/').filter(Boolean).pop() || '';
  try {
    return decodeURIComponent(segment).replace(/[-_]+/g, ' ').replace(/^./, (letter) => letter.toUpperCase());
  } catch {
    return segment.replace(/[-_]+/g, ' ').replace(/^./, (letter) => letter.toUpperCase());
  }
}

export function getRouteAnnouncement(pathname: string): string {
  return `${getRouteLabel(pathname)} carregado`;
}
