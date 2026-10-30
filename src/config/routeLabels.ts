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
  '/agenda/nova': 'Nova consulta',
  '/prontuarios': 'Prontuários',
  '/prontuarios/atendimento': 'Atendimento clínico',
  '/documentos-clinicos': 'Documentos clínicos',
  '/gestao-fluxo/salas': 'Salas e leitos',
  '/gestao-fluxo/salas/nova': 'Nova sala ou leito',
  '/precos-servicos/tipos': 'Tipos de consulta',
  '/precos-servicos/tipos/novo': 'Novo tipo de consulta',
  '/gestao-fluxo/espera': 'Lista de espera',
  '/gestao-fluxo/espera/nova': 'Adicionar à lista de espera',
  '/convenios/novo': 'Novo convênio',
  '/exames': 'Exames',
  '/exames/laboratorios': 'Laboratórios e fornecedores',
  '/exames/laboratorios/novo': 'Novo laboratório',
  '/retornos': 'Retornos',
  '/laboratorio': 'Laboratório',
  '/mapa-coleta': 'Mapa de coleta',
  '/guias-externas': 'Guias externas',
  '/guias-externas/portal': 'Portal externo de guias',
  '/laudos-lab': 'Laudos laboratoriais',
  '/pacientes': 'Pacientes',
  '/pacientes/novo': 'Novo paciente',
  '/documentos-clinicos/nova-prescricao': 'Nova prescrição',
  '/documentos-clinicos/novo-atestado': 'Emitir atestado',
  '/documentos-clinicos/novo-encaminhamento': 'Novo encaminhamento',
  '/exames/nova': 'Nova guia de exames',
  '/fila': 'Fila de atendimento',
  '/fila/adicionar': 'Adicionar à fila',
  '/triagem/nova': 'Nova triagem',
  '/equipe': 'Equipe',
  '/equipe/convites': 'Convites',
  '/equipe/convites/novo': 'Convidar funcionário',
  '/gestao-fluxo': 'Salas e lista de espera',
  '/estoque': 'Estoque',
  '/estoque/novo': 'Novo produto',
  '/tarefas/nova': 'Nova tarefa',
  '/convenios': 'Convênios',
  '/faturamento-convenios': 'Faturamento de convênios',
  '/repasses-medicos': 'Repasses médicos',
  '/interoperabilidade': 'Interoperabilidade',
  '/todos-templates': 'Modelos clínicos',
  '/tarefas': 'Tarefas',
  '/recepcao': 'Recepção e caixa',
  '/recepcao/caixa/abrir': 'Abrir caixa',
  '/recepcao/encaixe': 'Encaixe sem agendamento',
  '/financeiro': 'Financeiro',
  '/contas': 'Contas a receber e a pagar',
  '/contas/receber/nova': 'Nova receita',
  '/contas/pagar/nova': 'Nova conta a pagar',
  '/fluxo-caixa': 'Fluxo de caixa',
  '/precos-servicos': 'Preços e serviços',
  '/precos-servicos/exames': 'Exames',
  '/precos-servicos/exames/particular': 'Particular',
  '/precos-servicos/exames/particular/novo': 'Novo exame particular',
  '/precos-servicos/exames/particular/editar': 'Editar exame particular',
  '/precos-servicos/exames/convenios': 'Preços por convênio',
  '/precos-servicos/exames/convenios/novo': 'Novo preço',
  '/equipe/medicos': 'Equipe médica',
  '/equipe/medicos/novo': 'Novo médico',
  '/equipe/funcionarios': 'Funcionários',
  '/equipe/funcionarios/novo': 'Novo funcionário',
  '/equipe/funcionarios/perfis': 'Nomes dos perfis',
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
  if (/^\/pacientes\/[^/]+\/consentimentos\/novo$/.test(pathname)) return 'Novo consentimento';
  if (/^\/pacientes\/[^/]+\/consentimentos\/[^/]+\/revogar$/.test(pathname)) return 'Revogar consentimento';
  if (/^\/prontuarios\/[^/]+\/anexos\/novo$/.test(pathname)) return 'Adicionar anexo ao prontuário';
  if (/^\/prontuarios\/[^/]+\/adendos\/novo$/.test(pathname)) return 'Novo adendo ao prontuário';
  if (/^\/prontuarios\/(?:[^/]+\/)?retornos\/novo$/.test(pathname)) return 'Agendar retorno clínico';
  if (/^\/atendimentos\/[^/]+\/finalizar$/.test(pathname)) return 'Finalizar atendimento';
  if (/^\/recepcao\/pagamentos\/[^/]+$/.test(pathname)) return 'Receber pagamento';
  if (/^\/contas\/receber\/[^/]+\/recebimento$/.test(pathname)) return 'Receber pagamento';
  if (/^\/contas\/receber\/[^/]+\/estorno$/.test(pathname)) return 'Estornar pagamento';
  if (/^\/laudos-lab\/[^/]+$/.test(pathname)) return 'Conferência do laudo';
  if (/^\/guias-externas\/(?!nova$|portal$)[^/]+$/.test(pathname)) return 'Detalhe da guia';
  if (pathname === '/guias-externas/nova') return 'Nova guia externa';
  if (/^\/mapa-coleta\/[^/]+$/.test(pathname)) return 'Detalhes da coleta';
  if (pathname === '/laboratorio/coletas/nova') return 'Nova coleta de amostra';
  if (/^\/laboratorio\/coletas\/[^/]+\/resultados$/.test(pathname)) return 'Resultados da amostra';
  if (pathname === '/laboratorio/pedidos/novo') return 'Novo pedido laboratorial';
  if (/^\/laboratorio\/pedidos\/[^/]+\/historico$/.test(pathname)) return 'Histórico do pedido';
  if (pathname === '/todos-templates/email/novo') return 'Novo modelo de e-mail';
  const emailAction = pathname.match(/^\/todos-templates\/email\/[^/]+\/(editar|ativar|historico)$/)?.[1];
  if (emailAction) return ({ editar: 'Editar modelo de e-mail', ativar: 'Revisar ativação', historico: 'Histórico do modelo' } as Record<string, string>)[emailAction];
  const clinicalTemplate = pathname.match(/^\/todos-templates\/(prescricoes|atestados)\/(novo|[^/]+\/editar)$/);
  if (clinicalTemplate) return `${clinicalTemplate[2] === 'novo' ? 'Novo' : 'Editar'} modelo de ${clinicalTemplate[1] === 'prescricoes' ? 'prescrição' : 'atestado'}`;
  if (/^\/tarefas\/[^/]+\/editar$/.test(pathname)) return 'Editar tarefa';
  const stockAction = pathname.match(/^\/estoque\/[^/]+\/(editar|entrada|saida|historico)$/)?.[1];
  if (stockAction) return ({ editar: 'Editar produto', entrada: 'Entrada de estoque', saida: 'Saída de estoque', historico: 'Histórico de movimentações' } as Record<string, string>)[stockAction];
  if (/^\/usuarios\/[^/]+\/editar$/.test(pathname)) return 'Editar usuário';
  const path = pathname.replace(/\/+$/, '') || '/';
  const explicit = labelsByPath[path] || labelsByMenuPath[path];
  if (explicit) return explicit;
  if (/^\/retornos\/[^/]+\/agendar$/.test(path)) return 'Agendar ou remarcar retorno';
  if (/^\/convenios\/[^/]+\/editar$/.test(path)) return 'Editar convênio';
  if (/^\/convenios\/[^/]+\/exames$/.test(path)) return 'Tabela de exames';
  if (/^\/convenios\/[^/]+\/exames\/novo$/.test(path)) return 'Novo exame na tabela';
  if (/^\/convenios\/[^/]+\/exames\/[^/]+\/editar$/.test(path)) return 'Editar exame na tabela';
  if (/^\/agenda\/[^/]+\/editar$/.test(path)) return 'Editar consulta';
  if (/^\/pacientes\/[^/]+\/editar$/.test(path)) return 'Editar paciente';
  if (/^\/pacientes\/[^/]+$/.test(path)) return 'Ficha do paciente';
  if (/^\/atestados\/[^/]+$/.test(path)) return 'Detalhes do atestado';
  if (/^\/encaminhamentos\/[^/]+$/.test(path)) return 'Detalhes do encaminhamento';
  if (/^\/precos-servicos\/tipos\/[^/]+\/editar$/.test(path)) return 'Editar tipo de consulta';
  if (/^\/equipe\/medicos\/[^/]+\/editar$/.test(path)) return 'Editar médico';
  if (/^\/equipe\/funcionarios\/[^/]+\/editar$/.test(path)) return 'Editar funcionário';
  if (/^\/equipe\/medicos\/[^/]+\/disponibilidade$/.test(path)) return 'Disponibilidade';
  if (/^\/equipe\/medicos\/[^/]+$/.test(path)) return 'Perfil do médico';
  if (/^\/precos-servicos\/exames\/convenios\/[^/]+\/editar$/.test(path)) return 'Editar preço';
  if (/^\/precos-servicos\/tipos\/[^/]+\/precos$/.test(path)) return 'Preços por convênio';
  if (/^\/gestao-fluxo\/salas\/[^/]+\/editar$/.test(path)) return 'Editar sala ou leito';
  if (/^\/exames\/laboratorios\/[^/]+\/editar$/.test(path)) return 'Editar laboratório';
  if (/^\/exames\/[^/]+\/resultado$/.test(path)) return 'Lançar resultado';
  if (/^\/exames\/[^/]+$/.test(path)) return 'Detalhes do exame';
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
