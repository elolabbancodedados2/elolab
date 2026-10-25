import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ModuleScreen } from '../../components/ModuleScreen';
import { Badge, Button, Card, Field, ListRow, Section, StateView } from '../../components/ui';
import { colors } from '../../theme/tokens';

type DocItem = { title: string; description: string; steps?: string[]; tips?: string[] };
type DocSection = { id: string; title: string; badge?: string; content: DocItem[] };

// Copied verbatim from src/pages/Documentacao.tsx (icons/colors dropped); keep both in sync.
const docSections: DocSection[] = [
  {
    id: 'visao-geral',
    title: 'Visão Geral do Sistema',
    content: [
      {
        title: 'O que é o EloLab?',
        description: 'O EloLab é um Sistema de Gestão de Clínica Médica completo e moderno, desenvolvido para otimizar todos os processos de uma clínica — desde o agendamento de consultas até o controle financeiro e laboratorial. O sistema é acessível via navegador (Web App) e pode ser instalado como aplicativo (PWA) em celulares e tablets.',
      },
      {
        title: 'Como acessar o sistema',
        description: 'Acesse pela URL fornecida e faça login com suas credenciais. Novos usuários recebem um convite por e-mail com um link de ativação. Ao fazer login pela primeira vez, seu perfil é criado automaticamente.',
        steps: [
          'Acesse a URL do sistema no navegador',
          'Insira seu e-mail e senha na tela de login',
          'Caso seja primeiro acesso, use o código de convite recebido por e-mail',
          'Após o login, você será redirecionado ao Dashboard',
        ],
      },
      {
        title: 'Papéis de Usuário (Permissões)',
        description: 'O sistema possui um controle de acesso baseado em papéis (RBAC). Cada usuário pode ter um ou mais papéis que determinam quais módulos e funcionalidades ele pode acessar.',
        steps: [
          'Admin da clínica — Gerencia equipe, dados e configurações da clínica; recursos também dependem do plano contratado',
          'Médico — Acessa os módulos clínicos liberados para a função e para a clínica',
          'Enfermagem — Acessa os fluxos de triagem, sinais vitais, coleta e estoque conforme as permissões',
          'Recepção — Acessa os fluxos administrativos liberados para agenda, pacientes, fila e espera',
          'Financeiro — Acessa os recursos financeiros liberados para a função e para a clínica',
        ],
      },
      {
        title: 'Instalação como App (PWA)',
        description: 'Depois de entrar com uma conta autorizada, o EloLab pode mostrar um aviso flutuante de instalação quando o navegador e o dispositivo oferecem suporte. A instalação cria um atalho para abrir o sistema; os dados continuam dependendo de internet.',
        steps: [
          'Entre no EloLab pelo navegador em um dispositivo compatível',
          'Quando o aviso "Instalar EloLab" aparecer no canto inferior da tela, escolha "Instalar Agora"',
          'No iPhone ou iPad, o botão abre as instruções para usar Compartilhar > Adicionar à Tela de Início no Safari',
          'Se o aviso foi fechado, ele pode voltar depois de sete dias; também é possível procurar "Instalar aplicativo" ou "Adicionar à tela inicial" no menu do navegador',
          'Abra pelo ícone criado no dispositivo; é necessária conexão com a internet para usar os dados e as telas',
        ],
      },
    ],
  },
  {
    id: 'dashboard',
    title: 'Dashboard',
    content: [
      {
        title: 'Painel Principal',
        description: 'O Dashboard é a tela inicial do sistema e oferece uma visão geral em tempo real de toda a clínica. Apresenta cards com indicadores-chave, gráficos de evolução e resumo das atividades do dia.',
        steps: [
          'Total de pacientes cadastrados',
          'Consultas agendadas para hoje',
          'Receita do mês atual',
          'Pacientes na fila de atendimento',
          'Gráfico de consultas por período',
          'Gráfico de receita vs despesa',
        ],
        tips: [
          'Confira o período e os filtros antes de comparar indicadores',
          'Atualize a tela quando precisar consultar os dados mais recentes',
        ],
      },
    ],
  },
  {
    id: 'pacientes',
    title: 'Gestão de Pacientes',
    content: [
      {
        title: 'Cadastro de Pacientes',
        description: 'Módulo completo para gerenciar o cadastro de todos os pacientes da clínica. Permite cadastrar, editar, pesquisar e visualizar informações detalhadas.',
        steps: [
          'Clique em "Novo Paciente" para abrir o formulário de cadastro',
          'Preencha os dados pessoais: Nome, CPF, Data de Nascimento, Sexo, Telefone, E-mail',
          'Preencha o endereço: CEP, Logradouro, Número, Complemento, Bairro, Cidade, Estado',
          'Se o paciente tiver convênio, selecione o convênio e informe número e validade da carteira',
          'Adicione alergias conhecidas no campo de alergias',
          'Para menores de 18 anos, a seção "Responsável" aparece automaticamente',
          'Clique em "Salvar" para concluir o cadastro',
        ],
        tips: [
          'O campo de busca permite pesquisar por nome, CPF ou telefone',
          'A foto do paciente pode ser adicionada posteriormente',
          'O sistema calcula automaticamente a idade e exibe a seção de responsável para menores',
        ],
      },
      {
        title: 'Responsável (Menor de Idade)',
        description: 'Quando a data de nascimento indica que o paciente tem menos de 18 anos, o sistema exibe automaticamente os campos de responsável legal.',
        steps: [
          'Preencha o nome do responsável',
          'Informe o CPF do responsável',
          'Selecione o grau de parentesco (Pai, Mãe, Avô/Avó, Tio/Tia, Outro)',
        ],
      },
      {
        title: 'Consentimento LGPD',
        description: 'O sistema oferece um módulo de consentimento digital para conformidade com a Lei Geral de Proteção de Dados. Registra o aceite do paciente com data, IP e versão do termo.',
      },
      {
        title: 'Foto do Paciente',
        description: 'É possível adicionar uma foto ao perfil do paciente, que ficará visível em prontuários e na identificação rápida. As fotos são armazenadas no Supabase Storage (bucket: patient-photos).',
      },
    ],
  },
  {
    id: 'agenda',
    title: 'Agenda de Consultas',
    content: [
      {
        title: 'Visão Semanal e Listagem',
        description: 'A agenda exibe os horários disponíveis em formato de grade semanal ou lista. Permite criar, editar e gerenciar agendamentos com controle completo de status.',
        steps: [
          'Navegue entre semanas usando as setas ou clique em "Hoje" para voltar à semana atual',
          'Alterne entre modo "Grade" (visual) e "Lista" (compacto)',
          'Filtre por médico usando o seletor no topo da página',
          'Clique em um horário vazio para criar novo agendamento',
          'Clique em um agendamento existente para editá-lo',
        ],
      },
      {
        title: 'Criar Agendamento',
        description: 'Ao clicar em um slot vazio na grade, o formulário de novo agendamento é aberto com data e horário pré-preenchidos.',
        steps: [
          'Selecione o Paciente na lista',
          'Selecione o Médico responsável',
          'Escolha o Tipo (Consulta, Retorno, Exame, Procedimento)',
          'Defina o Status (Agendado, Confirmado, etc.)',
          'Opcionalmente, configure recorrência (Semanal, Quinzenal, Mensal)',
          'Adicione observações se necessário',
          'Clique em "Salvar" para confirmar',
        ],
      },
      {
        title: 'Status dos Agendamentos',
        description: 'Cada agendamento pode ter um dos seguintes status, cada um com cor visual própria:',
        steps: [
          'Agendado (azul) — Consulta marcada, aguardando confirmação',
          'Confirmado (verde) — Paciente confirmou presença',
          'Aguardando (amarelo) — Paciente chegou e aguarda atendimento',
          'Em Atendimento (roxo) — Consulta em andamento',
          'Finalizado (cinza) — Consulta concluída',
          'Cancelado (vermelho) — Consulta cancelada',
          'Faltou (laranja) — Paciente não compareceu',
        ],
      },
      {
        title: 'Bloqueio de Agenda',
        description: 'Permite bloquear horários ou dias inteiros para férias, feriados ou indisponibilidade do médico. Horários bloqueados aparecem em cinza na grade e não permitem agendamentos.',
        steps: [
          'Acesse a aba "Bloqueios" na página de Agenda',
          'Clique em "Novo Bloqueio"',
          'Selecione o médico, datas, horários e motivo',
          'Marque "Dia inteiro" se o bloqueio cobre o dia completo',
        ],
      },
      {
        title: 'Consultas Recorrentes',
        description: 'Ao criar um agendamento, é possível configurar recorrência automática. O sistema criará múltiplas consultas nos horários futuros.',
        steps: [
          'No formulário de agendamento, ative a seção "Consulta Recorrente"',
          'Escolha a frequência: Semanal, Quinzenal ou Mensal',
          'Defina o número de ocorrências (repetições)',
          'O sistema gerará automaticamente todos os agendamentos futuros',
        ],
      },
    ],
  },
  {
    id: 'fila',
    title: 'Fila de Atendimento',
    content: [
      {
        title: 'Gestão da Fila',
        description: 'Controle em tempo real dos pacientes que chegaram à clínica e aguardam atendimento. Permite organizar por prioridade e acompanhar o fluxo.',
        steps: [
          'Adicione pacientes à fila selecionando o agendamento do dia',
          'Defina a prioridade: Normal, Preferencial (idoso/gestante) ou Urgente',
          'Acompanhe o status: Aguardando, Em Triagem, Em Atendimento, Finalizado',
          'Atribua uma sala de atendimento ao paciente',
          'O Painel TV exibe a fila para os pacientes na recepção',
        ],
        tips: [
          'Pacientes com prioridade preferencial ou urgente são destacados visualmente',
          'A fila é atualizada em tempo real para todos os usuários logados',
        ],
      },
    ],
  },
  {
    id: 'prontuarios',
    title: 'Prontuário Eletrônico',
    badge: 'Clínico',
    content: [
      {
        title: 'Registro de Prontuários',
        description: 'Prontuário eletrônico completo para registro de consultas médicas. Cada consulta gera um registro vinculado ao paciente e médico.',
        steps: [
          'Selecione o paciente e médico',
          'Preencha a Queixa Principal',
          'Descreva a História da Doença Atual (HDA)',
          'Registre os Exames Físicos realizados',
          'Informe a Hipótese Diagnóstica',
          'Defina a Conduta médica',
          'Salve o prontuário',
        ],
      },
      {
        title: 'Recursos Adicionais do Prontuário',
        description: 'O prontuário integra diversos componentes clínicos especializados:',
        steps: [
          'Timeline do Paciente — Histórico cronológico de todos os atendimentos',
          'Gráfico de Sinais Vitais — Evolução de pressão, temperatura, frequência cardíaca, etc.',
          'Anexos — Upload de documentos, imagens e PDFs vinculados ao prontuário',
          'Alertas de Alergia — Exibição visual das alergias do paciente em todas as telas',
          'Protocolos Clínicos — Sugestões de condutas baseadas na condição clínica',
          'Verificação de Interações Medicamentosas — Alerta de interações entre medicamentos',
          'Impressão/PDF — Geração de prontuário completo em PDF para impressão',
        ],
      },
    ],
  },
  {
    id: 'prescricoes',
    title: 'Prescrições',
    badge: 'Clínico',
    content: [
      {
        title: 'Emissão de Receitas',
        description: 'Módulo para prescrição de medicamentos com suporte a templates reutilizáveis e impressão em PDF.',
        steps: [
          'Clique em "Nova Prescrição"',
          'Selecione o paciente e o médico',
          'Informe o medicamento, dosagem, posologia, quantidade e duração',
          'Escolha o tipo: Comum, Especial ou Antimicrobiano',
          'Adicione observações se necessário',
          'Salve e imprima em PDF se desejado',
        ],
        tips: [
          'Use Templates de prescrição para agilizar receitas frequentes',
          'O sistema gera PDFs formatados com cabeçalho da clínica',
        ],
      },
    ],
  },
  {
    id: 'atestados',
    title: 'Atestados Médicos',
    badge: 'Clínico',
    content: [
      {
        title: 'Emissão de Atestados',
        description: 'Emissão de atestados de comparecimento ou afastamento com suporte a CID-10 e impressão em PDF.',
        steps: [
          'Selecione o paciente e médico',
          'Escolha o tipo: Comparecimento ou Afastamento',
          'Para afastamento, informe o período (data início e fim) e dias',
          'Opcionalmente, adicione o CID-10 usando a busca integrada',
          'Preencha o motivo e observações',
          'Salve e gere o PDF para impressão',
        ],
      },
    ],
  },
  {
    id: 'exames',
    title: 'Exames',
    content: [
      {
        title: 'Solicitação de Exames',
        description: 'Módulo para solicitar e acompanhar exames. Possui um catálogo com mais de 140 tipos de exames categorizados por especialidade médica.',
        steps: [
          'Clique em "Solicitar Exame"',
          'Selecione o paciente e médico solicitante',
          'Escolha o tipo de exame na lista (ou adicione um tipo customizado)',
          'Adicione descrição e observações',
          'Acompanhe o status: Solicitado → Agendado → Em Andamento → Laudo Disponível',
        ],
        tips: [
          'O catálogo inclui exames de: Hematologia, Bioquímica, Hormônios, Imagem, Cardiologia e mais',
          'É possível adicionar novos tipos de exame diretamente na interface',
          'A notificação automática após liberar o resultado ainda não está conectada; confirme a comunicação com o paciente pelo canal da clínica',
        ],
      },
    ],
  },
  {
    id: 'triagem',
    title: 'Triagem (Protocolo Manchester)',
    badge: 'Clínico',
    content: [
      {
        title: 'Classificação de Risco',
        description: 'Sistema de triagem baseado no Protocolo de Manchester para classificação de risco dos pacientes.',
        steps: [
          'Selecione o paciente da fila de atendimento',
          'Registre os sinais vitais: Pressão Arterial, Temperatura, Frequência Cardíaca, SpO2, Escala de Dor',
          'Classifique a prioridade: Emergência, Muito Urgente, Urgente, Pouco Urgente, Não Urgente',
          'Registre queixa e observações',
          'Salve a triagem — o paciente é encaminhado para atendimento',
        ],
      },
    ],
  },
  {
    id: 'encaminhamentos',
    title: 'Encaminhamentos',
    badge: 'Clínico',
    content: [
      {
        title: 'Referência e Contra-referência',
        description: 'Módulo para encaminhamento de pacientes entre especialidades, com suporte a referência e contra-referência.',
        steps: [
          'Selecione o paciente e médico de origem',
          'Informe a especialidade de destino e o médico de destino (opcional)',
          'Descreva o motivo, hipótese diagnóstica e tratamento atual',
          'Defina a urgência: Normal, Urgente ou Emergência',
          'Acompanhe o status: Pendente → Agendado → Concluído / Cancelado',
          'O médico de destino pode registrar a contra-referência',
        ],
      },
    ],
  },
  {
    id: 'retornos',
    title: 'Controle de Retornos',
    content: [
      {
        title: 'Agendamento de Retornos',
        description: 'Gerencia os retornos previstos dos pacientes, permitindo acompanhar consultas de acompanhamento.',
        steps: [
          'Retornos são criados automaticamente ao usar o componente ReturnScheduler no prontuário',
          'Defina a data prevista de retorno e o tipo (Acompanhamento, Resultado de Exame, etc.)',
          'O sistema exibe retornos pendentes e permite converter em agendamento',
          'Lembretes podem ser enviados automaticamente ao paciente',
        ],
      },
    ],
  },
  {
    id: 'laboratorio',
    title: 'Laboratório',
    content: [
      {
        title: 'Painel do Laboratório',
        description: 'Worklist de amostras com controle de coleta, processamento e liberação de resultados.',
        steps: [
          'Visualize todas as coletas pendentes no painel',
          'Registre novas coletas com informações de amostra, tubo e jejum',
          'Acompanhe o status: Pendente → Coletado → Em Análise → Finalizado',
          'Amostras urgentes são destacadas visualmente',
        ],
      },
      {
        title: 'Mapa de Coleta',
        description: 'Visão consolidada de todas as amostras a serem coletadas, organizada por paciente e tipo de amostra. Permite imprimir etiquetas para identificação dos tubos.',
      },
      {
        title: 'Laudos Laboratoriais',
        description: 'Registro e liberação de resultados de exames laboratoriais com valores de referência.',
        steps: [
          'Acesse a coleta e clique em "Resultados"',
          'Registre cada parâmetro com resultado, unidade e valores de referência',
          'Valide os resultados (dupla checagem)',
          'Libere o laudo para visualização do médico solicitante',
          'Gere o laudo em PDF para impressão ou envio ao paciente',
        ],
      },
    ],
  },
  {
    id: 'financeiro',
    title: 'Módulo Financeiro',
    content: [
      {
        title: 'Visão Geral Financeira',
        description: 'Dashboard financeiro com indicadores de receita, despesa, saldo e gráficos de evolução mensal.',
      },
      {
        title: 'Contas a Receber',
        description: 'Gestão de todas as receitas da clínica: consultas, exames, procedimentos e convênios.',
        steps: [
          'Visualize pagamentos pendentes, vencidos e recebidos',
          'Filtre por status, período ou paciente',
          'Registre recebimentos com forma de pagamento',
          'Acompanhe a inadimplência',
        ],
      },
      {
        title: 'Contas a Pagar',
        description: 'Controle de despesas da clínica: aluguel, salários, materiais, fornecedores, etc.',
        steps: [
          'Cadastre novas contas a pagar com vencimento, categoria e valor',
          'Registre pagamentos efetuados',
          'Acompanhe contas vencidas e a vencer',
        ],
      },
      {
        title: 'Fluxo de Caixa',
        description: 'Visão do fluxo de entrada e saída de dinheiro por período, com gráfico de evolução e saldo acumulado.',
      },
      {
        title: 'Fechamento do atendimento e cobrança',
        description: 'A automação de faturamento não está disponível. Revise o atendimento e use o fluxo de finalização quando ele realmente ocorreu; atendimentos antigos em aberto exigem uma decisão da equipe antes de gerar cobrança.',
        steps: [
          'Confira paciente, profissional e atendimento antes de finalizar',
          'Use a tela de atendimentos em aberto para decidir se o registro antigo foi realizado ou não',
          'Confira o lançamento financeiro gerado antes de considerar a cobrança conciliada',
        ],
      },
      {
        title: 'Preços de Exames por Convênio',
        description: 'Tabela de preços diferenciados de exames por convênio, com suporte a código TUSS e valor de filme.',
      },
    ],
  },
  {
    id: 'operacional',
    title: 'Módulo Operacional',
    content: [
      {
        title: 'Médicos',
        description: 'Cadastro de médicos com CRM, especialidade e telefone. O médico pode ser vinculado a um usuário do sistema para acesso direto.',
      },
      {
        title: 'Funcionários',
        description: 'Gestão da equipe com cadastro completo, departamento, cargo e salário. Permite enviar convites de acesso ao sistema por e-mail.',
        steps: [
          'Cadastre o funcionário com dados pessoais e profissionais',
          'Clique no ícone de e-mail para enviar convite de acesso',
          'O funcionário receberá um e-mail com link para criar sua conta',
          'Ao aceitar o convite, o funcionário é vinculado automaticamente e recebe os papéis (roles) configurados',
        ],
      },
      {
        title: 'Salas e Leitos',
        description: 'Cadastro e gerenciamento de salas (consultórios, salas de exame, procedimento, triagem, espera) com controle de disponibilidade e equipamentos.',
      },
      {
        title: 'Estoque',
        description: 'Controle de estoque de materiais e medicamentos com alertas automáticos de estoque crítico.',
        steps: [
          'Cadastre itens com nome, categoria, quantidade, quantidade mínima, fornecedor e validade',
          'Registre movimentações de entrada e saída',
          'Quando a quantidade fica abaixo do mínimo, um alerta automático é gerado',
        ],
      },
      {
        title: 'Convênios',
        description: 'Cadastro de convênios/planos de saúde com valores de consulta, retorno, carência e dados de contato.',
      },
      {
        title: 'Templates',
        description: 'Templates reutilizáveis para prescrições e atestados. Agiliza a emissão de documentos clínicos frequentes.',
      },
      {
        title: 'Lista de Espera',
        description: 'Pacientes que aguardam vaga para consulta ou procedimento. Permite organizar por prioridade, especialidade e preferência de horário.',
      },
    ],
  },
  {
    id: 'administracao',
    title: 'Administração',
    badge: 'Admin',
    content: [
      {
        title: 'Analytics',
        description: 'Painel avançado com métricas de desempenho da clínica, taxa de ocupação, tempo médio de atendimento e indicadores de satisfação.',
      },
      {
        title: 'Agente IA (WhatsApp)',
        description: 'Integração com WhatsApp via Evolution API para atendimento automatizado com inteligência artificial. Disponível apenas no plano Ultra.',
        steps: [
          'Configure a conexão com o WhatsApp via Evolution API',
          'Crie agentes de atendimento com personalidade e instruções',
          'Monitore conversas e sessões ativas',
          'Acompanhe métricas de atendimento via IA',
        ],
      },
      {
        title: 'Automações',
        description: 'Consulte a lista no módulo Automações: cada rotina informa se está conectada, permite ligar ou desligar quando aplicável e mostra motivo quando ainda não está disponível.',
        steps: [
          'Revise o estado da rotina antes de depender de um envio automático',
          'Use a execução manual apenas quando a tela oferecer essa ação',
          'Confira os registros de execução e a fila para identificar falhas ou itens pendentes',
        ],
      },
      {
        title: 'Planos e Assinaturas',
        description: 'A página Planos consulta os nomes, preços, periodicidades, recursos e condições de teste atualmente cadastrados. Confira os valores e as condições no próprio checkout antes de contratar; eles podem mudar.',
      },
      {
        title: 'Configurações',
        description: 'Hub central de configurações organizado em abas:',
        steps: [
          'Dados da Clínica — Nome, CNPJ, endereço e logo',
          'Horários de Funcionamento — Configuração dos horários de atendimento',
          'Notificações — Configuração de e-mails e alertas',
          'Aparência — Tema claro/escuro e personalização visual',
          'Segurança — Configurações de senha e sessão',
          'Backup — Exportação e importação de dados em JSON',
          'Auditoria — Log completo de todas as ações realizadas no sistema',
        ],
      },
      {
        title: 'Gestão de Usuários',
        description: 'Criação e gerenciamento de usuários do sistema com atribuição de papéis (roles). Permite ativar/desativar usuários e atribuir múltiplos papéis.',
      },
    ],
  },
  {
    id: 'ferramentas',
    title: 'Ferramentas e Recursos',
    content: [
      {
        title: 'Busca Global (Ctrl+K)',
        description: 'Pressione Ctrl+K (ou Cmd+K no Mac) para abrir a busca. Ela consulta pacientes, consultas, exames, pagamentos, tarefas e documentos, além de atalhos para algumas páginas liberadas para sua função.',
      },
      {
        title: 'Atalhos de Teclado (Alt+)',
        description: 'Navegação rápida pelo teclado:',
        steps: [
          'Alt+H — Dashboard',
          'Alt+P — Pacientes',
          'Alt+A — Agenda',
          'Alt+F — Fila de atendimento',
          'Alt+R — Prontuários',
          'Alt+E — Prescrições',
          'Alt+T — Atestados',
          'Alt+X — Exames',
          'Alt+I — Estoque',
          'Alt+C — Financeiro',
          'Alt+S — Configurações',
        ],
      },
      {
        title: 'Geração de PDF',
        description: 'O sistema gera PDFs formatados para: receitas médicas, atestados, laudos laboratoriais, prontuários completos e relatórios. Todos com cabeçalho da clínica.',
      },
      {
        title: 'Exportação para Excel',
        description: 'Listas e relatórios podem ser exportados para Excel (formato .xlsx) para análises externas.',
      },
      {
        title: 'Impressão de Etiquetas',
        description: 'Geração de etiquetas de identificação para pacientes e amostras laboratoriais.',
      },
      {
        title: 'Backup e Restauração',
        description: 'Baixe e restaure arquivos JSON com as tabelas disponíveis para backup. O arquivo informa quando está incompleto; contas, papéis e trilhas de auditoria não são restaurados.',
        steps: [
          'Acesse Configurações > Backup',
          'Clique em "Exportar Backup" para baixar o arquivo JSON',
          'Para restaurar, clique em "Importar Backup" e selecione o arquivo',
          'Confira o indicador de backup completo ou parcial; não use um arquivo parcial como cópia única',
          'O arquivo fica no dispositivo usado para exportar. Guarde-o em um local protegido e confira a prévia antes de restaurar',
        ],
      },
      {
        title: 'Auditoria (Audit Trail)',
        description: 'Registro automático de todas as ações realizadas no sistema: criações, edições e exclusões. Inclui identificação do usuário, data/hora e detalhes das mudanças.',
        steps: [
          'Acesse Configurações > Auditoria',
          'Pesquise por data, usuário ou tipo de ação',
          'Visualize o diff das alterações (antes/depois)',
          'Exporte os logs em CSV ou JSON',
        ],
      },
      {
        title: 'Painel TV',
        description: 'Tela otimizada para exibição em TV/monitor na recepção da clínica. Mostra a fila de atendimento, próximos pacientes e informações gerais.',
      },
      {
        title: 'Portal do Paciente',
        description: 'Área de acesso restrito para pacientes consultarem seus agendamentos, resultados de exames e dados cadastrais via token de acesso.',
      },
      {
        title: 'Notificações do navegador',
        description: 'Com permissão concedida, o EloLab pode mostrar avisos em tempo real para agendamentos, fila prioritária e estoque enquanto o aplicativo está aberto. Os avisos do navegador não são entregues quando o aplicativo está fechado.',
      },
      {
        title: 'Tema Claro/Escuro',
        description: 'Alterne entre tema claro e escuro clicando no ícone de lua/sol no topo da tela. A preferência é salva automaticamente.',
      },
    ],
  },
  {
    id: 'seguranca',
    title: 'Segurança e Privacidade',
    content: [
      {
        title: 'Autenticação',
        description: 'O sistema utiliza autenticação segura via Supabase Auth com e-mail e senha. Sessões são gerenciadas automaticamente com timeout por inatividade.',
      },
      {
        title: 'Row Level Security (RLS)',
        description: 'O acesso aos dados combina políticas RLS no banco e permissões por papel e clínica. O que cada pessoa pode consultar ou alterar depende da função atribuída à conta.',
      },
      {
        title: 'LGPD',
        description: 'O EloLab oferece controles relacionados à privacidade, como permissões por papel, auditoria e ferramentas para solicitações de titulares. A configuração e o uso desses controles precisam refletir os processos da clínica; a presença dos recursos, sozinha, não garante conformidade legal.',
      },
      {
        title: 'Criptografia',
        description: 'A comunicação com o aplicativo usa HTTPS e o Supabase Auth gerencia as senhas. O acesso aos registros também é controlado por políticas RLS e permissões da aplicação.',
      },
    ],
  },
  {
    id: 'tecnologia',
    title: 'Stack Técnica',
    content: [
      {
        title: 'Frontend',
        description: 'React 18 + TypeScript + Vite + Tailwind CSS. Componentes UI baseados em shadcn/ui (Radix). Animações com Framer Motion. Gráficos com Recharts.',
      },
      {
        title: 'Backend',
        description: 'Supabase (PostgreSQL + Auth + Storage + Edge Functions + Realtime). Sem servidor backend tradicional — tudo serverless.',
      },
      {
        title: 'Integrações',
        description: 'Mercado Pago (pagamentos), Brevo (e-mails transacionais), Evolution API (WhatsApp), DeepSeek (IA médica).',
      },
      {
        title: 'PWA',
        description: 'Você pode instalar o EloLab como aplicativo no celular ou tablet. O acesso aos dados e às telas operacionais depende de conexão com a internet; a instalação não habilita trabalho offline.',
      },
    ],
  },
];

export default function AdminDocsScreen() {
  const [active, setActive] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const term = search.trim().toLocaleLowerCase('pt-BR');
  const has = (text: string) => text.toLocaleLowerCase('pt-BR').includes(term);
  const sections = term ? docSections.filter(s => has(s.title) || s.content.some(i => [i.title, i.description, ...(i.steps || []), ...(i.tips || [])].some(has))) : docSections;
  const current = active ? sections.find(s => s.id === active) : undefined;
  const index = current ? sections.indexOf(current) : -1;
  const prev = index > 0 ? sections[index - 1] : undefined;
  const next = index >= 0 ? sections[index + 1] : undefined;
  const topics = docSections.reduce((total, s) => total + s.content.length, 0);

  return <ModuleScreen moduleKey="admin-documentacao" title="Documentação do Sistema" subtitle={term ? `${sections.length} de ${docSections.length} módulos correspondem à busca` : `Orientações dos principais módulos e fluxos do EloLab · ${docSections.length} módulos · ${topics} tópicos`}
    action={<Button variant="secondary" icon="chatbox-ellipses-outline" label="Sugerir melhoria" onPress={() => router.push('/modules/admin-feedback' as Href)} />}>
    {current ? <>
      <Button variant="ghost" icon="list-outline" label="Todos os módulos" onPress={() => setActive(null)} />
      <View style={styles.head}><Text accessibilityRole="header" style={styles.title}>{current.title}</Text>{current.badge ? <Badge label={current.badge} tone="primary" /> : null}</View>
      <Text style={styles.muted}>{current.content.length} tópico{current.content.length === 1 ? '' : 's'}</Text>
      {current.content.map(item => <Card key={item.title} style={styles.card}>
        <Text style={styles.itemTitle}>{item.title}</Text>
        <Text style={styles.body}>{item.description}</Text>
        {item.steps?.map((step, i) => <View key={i} style={styles.step}><Text style={styles.num}>{i + 1}</Text><Text style={styles.stepText}>{step}</Text></View>)}
        {item.tips?.length ? <View style={styles.tips}><Text style={styles.tipsTitle}>DICAS</Text>{item.tips.map((tip, i) => <Text key={i} style={styles.muted}>• {tip}</Text>)}</View> : null}
      </Card>)}
      <View style={styles.nav}>{prev ? <Button variant="secondary" icon="chevron-back" label={prev.title} onPress={() => setActive(prev.id)} /> : null}{next ? <Button icon="chevron-forward" label={next.title} onPress={() => setActive(next.id)} /> : null}</View>
    </> : <>
      <Field label="Buscar" value={search} onChangeText={setSearch} placeholder="Buscar na documentação..." accessibilityLabel="Buscar em títulos, instruções e dicas da documentação" />
      {!sections.length ? <StateView icon="search-outline" title="Nenhum conteúdo corresponde à busca. Tente outro termo." message="Não encontrou o que precisava? Envie sua dúvida pelo feedback do produto." actionLabel="Limpar busca" onAction={() => setSearch('')} /> :
        <Section title={`${sections.length} de ${docSections.length} módulos`}>{sections.map(s => <ListRow key={s.id} title={s.title} meta={`${s.content.length} tópico${s.content.length === 1 ? '' : 's'}`} icon="book-outline" right={s.badge ? <Badge label={s.badge} tone="primary" /> : null} onPress={() => setActive(s.id)} />)}</Section>}
    </>}
  </ModuleScreen>;
}

const styles = StyleSheet.create({ head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }, title: { flex: 1, color: colors.ink, fontSize: 19, fontWeight: '800' }, muted: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 2 }, card: { marginTop: 12, gap: 8 }, itemTitle: { color: colors.ink, fontSize: 15, fontWeight: '700' }, body: { color: colors.muted, fontSize: 13, lineHeight: 20 }, step: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' }, num: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.primarySoft, color: colors.primary, fontSize: 11, fontWeight: '800', textAlign: 'center', lineHeight: 24 }, stepText: { flex: 1, color: colors.ink, fontSize: 13, lineHeight: 20 }, tips: { backgroundColor: colors.primarySoft, borderRadius: 12, padding: 12, gap: 4 }, tipsTitle: { color: colors.primary, fontSize: 11, fontWeight: '800', letterSpacing: 0.6 }, nav: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, marginTop: 14 } });
