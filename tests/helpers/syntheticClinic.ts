import type { Page, Route } from '@playwright/test';
import { pacienteCorresponde } from '../../src/lib/buscaPaciente';

const TEST_USER_ID = '00000000-0000-4000-8000-000000000001';
const TEST_CLINIC_ID = '00000000-0000-4000-8000-000000000002';
const TEST_PATIENT_ID = '00000000-0000-4000-8000-000000000004';
const TEST_EMAIL = 'qa-admin@elolab.test';
const LOCAL_SUPABASE_ORIGIN = 'http://127.0.0.1:54321';
type SyntheticClinicOptions = {
  appOrigin?: string;
  today?: string;
  authenticated?: boolean;
  role?: string;
  platformAdmin?: boolean;
  platformOnly?: boolean;
  receptionPopulated?: boolean;
  queuePopulated?: boolean;
  queueTriagePending?: boolean;
  labPopulated?: boolean;
  employeesPopulated?: boolean;
  employeeWithoutRoles?: boolean;
  prontuarioPopulated?: boolean;
  receptionOverdue?: boolean;
  agendaPopulated?: boolean;
  waitingListPopulated?: boolean;
  analyticsPopulated?: boolean;
  retornosPopulated?: boolean;
  accountsPopulated?: boolean;
  conveniosPopulated?: boolean;
  checkoutPlanSlug?: string;
  includePlanCatalog?: boolean;
  trialSubscription?: boolean;
  ultraPlan?: boolean;
  manageDoctors?: boolean;
  highContrast?: boolean;
  personalTaskQueuePopulated?: boolean;
};

function base64Url(value: string) {
  return btoa(value).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function syntheticSession(options: SyntheticClinicOptions = {}) {
  const now = Math.floor(Date.now() / 1000);
  const accessToken = [
    base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' })),
    base64Url(JSON.stringify({
      sub: TEST_USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      session_id: '00000000-0000-4000-8000-000000000005',
      email: TEST_EMAIL,
      iat: now,
      exp: now + 3600,
    })),
    'synthetic-test-signature',
  ].join('.');

  return {
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: now + 3600,
    refresh_token: 'synthetic-local-refresh-token',
    user: {
      id: TEST_USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email: TEST_EMAIL,
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {
        nome: 'Conta QA sintética',
        ...(options.checkoutPlanSlug ? {
          checkout_flow: 'saas_subscription',
          checkout_plan_slug: options.checkoutPlanSlug,
        } : {}),
      },
      identities: [],
      created_at: new Date(now * 1000).toISOString(),
    },
  };
}

async function json(route: Route, data: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'content-range': '0-0/1' },
    body: JSON.stringify(data),
  });
}

/** Instala sessão de clínica sintética e intercepta todas as chamadas ao backend local. */
export async function installSyntheticClinic(page: Page, options: SyntheticClinicOptions = {}) {
  const writes: string[] = [];
  const requests: string[] = [];
  let syntheticPreferences = {
    density: 'comfortable',
    high_contrast: options.highContrast ?? false,
    text_size: 'normal',
    start_page: '/dashboard',
    date_format: 'DD/MM/YYYY',
    browser_notifications: false,
    email_daily_summary: false,
  };
  const appOrigin = options.appOrigin ?? 'http://127.0.0.1:4173';
  const todaySaoPaulo = options.today ?? new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const overdueReturnDate = new Date(`${todaySaoPaulo}T12:00:00-03:00`);
  overdueReturnDate.setDate(overdueReturnDate.getDate() - 45);
  const syntheticDoctors: Array<Record<string, unknown>> = [];
  const syntheticAvailability: Array<Record<string, unknown>> = [];
  const syntheticInvites: Array<{ email: string; roles: string[] }> = [];
  const syntheticReturns = options.retornosPopulated ? [{
    id: '00000000-0000-4000-9000-000000000050',
    paciente_id: TEST_PATIENT_ID,
    medico_id: '00000000-0000-4000-8000-000000000003',
    data_retorno_prevista: overdueReturnDate.toISOString().slice(0, 10),
    data_consulta_origem: overdueReturnDate.toISOString().slice(0, 10),
    status: 'pendente',
    motivo: 'Retorno para reavaliar a resposta ao tratamento inicial e a persistência da dor, revisar os efeitos relatados pela pessoa e definir os próximos passos do acompanhamento clínico.',
    tipo_retorno: 'retorno',
    lembrete_enviado: false,
    observacoes: null,
    agendamento_id: null,
    agendamento_retorno_id: null,
    clinica_id: TEST_CLINIC_ID,
  }] : [];
  const syntheticProntuarios = options.prontuarioPopulated ? [
    {
      id: '00000000-0000-4000-9000-000000000101', clinica_id: TEST_CLINIC_ID,
      paciente_id: TEST_PATIENT_ID, medico_id: '00000000-0000-4000-8000-000000000003',
      pacientes: { nome: 'Pessoa Exemplo QA', nome_social: null },
      agendamento_id: null, data: todaySaoPaulo, queixa_principal: 'Cefaleia recorrente há três dias',
      historia_doenca_atual: 'Dor latejante, sem sinais neurológicos focais. Dados exclusivamente sintéticos.',
      historia_patologica_pregressa: 'Sem condições relevantes informadas.', historia_familiar: 'Sem histórico familiar relevante.',
      historia_social: 'Registro de demonstração para QA.', revisao_sistemas: 'Sem alterações adicionais.',
      alergias_relatadas: 'Dipirona', medicamentos_em_uso: 'Paracetamol 750 mg se necessário',
      exames_fisicos: 'Paciente alerta, orientada, sem déficits focais.', hipotese_diagnostica: 'Cefaleia tensional',
      conduta: 'Hidratação, repouso e retorno se houver piora.', sinais_vitais: { pressao_sistolica: 122, pressao_diastolica: 78, frequencia_cardiaca: 72, temperatura: 36.7, saturacao: 98 },
      diagnostico_principal: 'R51 — Cefaleia', diagnosticos_secundarios: [], plano_terapeutico: 'Acompanhamento clínico.',
      assinado: true, assinado_em: new Date().toISOString(), assinado_por: TEST_USER_ID, crm_assinante: '000000/SP',
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      medicos: { nome: 'Dra. Marina Ribeiro', crm: '000000', especialidade: 'Clínica geral' },
    },
    {
      id: '00000000-0000-4000-9000-000000000102', clinica_id: TEST_CLINIC_ID,
      paciente_id: TEST_PATIENT_ID, medico_id: '00000000-0000-4000-8000-000000000003',
      pacientes: { nome: 'Pessoa Exemplo QA', nome_social: null },
      agendamento_id: null, data: new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10), queixa_principal: 'Consulta de acompanhamento',
      historia_doenca_atual: 'Evolução estável no cenário sintético.', exames_fisicos: 'Sem alterações relevantes.',
      conduta: 'Manter acompanhamento.', medicamentos_em_uso: null, sinais_vitais: {},
      diagnostico_principal: 'Z00 — Exame geral', diagnosticos_secundarios: [], plano_terapeutico: 'Reavaliar conforme necessidade.',
      assinado: true, assinado_em: new Date(Date.now() - 14 * 86400000).toISOString(), assinado_por: TEST_USER_ID, crm_assinante: '000000/SP',
      created_at: new Date(Date.now() - 14 * 86400000).toISOString(), updated_at: new Date(Date.now() - 14 * 86400000).toISOString(),
      medicos: { nome: 'Dra. Marina Ribeiro', crm: '000000', especialidade: 'Clínica geral' },
    },
  ] : [];
  const syntheticPrescriptions = options.prontuarioPopulated ? [{
    id: '00000000-0000-4000-9000-000000000111',
    prontuario_id: '00000000-0000-4000-9000-000000000101',
    paciente_id: TEST_PATIENT_ID, medico_id: '00000000-0000-4000-8000-000000000003',
    tipo: 'simples', medicamento: 'Paracetamol 750 mg', dosagem: '750 mg',
    posologia: '1 comprimido a cada 8 horas se necessário', quantidade: '9', duracao: '3 dias',
    observacoes: 'Uso sintético de demonstração.', data_emissao: todaySaoPaulo,
  }] : [];
  const dateOffset = (days: number) => {
    const date = new Date(`${todaySaoPaulo}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };
  const syntheticTasks = options.personalTaskQueuePopulated ? [
    {
      id: '00000000-0000-4000-9000-000000000301', clinica_id: TEST_CLINIC_ID,
      titulo: 'Confirmar retorno da pessoa QA', descricao: 'Confirmar horário e canal de retorno.',
      status: 'pendente', prioridade: 'alta', categoria: 'Agenda',
      data_vencimento: dateOffset(-1), paciente_id: TEST_PATIENT_ID,
      responsavel_id: TEST_USER_ID, criado_por: TEST_USER_ID, updated_at: '2026-10-13T12:00:00Z',
    },
    {
      id: '00000000-0000-4000-9000-000000000302', clinica_id: TEST_CLINIC_ID,
      titulo: 'Revisar pendência de hoje QA', descricao: null,
      status: 'em_andamento', prioridade: 'media', categoria: 'Rotina',
      data_vencimento: todaySaoPaulo, paciente_id: null,
      responsavel_id: TEST_USER_ID, criado_por: TEST_USER_ID, updated_at: '2026-10-14T12:00:00Z',
    },
    {
      id: '00000000-0000-4000-9000-000000000303', clinica_id: TEST_CLINIC_ID,
      titulo: 'Tarefa QA de outra pessoa', descricao: null,
      status: 'pendente', prioridade: 'baixa', categoria: 'Rotina',
      data_vencimento: dateOffset(2), paciente_id: null,
      responsavel_id: '00000000-0000-4000-8000-000000000099', criado_por: TEST_USER_ID, updated_at: '2026-10-14T12:00:00Z',
    },
    {
      id: '00000000-0000-4000-9000-000000000304', clinica_id: '00000000-0000-4000-8000-000000000098',
      titulo: 'Tarefa QA de outra clínica', descricao: null,
      status: 'pendente', prioridade: 'baixa', categoria: 'Rotina',
      data_vencimento: dateOffset(3), paciente_id: null,
      responsavel_id: TEST_USER_ID, criado_por: TEST_USER_ID, updated_at: '2026-10-14T12:00:00Z',
    },
  ] : [];
  const syntheticAccountRows = options.accountsPopulated ? [
    {
      id: '00000000-0000-4000-9000-000000000041', clinica_id: TEST_CLINIC_ID, tipo: 'receita',
      categoria: 'procedimento', descricao: 'Procedimento ambulatorial de complexidade intermediária com descrição longa para revisar truncamento e leitura da lista',
      paciente_id: TEST_PATIENT_ID, fornecedor: null, numero_documento: 'REC-2026-0142',
      data: todaySaoPaulo, data_emissao: dateOffset(-12), data_vencimento: dateOffset(-5), competencia: todaySaoPaulo.slice(0, 7),
      forma_pagamento: 'pix', valor: 850, valor_pago: 300, desconto: 0, acrescimo: 0,
      status: 'parcial', recorrente: false, frequencia_recorrencia: null, centro_custo: 'ambulatorio', observacoes: null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    },
    {
      id: '00000000-0000-4000-9000-000000000042', clinica_id: TEST_CLINIC_ID, tipo: 'receita',
      categoria: 'consulta', descricao: 'Consulta de retorno já recebida',
      paciente_id: TEST_PATIENT_ID, fornecedor: null, numero_documento: 'REC-2026-0143',
      data: todaySaoPaulo, data_emissao: dateOffset(-2), data_vencimento: todaySaoPaulo, competencia: todaySaoPaulo.slice(0, 7),
      forma_pagamento: 'cartao_credito', valor: 420, valor_pago: 420, desconto: 0, acrescimo: 0,
      status: 'pago', recorrente: false, frequencia_recorrencia: null, centro_custo: 'geral', observacoes: null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    },
    {
      id: '00000000-0000-4000-9000-000000000046', clinica_id: TEST_CLINIC_ID, tipo: 'receita',
      categoria: 'exame', descricao: 'Exame diagnóstico aguardando pagamento',
      paciente_id: null, fornecedor: null, numero_documento: 'REC-2026-0144',
      data: todaySaoPaulo, data_emissao: todaySaoPaulo, data_vencimento: dateOffset(1), competencia: todaySaoPaulo.slice(0, 7),
      forma_pagamento: null, valor: 280, valor_pago: 0, desconto: 0, acrescimo: 0,
      status: 'pendente', recorrente: false, frequencia_recorrencia: null, centro_custo: 'ambulatorio', observacoes: null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    },
    {
      id: '00000000-0000-4000-9000-000000000043', clinica_id: TEST_CLINIC_ID, tipo: 'despesa',
      categoria: 'fornecedores', descricao: 'Manutenção preventiva dos equipamentos de diagnóstico e climatização da unidade principal',
      paciente_id: null, fornecedor: 'Laboratório e Equipamentos Médicos São Lucas Ltda.', numero_documento: 'NF-2026-008731',
      data: todaySaoPaulo, data_emissao: dateOffset(-10), data_vencimento: dateOffset(-4), competencia: todaySaoPaulo.slice(0, 7),
      forma_pagamento: 'pix', valor: 2400, valor_pago: 800, desconto: 0, acrescimo: 0,
      status: 'parcial', recorrente: true, frequencia_recorrencia: 'mensal', centro_custo: 'geral', observacoes: null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    },
    {
      id: '00000000-0000-4000-9000-000000000044', clinica_id: TEST_CLINIC_ID, tipo: 'despesa',
      categoria: 'servicos', descricao: 'Licença mensal do prontuário externo',
      paciente_id: null, fornecedor: 'Fornecedor QA', numero_documento: 'NF-2026-008732',
      data: todaySaoPaulo, data_emissao: dateOffset(-2), data_vencimento: dateOffset(5), competencia: todaySaoPaulo.slice(0, 7),
      forma_pagamento: 'boleto', valor: 320, valor_pago: 0, desconto: 0, acrescimo: 0,
      status: 'pendente', recorrente: false, frequencia_recorrencia: null, centro_custo: 'administrativo', observacoes: null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    },
    {
      id: '00000000-0000-4000-9000-000000000045', clinica_id: TEST_CLINIC_ID, tipo: 'despesa',
      categoria: 'equipamentos', descricao: 'Material de escritório quitado',
      paciente_id: null, fornecedor: 'Papelaria QA', numero_documento: 'NF-2026-008733',
      data: todaySaoPaulo, data_emissao: dateOffset(-8), data_vencimento: dateOffset(-1), competencia: todaySaoPaulo.slice(0, 7),
      forma_pagamento: 'pix', valor: 145, valor_pago: 145, desconto: 0, acrescimo: 0,
      status: 'pago', recorrente: false, frequencia_recorrencia: null, centro_custo: 'administrativo', observacoes: null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    },
  ] : [];
  const syntheticPayments = options.accountsPopulated ? [
    {
      id: '00000000-0000-4000-9000-000000000051', clinica_id: TEST_CLINIC_ID,
      lancamento_id: '00000000-0000-4000-9000-000000000041', valor: 300, forma_pagamento: 'pix',
      data_pagamento: dateOffset(-2), observacoes: null, estornado_em: null,
      lancamentos: { tipo: 'receita', categoria: 'procedimento', clinica_id: TEST_CLINIC_ID },
    },
    {
      id: '00000000-0000-4000-9000-000000000052', clinica_id: TEST_CLINIC_ID,
      lancamento_id: '00000000-0000-4000-9000-000000000042', valor: 420, forma_pagamento: 'cartao_credito',
      data_pagamento: dateOffset(-1), observacoes: null, estornado_em: null,
      lancamentos: { tipo: 'receita', categoria: 'consulta', clinica_id: TEST_CLINIC_ID },
    },
  ] : [];
  const syntheticAppointments = options.receptionPopulated || options.queuePopulated || options.agendaPopulated || options.analyticsPopulated
    ? Array.from({ length: 7 }, (_, index) => {
      const patientId = `00000000-0000-4000-8000-${String(index + 10).padStart(12, '0')}`;
      const patientName = [
        'Ana Souza', 'Bruno Almeida', 'Carla Oliveira', 'Diego Santos',
        'Elisa Ferreira', 'Felipe Costa', 'Gabriela Lima',
      ][index];
      const horaInicio = options.receptionOverdue
        ? (() => {
          const partesHora = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
          }).formatToParts(new Date());
          const minutosAgora = Number(partesHora.find(p => p.type === 'hour')?.value || 0) * 60
            + Number(partesHora.find(p => p.type === 'minute')?.value || 0);
          const minutos = Math.min(23 * 60 + 30, Math.max(0, minutosAgora - 30) + index * 30);
          return `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;
        })()
        : `${String(8 + Math.floor(index / 2)).padStart(2, '0')}:${index % 2 ? '30' : '00'}`;
      const [horaInicioNumero, minutoInicioNumero] = horaInicio.split(':').map(Number);
      const fimEmMinutos = horaInicioNumero * 60 + minutoInicioNumero + 20;
      return {
        id: `00000000-0000-4000-9000-${String(index + 10).padStart(12, '0')}`,
        clinica_id: TEST_CLINIC_ID,
        paciente_id: patientId,
        medico_id: '00000000-0000-4000-8000-000000000003',
        sala_id: null,
        data: todaySaoPaulo,
        hora_inicio: `${horaInicio}:00`,
        hora_fim: `${String(Math.floor(fimEmMinutos / 60)).padStart(2, '0')}:${String(fimEmMinutos % 60).padStart(2, '0')}:00`,
        tipo: 'Consulta',
        status: options.analyticsPopulated
          ? index < 2 ? 'finalizado' : index === 2 ? 'faltou' : 'confirmado'
          : 'confirmado',
        pacientes: {
          id: patientId, nome: patientName, cpf: null, telefone: '(11) 90000-0000',
          convenio_id: null,
        },
        ...((options.analyticsPopulated || options.queuePopulated) ? {
          medicos: { nome: 'Dra. Marina Ribeiro', especialidade: 'Clínica geral' },
        } : {}),
      };
    })
    : [];
  const syntheticWaitingList = [
    {
      id: '00000000-0000-4000-9000-000000000061', clinica_id: TEST_CLINIC_ID,
      paciente_id: '00000000-0000-4000-8000-000000000061', medico_id: null,
      especialidade: 'Cardiologia', prioridade: 'urgente', motivo: 'Aguardando encaixe após avaliação.',
      preferencia_horario: 'Manhã', status: 'aguardando', created_at: new Date().toISOString(),
      pacientes: { nome: 'Lia Martins', nome_social: null, telefone: '0000000001' },
    },
    {
      id: '00000000-0000-4000-9000-000000000062', clinica_id: TEST_CLINIC_ID,
      paciente_id: '00000000-0000-4000-8000-000000000062', medico_id: null,
      especialidade: 'Dermatologia', prioridade: 'preferencial', motivo: 'Retorno de acompanhamento.',
      preferencia_horario: 'Tarde', status: 'aguardando', created_at: new Date(Date.now() - 60_000).toISOString(),
      pacientes: { nome: 'João Nunes', nome_social: null, telefone: '0000000002' },
    },
    {
      id: '00000000-0000-4000-9000-000000000063', clinica_id: TEST_CLINIC_ID,
      paciente_id: '00000000-0000-4000-8000-000000000063', medico_id: null,
      especialidade: 'Clínica geral', prioridade: 'normal', motivo: 'Consulta de rotina.',
      preferencia_horario: 'Qualquer horário', status: 'aguardando', created_at: new Date(Date.now() - 120_000).toISOString(),
      pacientes: { nome: 'Mariana Costa', nome_social: null, telefone: '0000000003' },
    },
  ];
  const syntheticConvenios = [
    {
      id: '00000000-0000-4000-9000-000000000071', clinica_id: TEST_CLINIC_ID,
      nome: 'Convênio QA Ativo', codigo: 'QA-ATIVO', cnpj: null, telefone: null, email: null, website: null,
      valor_consulta: 180, valor_retorno: 90, carencia: 0, ativo: true, tipo_planos: ['Ambulatorial'],
      registro_ans: '000000', codigo_operadora: 'QA', versao_tiss: '04.01.00', prazo_retorno: 30,
      taxa_glosa: 0, portal_url: null, responsavel_nome: null, responsavel_cargo: null,
      responsavel_telefone: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    },
    {
      id: '00000000-0000-4000-9000-000000000072', clinica_id: TEST_CLINIC_ID,
      nome: 'Convênio QA Inativo', codigo: 'QA-INATIVO', cnpj: null, telefone: null, email: null, website: null,
      valor_consulta: 150, valor_retorno: 75, carencia: 0, ativo: false, tipo_planos: [],
      registro_ans: null, codigo_operadora: null, versao_tiss: '04.01.00', prazo_retorno: 30,
      taxa_glosa: 0, portal_url: null, responsavel_nome: null, responsavel_cargo: null,
      responsavel_telefone: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    },
  ];
  const syntheticQueueRows = options.queuePopulated ? [
    { status: 'aguardando', prioridade: 'urgente' },
    { status: 'chamado', prioridade: 'normal' },
    { status: 'em_atendimento', prioridade: 'normal' },
    ...(options.queueTriagePending ? [
      { status: 'aguardando', prioridade: 'normal' },
      { status: 'finalizado', prioridade: 'normal' },
    ] : []),
  ].map((row, index) => {
    const appointment = syntheticAppointments[index];
    return {
      id: `00000000-0000-4000-9000-${String(index + 60).padStart(12, '0')}`,
      clinica_id: TEST_CLINIC_ID,
      agendamento_id: appointment.id,
      posicao: index + 1,
      horario_chegada: new Date(Date.now() - (index + 1) * 12 * 60_000).toISOString(),
      status: row.status,
      prioridade: row.prioridade,
      cobranca_estado: 'confirmada',
      sala_id: null,
      created_at: new Date().toISOString(),
      updated_at: row.status === 'em_atendimento' ? new Date(Date.now() - 41 * 60_000).toISOString() : new Date().toISOString(),
      agendamentos: { ...appointment, medicos: { nome: 'Dra. Marina Ribeiro', crm: '000000' } },
    };
  }) : [];
  // Timestamps anchored to noon SP today so the date-filter ("hoje") never
  // excludes them when CI runs near midnight UTC (= near midnight SP).
  const spToday = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const spNoon = (offsetMin: number) => new Date(`${spToday}T12:00:00-03:00`).getTime() + offsetMin * 60_000;
  const syntheticLabColetas = options.labPopulated ? [
    { id: '00000000-0000-4000-9000-000000000071', codigo_amostra: 'QA-UR-001', status: 'pendente', urgente: true, tipo_amostra: 'sangue', created_at: new Date(spNoon(-35)).toISOString() },
    { id: '00000000-0000-4000-9000-000000000072', codigo_amostra: 'QA-UR-002', status: 'em_analise', urgente: false, tipo_amostra: 'sangue', created_at: new Date(spNoon(-20)).toISOString() },
    { id: '00000000-0000-4000-9000-000000000073', codigo_amostra: 'QA-UR-003', status: 'validado', urgente: false, tipo_amostra: 'urina', created_at: new Date(spNoon(-5)).toISOString() },
  ].map((coleta, index) => ({
    ...coleta,
    clinica_id: TEST_CLINIC_ID,
    paciente_id: TEST_PATIENT_ID,
    medico_solicitante_id: '00000000-0000-4000-8000-000000000003',
    setor_id: '00000000-0000-4000-9000-000000000080',
    exame_id: null,
    jejum_necessario: index === 0,
    jejum_horas: index === 0 ? 8 : null,
    observacoes: 'Amostra sintética para validação visual desktop.',
    pacientes: { nome: ['Ana Souza', 'Bruno Almeida', 'Carla Oliveira'][index], cpf: '000.000.000-00', data_nascimento: '1990-05-14', sexo: 'nao_informado' },
    medicos: { nome: 'Dra. Marina Ribeiro', crm: '000000', especialidade: 'Clínica geral' },
    laboratorio_setores: { nome: 'Hematologia' },
  })) : [];

  await page.addInitScript(({ authKey, session, authenticated }) => {
    if (authenticated) localStorage.setItem(authKey, JSON.stringify(session));
    else localStorage.removeItem(authKey);
    localStorage.setItem('onboarding_done_00000000-0000-4000-8000-000000000001', 'true');
    localStorage.setItem('elolab-announcement-seen:2.0:00000000-0000-4000-8000-000000000001', 'true');
    localStorage.setItem('elolab_cookie_consent', JSON.stringify({
      necessary: true,
      analytics: false,
      marketing: false,
      functional: false,
      consentedAt: new Date().toISOString(),
      version: '1.0.0',
    }));
    localStorage.setItem('elolab_sidebar_collapsed', 'false');
    localStorage.setItem('elolab_sidebar_groups_v3', JSON.stringify(['Início', 'Atendimento', 'Pacientes', 'Clínica', 'Laboratório', 'Financeiro']));
  }, {
    authKey: 'sb-127-auth-token',
    session: syntheticSession(options),
    authenticated: options.authenticated !== false,
  });

  await page.route('**/*', async (route) => {
    const requestUrl = new URL(route.request().url());

    if (requestUrl.origin === appOrigin) {
      await route.continue();
      return;
    }

    if (requestUrl.origin !== LOCAL_SUPABASE_ORIGIN) {
      await route.abort('blockedbyclient');
      return;
    }

    const { pathname } = requestUrl;
    const method = route.request().method();
    requests.push(`${method} ${pathname}?${requestUrl.searchParams.toString()}`);

    if (method === 'HEAD' && ['/rest/v1/pacientes', '/rest/v1/agendamentos', '/rest/v1/lancamentos'].includes(pathname)) {
      const isMonthCount = requestUrl.searchParams.has('created_at');
      const populated = pathname === '/rest/v1/pacientes'
        ? options.receptionPopulated || options.queuePopulated || options.agendaPopulated || options.analyticsPopulated || options.accountsPopulated || options.prontuarioPopulated
        : pathname === '/rest/v1/agendamentos'
          ? options.receptionPopulated || options.queuePopulated || options.agendaPopulated || options.analyticsPopulated
          : options.accountsPopulated;
      const count = populated && !isMonthCount
        ? pathname === '/rest/v1/agendamentos' ? syntheticAppointments.length : 1
        : 0;
      await route.fulfill({
        status: 200,
        headers: {
          'content-range': `0-0/${count}`,
          'access-control-allow-origin': '*',
          'access-control-expose-headers': 'content-range',
        },
        body: '',
      });
      return;
    }

    const isAccountActivityHeartbeat = pathname === '/rest/v1/profiles' && method === 'PATCH'
      && (() => {
        try {
          const body = route.request().postDataJSON();
          return body && typeof body === 'object' && Object.keys(body).every(key => key === 'ultimo_acesso');
        } catch {
          return false;
        }
      })();

    if (method !== 'GET' && method !== 'HEAD' && !pathname.endsWith('/auth/v1/user') && !isAccountActivityHeartbeat) {
      const pointAction = pathname === '/functions/v1/mercadopago-point'
        ? ` action=${String(route.request().postDataJSON()?.action ?? 'unknown')}`
        : '';
      writes.push(`${requestUrl.origin} ${method} ${pathname}${pointAction}`);
    }

    if (pathname === '/auth/v1/user') {
      if (options.authenticated === false) {
        await json(route, { message: 'Invalid JWT' }, 401);
        return;
      }
      await json(route, syntheticSession(options).user);
      return;
    }

    if (method === 'GET' && pathname === '/rest/v1/agendamentos' && (options.receptionPopulated || options.queuePopulated || options.agendaPopulated || options.analyticsPopulated)) {
      // A consulta de atendimentos antigos usa data=lt.<hoje>; não deve
      // receber os registros sintéticos de hoje.
      const filters = [...requestUrl.searchParams.entries()];
      const antigos = filters.some(([key, value]) => key === 'data' && value.startsWith('lt.'));
      const requestedId = requestUrl.searchParams.get('id');
      const rows = requestedId?.startsWith('eq.') ? syntheticAppointments.filter(item => item.id === requestedId.slice(3)) : syntheticAppointments;
      await json(route, antigos ? [] : rows);
      return;
    }

    if (pathname === '/rest/v1/tarefas' && options.personalTaskQueuePopulated) {
      const filterValue = (key: string) => requestUrl.searchParams.get(key)?.replace(/^eq\./, '');
      if (method === 'GET') {
        const rows = syntheticTasks.filter((task) =>
          (!filterValue('clinica_id') || task.clinica_id === filterValue('clinica_id'))
          && (!filterValue('responsavel_id') || task.responsavel_id === filterValue('responsavel_id')));
        await json(route, rows);
        return;
      }
      if (method === 'PATCH') {
        const task = syntheticTasks.find((row) =>
          row.id === filterValue('id')
          && row.clinica_id === filterValue('clinica_id')
          && row.responsavel_id === filterValue('responsavel_id')
          && row.updated_at === filterValue('updated_at'));
        if (!task) {
          await json(route, [], 200);
          return;
        }
        const updates = route.request().postDataJSON() as { status?: string };
        if (updates.status) task.status = updates.status;
        task.updated_at = new Date().toISOString();
        await json(route, { id: task.id });
        return;
      }
    }

    if (method === 'GET' && pathname === '/rest/v1/lista_espera' && options.waitingListPopulated) {
      await json(route, syntheticWaitingList);
      return;
    }

    if (method === 'GET' && pathname === '/rest/v1/convenios' && options.conveniosPopulated) {
      await json(route, syntheticConvenios);
      return;
    }

    if (method === 'GET' && pathname === '/rest/v1/lancamentos' && options.accountsPopulated) {
      const tipo = requestUrl.searchParams.get('tipo')?.replace(/^eq\./, '');
      await json(route, syntheticAccountRows.filter((row) => !tipo || row.tipo === tipo));
      return;
    }

    if (method === 'GET' && pathname === '/rest/v1/pagamentos' && options.accountsPopulated) {
      await json(route, syntheticPayments);
      return;
    }

    if (method === 'GET' && pathname === '/rest/v1/retornos' && options.retornosPopulated) {
      await json(route, syntheticReturns);
      return;
    }

    if (method === 'GET' && pathname === '/rest/v1/prontuarios' && options.prontuarioPopulated) {
      const select = requestUrl.searchParams.get('select') || '*';
      const idFilter = requestUrl.searchParams.get('id')?.replace(/^eq\./, '');
      if (select === 'medicamentos_em_uso,sinais_vitais,data') {
        await json(route, syntheticProntuarios[0]);
      } else if (requestUrl.searchParams.get('assinado') === 'eq.false') {
        await json(route, []);
      } else if (idFilter) {
        await json(route, syntheticProntuarios.find(item => item.id === idFilter) ?? null);
      } else {
        await json(route, syntheticProntuarios);
      }
      return;
    }

    if (method === 'GET' && pathname === '/rest/v1/prescricoes' && options.prontuarioPopulated) {
      const prontuarioId = requestUrl.searchParams.get('prontuario_id')?.replace(/^eq\./, '');
      await json(route, syntheticPrescriptions.filter(prescription => !prontuarioId || prescription.prontuario_id === prontuarioId));
      return;
    }

    if (method === 'GET' && pathname === '/rest/v1/coletas_laboratorio' && options.labPopulated) {
      const idFilter = new URL(route.request().url()).searchParams.get('id');
      await json(route, idFilter?.startsWith('eq.') ? syntheticLabColetas.filter(item => item.id === idFilter.slice(3)) : syntheticLabColetas);
      return;
    }

    if (method === 'GET' && pathname === '/rest/v1/laboratorio_setores' && options.labPopulated) {
      await json(route, [{ id: '00000000-0000-4000-9000-000000000080', nome: 'Hematologia' }]);
      return;
    }

    if (method === 'GET' && pathname === '/rest/v1/medicos' && (options.receptionPopulated || options.queuePopulated || options.agendaPopulated || options.prontuarioPopulated)) {
      await json(route, [{
        id: '00000000-0000-4000-8000-000000000003', nome: 'Dra. Marina Ribeiro', crm: '000000',
        tipo_registro: 'CRM', crm_uf: 'SP', especialidade: 'Clínica geral',
        intervalo_consulta: 20, ativo: true, clinica_id: TEST_CLINIC_ID,
      }]);
      return;
    }

    if (options.manageDoctors && method === 'POST' && pathname === '/rest/v1/medicos') {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      const id = '00000000-0000-4000-8000-000000000033';
      syntheticDoctors.push({ ...payload, id, clinica_id: TEST_CLINIC_ID, updated_at: new Date().toISOString() });
      await json(route, { id }, 201);
      return;
    }

    if (options.manageDoctors && method === 'POST' && pathname === '/rest/v1/funcionarios') {
      await json(route, { id: '00000000-0000-4000-8000-000000000035' }, 201);
      return;
    }

    if (options.manageDoctors && method === 'GET' && pathname === '/rest/v1/medico_disponibilidade') {
      const medicoFilter = requestUrl.searchParams.get('medico_id');
      const medicoId = medicoFilter?.startsWith('eq.') ? medicoFilter.slice(3) : null;
      await json(route, medicoId ? syntheticAvailability.filter((row) => row.medico_id === medicoId) : syntheticAvailability);
      return;
    }

    if (options.manageDoctors && method === 'POST' && pathname === '/rest/v1/medico_disponibilidade') {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      syntheticAvailability.push({
        ...payload,
        id: '00000000-0000-4000-8000-000000000034',
      });
      await json(route, syntheticAvailability[syntheticAvailability.length - 1], 201);
      return;
    }

    if (method === 'GET' && pathname === '/rest/v1/fila_atendimento' && (options.receptionPopulated || options.queuePopulated)) {
      await json(route, options.queuePopulated ? syntheticQueueRows : []);
      return;
    }

    if (method === 'GET' && pathname === '/rest/v1/configuracoes_clinica' && requestUrl.searchParams.get('chave') === 'eq.role_customization') {
      await json(route, { valor: null });
      return;
    }

    if (pathname === '/rest/v1/profiles' && method === 'GET') {
      const profile = {
        id: TEST_USER_ID,
        nome: 'Conta QA sintética',
        email: TEST_EMAIL,
        cpf_cnpj: '52998224725',
        ativo: true,
        clinica_id: options.platformOnly ? null : TEST_CLINIC_ID,
      };
      const wantsSingleProfile = requestUrl.searchParams.get('select') === '*';
      const wantsCheckoutDocument = requestUrl.searchParams.get('select') === 'cpf_cnpj';
      await json(route, wantsSingleProfile || wantsCheckoutDocument ? profile : []);
      return;
    }

    if (pathname === '/rest/v1/user_roles' && method === 'GET') {
      await json(route, options.platformOnly ? [] : [{ role: options.role ?? 'admin' }]);
      return;
    }

    if (pathname === '/rest/v1/platform_admins' && method === 'GET') {
      if (options.platformAdmin === false) {
        await json(route, [], 406);
      } else {
        await json(route, { user_id: TEST_USER_ID, nivel: 'owner' });
      }
      return;
    }

    if (pathname === '/rest/v1/clinicas' && method === 'GET') {
      const select = requestUrl.searchParams.get('select') || '';
      const idFilter = requestUrl.searchParams.get('id') || '';
      const clinic = { id: TEST_CLINIC_ID, nome: 'Clinic QA synthetic', cnpj: null, owner_id: TEST_USER_ID, exigir_pagamento_previo: false, exigir_triagem: options.queueTriagePending ?? false };
      const isList = requestUrl.searchParams.has('arquivada') || idFilter.startsWith('in.') && select.includes('nome');
      await json(route, isList ? [clinic] : clinic);
      return;
    }

    if (pathname === '/rest/v1/assinaturas_plano' && method === 'GET') {
      await json(route, [{
        plano_slug: options.ultraPlan ? 'elolab-ultra' : 'elolab-max',
        status: options.trialSubscription ? 'trial' : 'ativa',
        em_trial: options.trialSubscription ?? false,
        trial_fim: options.trialSubscription ? new Date(Date.now() + 3 * 86400000).toISOString() : null,
        cobranca_modalidade: 'recorrente',
        data_fim: null,
        planos: { nome: options.ultraPlan ? 'EloLab Ultra' : 'EloLab Max' },
      }]);
      return;
    }

    if (pathname === '/rest/v1/planos' && method === 'GET') {
      await json(route, options.includePlanCatalog ? [
        { id: 'synthetic-pro', slug: 'elolab-max', nome: 'EloLab Pro', valor: 379, frequencia: 'mensal', trial_dias: 0, ativo: true, features: ['agenda', 'pacientes', 'prontuarios'] },
        { id: 'synthetic-ultra', slug: 'elolab-ultra', nome: 'EloLab Ultra', valor: 499, frequencia: 'mensal', trial_dias: 3, ativo: true, features: ['agenda', 'pacientes', 'prontuarios', 'agente_ia'] },
      ] : []);
      return;
    }

    if (pathname === '/rest/v1/user_preferences' && method === 'GET') {
      await json(route, syntheticPreferences);
      return;
    }

    const isPatientSearch = pathname === '/rest/v1/rpc/buscar_pacientes_paginado' && method === 'POST';
    if ((pathname === '/rest/v1/pacientes' && method === 'GET') || isPatientSearch) {
      const patient = {
        id: TEST_PATIENT_ID,
        clinica_id: TEST_CLINIC_ID,
        nome: 'Pessoa Exemplo QA',
        ativo: true,
        nome_social: null,
        cpf: '000.000.000-00',
        data_nascimento: '1990-05-14',
        telefone: '(00) 00000-0000',
        email: 'paciente.qa@example.test',
        sexo: 'nao_informado',
        estado_civil: null,
        profissao: 'Registro sintético para QA',
        tipo_sanguineo: null,
        cep: null,
        logradouro: null,
        numero: null,
        complemento: null,
        bairro: null,
        cidade: null,
        estado: null,
        convenio_id: null,
        numero_carteira: null,
        validade_carteira: null,
        alergias: options.prontuarioPopulated ? ['Dipirona'] : [],
        observacoes: 'Dados fictícios: usar apenas em testes locais.',
        foto_url: null,
        nome_responsavel: null,
        cpf_responsavel: null,
        parentesco_responsavel: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const requestedId = requestUrl.searchParams.get('id');
      const matchesPatient = !requestedId
        || requestedId === `eq.${TEST_PATIENT_ID}`
        || requestedId === `in.(${TEST_PATIENT_ID})`;
      let rows = matchesPatient ? [patient] : [];
      if (isPatientSearch) {
        const params = route.request().postDataJSON();
        rows = rows.filter(row => params.p_status !== 'inativos'
          && pacienteCorresponde(row, params.p_termo ?? ''));
        rows = rows.slice(params.p_offset ?? 0, (params.p_offset ?? 0) + (params.p_limite ?? 21));
      }
      await json(route, rows);
      return;
    }

    if (pathname === '/rest/v1/user_preferences' && method !== 'GET' && method !== 'HEAD') {
      try {
        syntheticPreferences = { ...syntheticPreferences, ...route.request().postDataJSON() };
      } catch {
        // Keep the last valid synthetic preference record if a request has no JSON body.
      }
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    if (pathname === '/rest/v1/platform_ai_config' && method === 'GET') {
      await json(route, { id: true, ativo: true, modelo_principal: 'gpt-4o-mini', modelo_fallback: null, temperatura: 0.2, max_tokens: 800, limite_mensal_clinica: 1000, prompt_base: 'Synthetic safety instructions for local testing only.', versao: 1, updated_at: new Date().toISOString() });
      return;
    }

    if (pathname.startsWith('/rest/v1/rpc/')) {
      if (pathname.endsWith('/clinica_acesso_bloqueado')) {
        await json(route, false);
      } else if (pathname.endsWith('/estado_operacional')) {
        await json(route, { bloqueio_emergencial: false, somente_leitura: false, mensagem: null });
      } else if (pathname.endsWith('/platform_ai_usage_summary')) {
        await json(route, { period_start: new Date().toISOString(), requests: 0, failed_requests: 0, input_tokens: 0, output_tokens: 0, total_tokens: 0, estimated_cost: 0 });
      } else if (pathname.endsWith('/clinic_onboarding_overview')) {
        await json(route, {
          completed_steps: 1,
          total_steps: 4,
          progress: 25,
          completed_at: null,
          steps: [
            { key: 'team', complete: true, count: 1 },
            { key: 'schedule', complete: false, count: 0 },
            { key: 'services', complete: false, count: 0 },
            { key: 'whatsapp', complete: false, count: 0 },
            { key: 'appointment', complete: false, count: 0 },
          ],
        });
      } else if (pathname.endsWith('/indicadores_produtividade')) {
        await json(route, [
          { metric_key: 'tasks_completed', label: 'Tarefas concluídas', current_value: 18, previous_value: 15, unit: 'tarefas', scope: 'Clínica' },
          { metric_key: 'appointments_completed', label: 'Atendimentos concluídos', current_value: 12, previous_value: 10, unit: 'atendimentos', scope: 'Clínica' },
          { metric_key: 'collections_completed', label: 'Coletas concluídas', current_value: 9, previous_value: 8, unit: 'coletas', scope: 'Clínica' },
          { metric_key: 'payments_received', label: 'Pagamentos recebidos', current_value: 7, previous_value: 6, unit: 'pagamentos', scope: 'Clínica' },
          { metric_key: 'payments_value', label: 'Valor recebido', current_value: 12500, previous_value: 11000, unit: 'BRL', scope: 'Clínica' },
          { metric_key: 'appointments_registered', label: 'Atendimentos registrados', current_value: 20, previous_value: 18, unit: 'atendimentos', scope: 'Clínica' },
        ]);
      } else if (pathname.endsWith('/buscar_medico_atual')) {
        await json(route, options.role === 'medico' ? [{ id: '00000000-0000-4000-8000-000000000003', nome: 'Medico QA', clinica_id: TEST_CLINIC_ID }] : []);
      } else if (pathname.endsWith('/listar_agendamentos_com_triagem') && options.queueTriagePending) {
        await json(route, syntheticAppointments.slice(0, 3).map(appointment => ({ agendamento_id: appointment.id })));
      } else if (pathname.endsWith('/resumo_pacientes_clinica')) {
        await json(route, { total: 1, com_convenio: 0, menores: 0, com_alergias: 0 });
      } else if (pathname.endsWith('/buscar_pacientes_resumo_financeiro')) {
        await json(route, options.accountsPopulated ? [{
          id: TEST_PATIENT_ID,
          nome: 'Pessoa Exemplo QA',
          nome_social: null,
          cpf: '000.000.000-00',
          telefone: '(00) 00000-0000',
          email: 'paciente.qa@example.test',
          data_nascimento: '1990-05-14',
          convenio_id: null,
        }] : []);
      } else if (pathname.endsWith('/listar_funcionarios_equipe_admin')) {
        await json(route, options.employeesPopulated ? [
          {
            id: '00000000-0000-4000-9000-000000000091', clinica_id: TEST_CLINIC_ID,
            nome: 'Mariana QA', email: 'mariana.qa@example.test', telefone: '(11) 90000-0001',
            cargo: 'Recepcionista', departamento: 'Recepção', ativo: true, user_id: null,
            pending_roles: ['recepcao'], edit_version: 1, tipo_funcionario: 'recepcionista',
            turno: 'manha', carga_horaria: 40,
          },
          {
            id: '00000000-0000-4000-9000-000000000092', clinica_id: TEST_CLINIC_ID,
            nome: 'Rafael QA', email: 'rafael.qa@example.test', telefone: null,
            cargo: 'Médico', departamento: 'Corpo clínico', ativo: false,
            user_id: TEST_USER_ID, pending_roles: ['medico'], edit_version: 1, tipo_funcionario: 'medico',
            registro_profissional: 'CRM 000000', tipo_registro: 'CRM', uf_registro: 'SP',
            especialidade: 'Clínica geral', turno: 'tarde', carga_horaria: 20,
          },
          ...(options.employeeWithoutRoles ? [{
            id: '00000000-0000-4000-9000-000000000093', clinica_id: TEST_CLINIC_ID,
            nome: 'Bruno QA sem permissao', email: 'bruno.sem-permissao@example.test',
            telefone: null, cargo: 'Auxiliar', departamento: 'Recepcao', ativo: true,
            user_id: null, pending_roles: [], edit_version: 1, tipo_funcionario: 'atendente',
            turno: 'integral', carga_horaria: 40,
          }] : []),
        ] : []);
      } else if (options.manageDoctors && pathname.endsWith('/listar_medicos_equipe_admin')) {
        await json(route, syntheticDoctors);
      } else {
        await json(route, null);
      }
      return;
    }

    if (pathname.startsWith('/auth/v1/')) {
      await json(route, {});
      return;
    }

    if (pathname.startsWith('/functions/v1/')) {
      if (options.manageDoctors && method === 'POST' && pathname === '/functions/v1/invite-employee') {
        const payload = route.request().postDataJSON() as { email?: string; roles?: string[] };
        syntheticInvites.push({ email: payload.email || '', roles: payload.roles || [] });
        await json(route, { success: true, token: 'synthetic-solo-doctor-invite', emailStatus: 'not_configured' });
        return;
      }

      if (options.manageDoctors && method === 'POST' && pathname === '/functions/v1/accept-invite') {
        const payload = route.request().postDataJSON() as { action?: string };
        if (payload.action === 'lookup') {
          await json(route, {
            success: true,
            invite: { email: TEST_EMAIL, roles: ['medico'], nome: 'Ana Médica QA', clinica_nome: 'Clinic QA synthetic' },
          });
        } else {
          await json(route, { success: true, user_id: TEST_USER_ID, clinica_id: TEST_CLINIC_ID });
        }
        return;
      }

      await json(route, {});
      return;
    }

    if (method !== 'GET' && method !== 'HEAD') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    await json(route, []);
  });

  return {
    clinicId: TEST_CLINIC_ID,
    userId: TEST_USER_ID,
    writes,
    requests,
    invites: syntheticInvites,
    assertAllWritesAreMocked() {
      // Requests só atingem o route handler local acima; nenhum Supabase remoto é configurado.
      return writes.every((entry) => entry.startsWith(`${LOCAL_SUPABASE_ORIGIN} `));
    },
  };
}
