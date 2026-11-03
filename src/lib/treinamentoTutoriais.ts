import type { AppRole } from '@/contexts/SupabaseAuthContext';

export type TutorialStep = { title: string; description: string; href?: string; action?: string; roles?: AppRole[] };
export type Tutorial = { key: string; title: string; description: string; minutes: number; roles: AppRole[]; steps: TutorialStep[] };

export const tutorials: Tutorial[] = [
  { key: 'rotina-diaria', title: 'Comece o dia com segurança', description: 'Veja suas prioridades e pendências sem alterar nenhum registro.', minutes: 3, roles: ['admin','medico','recepcao','enfermagem','financeiro'], steps: [
    { title: 'Leia seu painel', description: 'Os atalhos e indicadores mudam conforme a sua função. Comece pelas pendências que pedem atenção.', href: '/dashboard', action: 'Abrir dashboard' },
    { title: 'Confira as notificações', description: 'Use os filtros e marque como lido só o que você já conferiu.', href: '/notificacoes', action: 'Ver notificações' },
    { title: 'Organize as tarefas', description: 'Confira responsável, prazo e contexto antes de concluir uma tarefa.', href: '/tarefas', action: 'Abrir tarefas' },
  ]},
  { key: 'agenda-recepcao', title: 'Agenda e chegada do paciente', description: 'Siga a ordem certa: cadastro, agendamento e chegada.', minutes: 4, roles: ['admin','recepcao'], steps: [
    { title: 'Pesquise antes de cadastrar', description: 'Busque por nome e documento para não criar paciente duplicado.', href: '/pacientes', action: 'Abrir pacientes' },
    { title: 'Confirme antes de agendar', description: 'Confira paciente, profissional, data e horário antes de salvar.', href: '/agenda', action: 'Abrir agenda' },
    { title: 'Registre a chegada', description: 'Envie o paciente para a fila só depois de confirmar que ele chegou.', href: '/recepcao', action: 'Abrir recepção' },
  ]},
  { key: 'fluxo-clinico', title: 'Fluxo clínico responsável', description: 'Revise as etapas de triagem, atendimento e documentação.', minutes: 5, roles: ['admin','medico','enfermagem'], steps: [
    { title: 'Confirme a pessoa atendida', description: 'Antes de registrar qualquer dado, confira o paciente e o atendimento selecionados.' },
    { title: 'Finalize sua etapa', description: 'Avance a fila só depois de concluir e revisar a sua etapa.', href: '/fila', action: 'Abrir fila' },
    { title: 'Revise documentos', description: 'Assine ou finalize documentos clínicos só depois de revisar tudo.', href: '/documentos-clinicos', action: 'Abrir documentos', roles: ['admin', 'medico'] },
  ]},
  { key: 'financeiro-seguro', title: 'Rotina financeira confiável', description: 'Confira valores e situações antes de registrar movimentações.', minutes: 4, roles: ['admin','financeiro'], steps: [
    { title: 'Defina o período', description: 'Confirme as datas e os filtros para ler os totais corretamente.', href: '/financeiro', action: 'Abrir financeiro' },
    { title: 'Revise os dados', description: 'Confira valor, vencimento, favorecido e situação antes de dar baixa.', href: '/contas', action: 'Abrir contas' },
    { title: 'Valide o resultado', description: 'Depois de salvar, confira a mensagem de sucesso e a nova situação do registro.' },
  ]},
  { key: 'fluxo-laboratorio', title: 'Pedido, coleta e laudo', description: 'Acompanhe um exame desde o pedido até a liberação do resultado.', minutes: 4, roles: ['admin','medico','enfermagem'], steps: [
    { title: 'Confira os pedidos', description: 'Revise paciente, exames e prioridade antes de preparar a coleta.', href: '/exames', action: 'Ver solicitações' },
    { title: 'Organize a coleta', description: 'Use o mapa para conferir tubos, situação e necessidade de nova coleta.', href: '/mapa-coleta', action: 'Abrir mapa de coleta', roles: ['admin', 'enfermagem'] },
    { title: 'Acompanhe os resultados', description: 'Registre os resultados e confira se foram validados e liberados.', href: '/laudos-lab', action: 'Abrir laudos' },
  ]},
  { key: 'convenios-glosas', title: 'Convênios, lotes e glosas', description: 'Acompanhe lotes e glosas e saiba o que ainda precisa ser enviado fora do sistema.', minutes: 4, roles: ['admin','financeiro'], steps: [
    { title: 'Confira o cadastro do convênio', description: 'Revise registro ANS, versão TISS e tabela de preços antes de abrir um lote.', href: '/convenios', action: 'Abrir convênios' },
    { title: 'Registre e exporte o lote', description: 'O XML do sistema é só um resumo. Valide o arquivo no padrão exigido e envie pelo canal oficial da operadora.', href: '/faturamento-convenios', action: 'Abrir TISS e glosas' },
    { title: 'Acompanhe a glosa', description: 'Registre código, motivo e valor. Prepare o recurso e marque como enviado depois de enviá-lo pelo canal da operadora.' },
  ]},
  { key: 'repasses-medicos', title: 'Fechamento de repasses médicos', description: 'Concilie os recebimentos e registre o pagamento ao profissional.', minutes: 3, roles: ['admin','financeiro'], steps: [
    { title: 'Confira as regras', description: 'Revise se a regra de cada médico é valor fixo ou percentual antes de conciliar.', href: '/repasses-medicos', action: 'Revisar repasses' },
    { title: 'Concilie a competência', description: 'Escolha o mês e confira as receitas quitadas e o valor calculado.' },
    { title: 'Registre o pagamento', description: 'Faça a transferência fora desta tela. Depois, registre a situação no EloLab para manter a conciliação em dia.' },
  ]},
  { key: 'relatorios', title: 'Relatórios da clínica', description: 'Consulte dados de cada área e reaproveite relatórios salvos.', minutes: 3, roles: ['admin','financeiro'], steps: [
    { title: 'Explore por área', description: 'Consulte atendimento, pacientes, médicos, estoque e financeiro.', href: '/relatorios', action: 'Abrir relatórios' },
    { title: 'Reaproveite um relatório', description: 'Salve os filtros úteis e confira destinatários e frequência antes de agendar envios.', href: '/relatorios/salvos', action: 'Ver relatórios salvos' },
  ]},
  { key: 'indicadores-clinica', title: 'Indicadores da clínica', description: 'Compare períodos e acompanhe as tendências da operação e do financeiro.', minutes: 3, roles: ['admin'], steps: [
    { title: 'Defina o período', description: 'Escolha um intervalo coerente e compare com o período anterior para ver mudanças.', href: '/analytics', action: 'Abrir indicadores' },
    { title: 'Aprofunde no relatório', description: 'Para listas detalhadas e exportações por área, continue em Relatórios.', href: '/relatorios', action: 'Abrir relatórios' },
  ]},
  { key: 'caixa-diario', title: 'Caixa diário: abrir, movimentar e fechar', description: 'Controle o dinheiro do dia, do primeiro valor na gaveta ao fechamento.', minutes: 5, roles: ['admin','recepcao','financeiro'], steps: [
    { title: 'Abra o caixa', description: 'Conte o dinheiro da gaveta e informe o valor inicial. Digite 0 se a gaveta estiver vazia.', href: '/caixa-diario', action: 'Abrir caixa diário' },
    { title: 'Registre as movimentações', description: 'Use Nova venda para receber. Use Despesa, Sangria (retirada de dinheiro) e Suprimento (dinheiro colocado) para os demais casos.', href: '/caixa-diario', action: 'Abrir caixa diário' },
    { title: 'Confira antes de fechar', description: 'Receba ou confira as cobranças em aberto. Compare maquininha e Pix com o extrato.', href: '/caixa-diario', action: 'Abrir caixa diário' },
    { title: 'Feche o caixa', description: 'Conte o dinheiro da gaveta e informe o total. Se houver diferença, descreva o motivo. Depois de fechado, só quem tem permissão pode reabrir.', href: '/caixa-diario', action: 'Abrir caixa diário' },
  ]},
  { key: 'prontuario-prescricao', title: 'Prontuário e prescrição', description: 'Registre a consulta e emita receitas e atestados com segurança.', minutes: 5, roles: ['admin','medico'], steps: [
    { title: 'Escolha o paciente', description: 'Busque o paciente e confirme nome e data de nascimento antes de escrever qualquer coisa.', href: '/prontuarios', action: 'Abrir prontuários' },
    { title: 'Registre a evolução', description: 'Preencha o atendimento e salve. Use Salvar e finalizar somente quando a revisão estiver completa.' },
    { title: 'Prescreva', description: 'Confira alergias e medicamentos em uso. Revise dose e posologia antes de emitir.', href: '/documentos-clinicos/nova-prescricao', action: 'Nova prescrição' },
    { title: 'Emita atestados e encaminhamentos', description: 'Use as abas de Atestados e Encaminhamentos. Revise o texto antes de finalizar.', href: '/documentos-clinicos?tab=atestados', action: 'Abrir atestados' },
    { title: 'Combine o retorno', description: 'Use Agendar retorno no prontuário e acompanhe depois em Retornos.', href: '/retornos', action: 'Abrir retornos' },
  ]},
  { key: 'triagem-sinais-vitais', title: 'Triagem e sinais vitais', description: 'Chame o paciente, registre a triagem e acompanhe os sinais vitais.', minutes: 4, roles: ['admin','medico','enfermagem'], steps: [
    { title: 'Chame o paciente da fila', description: 'Chame só quem já fez a chegada na recepção. Confira se é o paciente certo.', href: '/fila', action: 'Abrir fila' },
    { title: 'Registre a triagem', description: 'Informe pressão arterial e queixa principal, que são obrigatórias. Escolha a classificação de risco. O sistema avisa quando um valor está fora da faixa.', href: '/triagem/nova', action: 'Nova triagem' },
    { title: 'Acompanhe os sinais vitais', description: 'Use os gráficos para ver a evolução do paciente ao longo do tempo.', href: '/vitais-graficos', action: 'Abrir sinais vitais' },
  ]},
  { key: 'agenda-profissional', title: 'Agenda e retornos do profissional', description: 'Prepare o dia de atendimentos e acompanhe os retornos.', minutes: 3, roles: ['medico','enfermagem'], steps: [
    { title: 'Veja a agenda do dia', description: 'Confira horários, pacientes e mudanças de última hora.', href: '/agenda', action: 'Abrir agenda' },
    { title: 'Acompanhe a fila', description: 'Veja quem está esperando e em que etapa cada um está.', href: '/fila', action: 'Abrir fila' },
    { title: 'Revise os retornos', description: 'Confira quem precisa voltar e peça à recepção para agendar.', href: '/retornos', action: 'Abrir retornos', roles: ['medico'] },
  ]},
  { key: 'estoque-rotina', title: 'Estoque e compras', description: 'Controle entradas, saídas e reposição de materiais e medicamentos.', minutes: 4, roles: ['admin','enfermagem'], steps: [
    { title: 'Veja o que está acabando', description: 'Confira itens com estoque baixo, validade próxima ou vencidos.', href: '/estoque', action: 'Abrir estoque' },
    { title: 'Registre entradas e saídas', description: 'Registre cada movimento no item correto. Confira a quantidade antes de salvar.', href: '/estoque', action: 'Abrir estoque' },
    { title: 'Faça o inventário', description: 'Compare a contagem física com o sistema e corrija as diferenças.', href: '/estoque/inventario', action: 'Abrir inventário' },
    { title: 'Reponha com cotação', description: 'Peça preços a fornecedores, gere o pedido e registre o recebimento para dar entrada no estoque.', href: '/compras', action: 'Abrir compras' },
  ]},
  { key: 'portal-paciente-recepcao', title: 'Portal do paciente para a recepção', description: 'Entenda o que o paciente vê no portal e como liberar o acesso com segurança.', minutes: 4, roles: ['admin','recepcao'], steps: [
    { title: 'Abra a ficha do paciente', description: 'Busque o paciente e confira nome e documento antes de gerar qualquer acesso.', href: '/pacientes', action: 'Abrir pacientes' },
    { title: 'Gere o link do portal', description: 'Na ficha, use Link do portal. O novo link cancela o anterior e vale por até um ano. Envie só ao paciente ou responsável, depois de confirmar quem é.' },
    { title: 'Explique o que ele vai ver', description: 'No portal o paciente agenda e remarca consultas, vê exames, receitas, documentos, histórico e pagamentos, e atualiza seus contatos.' },
    { title: 'Gerencie os acessos', description: 'Gere um link individual para um paciente, inclusive quando ele perder o anterior.', href: '/portal-pacientes', action: 'Abrir acesso ao portal', roles: ['admin'] },
  ]},
  { key: 'configuracao-inicial', title: 'Configuração inicial da clínica', description: 'Deixe a clínica pronta para atender, na ordem recomendada.', minutes: 6, roles: ['admin'], steps: [
    { title: 'Siga os primeiros passos', description: 'A tela mostra o que falta e atualiza o progresso conforme você cadastra.', href: '/onboarding', action: 'Abrir primeiros passos' },
    { title: 'Preencha os dados da clínica', description: 'Confira o nome e os contatos da clínica e salve.', href: '/configuracoes', action: 'Abrir configurações' },
    { title: 'Convide a equipe', description: 'Cadastre médicos e funcionários e envie os convites. Cada pessoa deve usar a própria conta.', href: '/equipe?aba=funcionarios', action: 'Abrir equipe' },
    { title: 'Defina os horários', description: 'Informe os horários da clínica e os dias e horários em que cada médico atende.', href: '/configuracoes?tab=horarios', action: 'Abrir horários' },
    { title: 'Cadastre os serviços', description: 'Crie ao menos um tipo de consulta ativo, com duração e valor.', href: '/precos-servicos?tab=tipos', action: 'Abrir serviços' },
    { title: 'Cadastre os convênios', description: 'Se a clínica atende convênio, cadastre antes de associar pacientes.', href: '/convenios', action: 'Abrir convênios' },
  ]},
  { key: 'privacidade-conta', title: 'Privacidade e segurança da conta', description: 'Proteja seus acessos e as informações sensíveis dos pacientes.', minutes: 3, roles: ['admin','medico','recepcao','enfermagem','financeiro'], steps: [
    { title: 'Use sua própria conta', description: 'Nunca compartilhe senha ou sessão. Cada ação precisa ter um autor identificado.' },
    { title: 'Confira suas permissões', description: 'Se você não deveria ver algo, avise o administrador. Não compartilhe os dados.' },
    { title: 'Proteja a sessão', description: 'Encerre a sessão ao se afastar, principalmente em computador compartilhado.', href: '/seguranca', action: 'Revisar segurança' },
  ]},
];
