import type { AppRole } from '@/contexts/SupabaseAuthContext';

export interface ContextualHelpLink {
  label: string;
  href: string;
  roles?: AppRole[];
}

export interface ContextualHelpEntry {
  title: string;
  summary: string;
  steps: string[];
  roleTips?: Partial<Record<AppRole, string>>;
  links?: ContextualHelpLink[];
}

const ALL_ROLES: AppRole[] = ['admin', 'medico', 'recepcao', 'enfermagem', 'financeiro'];

const HELP_BY_ROUTE: Record<string, ContextualHelpEntry> = {
  '/dashboard': {
    title: 'Visão geral do seu dia',
    summary: 'Acompanhe pendências e use os atalhos do seu papel para chegar ao próximo trabalho.',
    steps: ['Confira os indicadores que exigem atenção.', 'Abra o atalho relacionado à sua atividade.', 'Atualize a tela se uma alteração recente ainda não aparecer.'],
    roleTips: {
      admin: 'Revise configurações, equipe e desempenho da clínica.',
      medico: 'Priorize atendimentos e documentos clínicos pendentes.',
      recepcao: 'Priorize agenda, chegada de pacientes e fila.',
      enfermagem: 'Priorize triagens, coletas e exames pendentes.',
      financeiro: 'Priorize contas, cobranças e conciliações.',
    },
    links: [{ label: 'Ver minhas tarefas', href: '/tarefas', roles: ALL_ROLES }],
  },
  '/agenda': {
    title: 'Organizar a agenda',
    summary: 'Consulte horários, crie agendamentos e acompanhe mudanças do dia.',
    steps: ['Escolha a data e o profissional.', 'Use um horário disponível para agendar.', 'Confirme os dados antes de salvar ou alterar o status.'],
    roleTips: { recepcao: 'Confirme telefone e horário com o paciente antes de concluir.', medico: 'Use a agenda para preparar a sequência de atendimentos.' },
    links: [{ label: 'Abrir fila de atendimento', href: '/fila', roles: ['admin', 'medico', 'recepcao', 'enfermagem'] }],
  },
  '/pacientes': {
    title: 'Cadastro de pacientes',
    summary: 'Localize, cadastre e mantenha os dados administrativos do paciente atualizados.',
    steps: ['Pesquise antes de criar um novo cadastro.', 'Revise os campos obrigatórios.', 'Salve e confirme a mensagem de sucesso.'],
    roleTips: { recepcao: 'Evite cadastros duplicados pesquisando por nome e documento.', enfermagem: 'Confira se o cadastro correto está selecionado antes de registrar informações.' },
    links: [{ label: 'Ir para a agenda', href: '/agenda', roles: ['admin', 'recepcao', 'enfermagem'] }],
  },
  '/fila': {
    title: 'Fila e etapas do atendimento',
    summary: 'Acompanhe quem aguarda e mova cada atendimento somente após concluir a etapa atual.',
    steps: ['Localize o paciente e confira o status.', 'Abra a ação disponível para seu papel.', 'Confirme a mudança de etapa.'],
    roleTips: { recepcao: 'Registre a chegada antes de encaminhar.', enfermagem: 'Finalize a triagem antes de liberar para atendimento.', medico: 'Conclua o atendimento para manter a fila correta.' },
    links: [{ label: 'Ver agenda', href: '/agenda', roles: ['admin', 'medico', 'recepcao', 'enfermagem'] }],
  },
  '/documentos-clinicos': {
    title: 'Documentos clínicos',
    summary: 'Crie e acompanhe documentos vinculados ao atendimento correto.',
    steps: ['Confirme paciente e atendimento selecionados.', 'Escolha o tipo de documento.', 'Revise antes de assinar ou finalizar.'],
    roleTips: { medico: 'A assinatura ou finalização deve ocorrer apenas depois da revisão completa.' },
  },
  '/exames': {
    title: 'Solicitações e resultados de exames',
    summary: 'Acompanhe solicitações, status e resultados sem expor informações fora do fluxo autorizado.',
    steps: ['Use os filtros para encontrar a solicitação.', 'Confira paciente e exame.', 'Atualize somente a etapa que foi realmente concluída.'],
    links: [{ label: 'Abrir laboratório', href: '/laboratorio', roles: ['admin', 'medico', 'enfermagem'] }],
  },
  '/tarefas': {
    title: 'Organizar tarefas',
    summary: 'Acompanhe responsabilidades, prazos e pendências da equipe.',
    steps: ['Filtre pelas tarefas relevantes.', 'Abra a tarefa para conferir o contexto.', 'Registre a conclusão somente após executar a atividade.'],
  },
  '/financeiro': {
    title: 'Acompanhar o financeiro',
    summary: 'Consulte indicadores e acesse os fluxos de contas, pagamentos e cobranças.',
    steps: ['Defina o período correto.', 'Confira os totais e pendências.', 'Abra o módulo específico para registrar uma operação.'],
    roleTips: { financeiro: 'Confirme valor, vencimento e situação antes de baixar uma conta.' },
    links: [{ label: 'Abrir contas', href: '/contas', roles: ['admin', 'financeiro'] }],
  },
  '/configuracoes': {
    title: 'Configurar a clínica',
    summary: 'Ajuste dados e preferências que afetam o funcionamento da clínica.',
    steps: ['Escolha a seção desejada.', 'Revise o impacto da alteração.', 'Salve e confirme se o novo valor foi aplicado.'],
    roleTips: { admin: 'Faça alterações estruturais fora dos horários de maior movimento.' },
    links: [{ label: 'Primeiros passos', href: '/onboarding', roles: ['admin'] }, { label: 'Falar com o suporte', href: '/suporte', roles: ['admin'] }],
  },
  '/onboarding': {
    title: 'Primeiros passos da clínica',
    summary: 'Conclua a configuração essencial na ordem indicada para liberar um fluxo consistente.',
    steps: ['Abra a primeira etapa incompleta.', 'Conclua e valide a configuração.', 'Volte a esta tela para seguir para a próxima etapa.'],
    links: [{ label: 'Falar com o suporte', href: '/suporte', roles: ['admin'] }],
  },
};

const DEFAULT_HELP: ContextualHelpEntry = {
  title: 'Ajuda desta tela',
  summary: 'Use esta tela para consultar e atualizar informações relacionadas ao módulo atual.',
  steps: ['Confira os filtros e o período selecionado.', 'Revise os dados antes de salvar uma alteração.', 'Se algo falhar, mantenha os dados da tela e tente novamente.'],
  links: [{ label: 'Voltar ao dashboard', href: '/dashboard', roles: ALL_ROLES }],
};

export function getContextualHelp(pathname: string): ContextualHelpEntry {
  const normalized = pathname !== '/' ? pathname.replace(/\/$/, '') : pathname;
  if (HELP_BY_ROUTE[normalized]) return HELP_BY_ROUTE[normalized];

  const parent = Object.keys(HELP_BY_ROUTE)
    .sort((a, b) => b.length - a.length)
    .find(route => normalized.startsWith(`${route}/`));
  return parent ? HELP_BY_ROUTE[parent] : DEFAULT_HELP;
}

export function getVisibleHelpLinks(entry: ContextualHelpEntry, roles: AppRole[]) {
  return (entry.links ?? []).filter(link => !link.roles || link.roles.some(role => roles.includes(role)));
}
