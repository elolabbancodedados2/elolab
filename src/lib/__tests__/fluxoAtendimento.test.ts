import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Fluxos de atendimento nos caminhos de FALHA.
 *
 * Os testes de fluxo que existiam só verificavam que os módulos podiam ser
 * importados. O que quebra na clínica não é o import — é o segundo passo de uma
 * operação de dois passos falhando e a tela dizendo que deu tudo certo.
 */

/** Constrói um mock encadeável do supabase-js com respostas programáveis. */
function criarSupabaseMock(respostas: Record<string, any>) {
  const chamadas: Array<{ tabela: string; op: string; payload?: any }> = [];
  const filtros: Array<{ tabela: string; coluna: string; valor: unknown }> = [];

  const construirQuery = (tabela: string, op: string, payload?: any) => {
    chamadas.push({ tabela, op, payload });
    const chave = `${tabela}.${op}`;
    const resposta = respostas[chave] ?? { data: null, error: null };

    const encadeavel: any = {
      select: () => encadeavel,
      eq: (coluna: string, valor: unknown) => { filtros.push({ tabela, coluna, valor }); return encadeavel; },
      neq: () => encadeavel,
      ilike: () => encadeavel,
      gt: () => encadeavel,
      order: () => encadeavel,
      limit: () => encadeavel,
      single: () => Promise.resolve(resposta),
      maybeSingle: () => Promise.resolve(resposta),
      then: (fn: any) => Promise.resolve(resposta).then(fn),
    };
    return encadeavel;
  };

  return {
    chamadas,
    filtros,
    cliente: {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
      from: (tabela: string) => ({
        select: () => construirQuery(tabela, 'select'),
        insert: (payload: any) => construirQuery(tabela, 'insert', payload),
        update: (payload: any) => construirQuery(tabela, 'update', payload),
        delete: () => construirQuery(tabela, 'delete'),
      }),
      rpc: (nome: string, payload: any) => {
        chamadas.push({ tabela: `rpc:${nome}`, op: 'call', payload });
        return Promise.resolve(respostas[`rpc.${nome}`] ?? (nome === 'criar_cobranca_checkin_atomica'
          ? { data: 'created', error: null }
          : { data: null, error: null }));
      },
    },
  };
}

let mockAtual = criarSupabaseMock({});
vi.mock('@/integrations/supabase/client', () => ({
  get supabase() {
    return mockAtual.cliente;
  },
}));

beforeEach(() => {
  mockAtual = criarSupabaseMock({});
});

describe('progresso de exame', () => {
  it('só avança se clínica e status ainda forem os esperados', async () => {
    mockAtual = criarSupabaseMock({
      'exames.update': { data: { id: 'exame-1' }, error: null },
    });

    const { autoProgressExame } = await import('@/lib/workflowAutomation');
    const resultado = await autoProgressExame({
      exameId: 'exame-1', novoStatus: 'cancelado', statusAtual: 'solicitado',
      pacienteId: 'paciente-1', pacienteNome: 'Paciente', medicoId: null,
      tipoExame: 'Hemograma', clinicaId: 'clinica-1',
    });

    expect(resultado.success).toBe(true);
    expect(mockAtual.filtros).toContainEqual({ tabela: 'exames', coluna: 'clinica_id', valor: 'clinica-1' });
    expect(mockAtual.filtros).toContainEqual({ tabela: 'exames', coluna: 'status', valor: 'solicitado' });
  });
});

describe('cancelamento de consulta usa transicao atomica da agenda', () => {
  it('nao atualiza status e fila em chamadas separadas', async () => {
    mockAtual = criarSupabaseMock({
      'agendamentos.select': {
        data: { data: '2026-10-11', hora_inicio: '10:00', medico_id: 'med-1', paciente_id: 'pac-1', clinica_id: 'clin-1', updated_at: '2026-10-11T09:00:00Z' },
        error: null,
      },
      'rpc.alterar_status_agendamento_com_fila': {
        data: { atualizado: true, fila_removida: 0 }, error: null,
      },
    });

    const { autoCancelarAgendamento } = await import('@/lib/workflowAutomation');
    const resultado = await autoCancelarAgendamento({ agendamentoId: 'ag-1', motivo: 'cancelado' });

    expect(resultado.success).toBe(true);
    expect(mockAtual.chamadas.some(c => c.tabela === 'rpc:alterar_status_agendamento_com_fila')).toBe(true);
    expect(mockAtual.chamadas.some(c => c.tabela === 'agendamentos' && c.op === 'update')).toBe(false);
    expect(mockAtual.chamadas.some(c => c.tabela === 'fila_atendimento' && c.op === 'delete')).toBe(false);
  });
});

describe('coleta de exame urgente', () => {
  it('atualiza a coleta criada pelo banco para urgente', async () => {
    mockAtual = criarSupabaseMock({
      'coletas_laboratorio.select': { data: [{ id: 'coleta-1' }], error: null },
      'coletas_laboratorio.update': { data: { id: 'coleta-1' }, error: null },
    });

    const { autoCreateColeta } = await import('@/lib/workflowAutomation');
    const resultado = await autoCreateColeta({
      exameId: 'exame-1', pacienteId: 'paciente-1', medicoId: 'medico-1',
      tipoExame: 'Hemograma Completo', urgente: true, clinicaId: 'clinica-1',
    });

    expect(resultado.success).toBe(true);
    expect(mockAtual.chamadas).toContainEqual({
      tabela: 'coletas_laboratorio', op: 'update', payload: { urgente: true },
    });
  });
});

describe('check-in usa a transicao atomica do banco', () => {
  it('chama a RPC e nao insere fila ou atualiza agenda diretamente', async () => {
    mockAtual = criarSupabaseMock({
      'rpc.realizar_checkin': {
        data: { repetido: false, fila_id: 'fila-1', status_agendamento: 'aguardando' },
        error: null,
      },
    });

    const { autoCheckin } = await import('@/lib/workflowAutomation');
    const result = await autoCheckin('ag-1', 'clinica-1');

    expect(result.success).toBe(true);
    const checkin = mockAtual.chamadas.find(c => c.tabela === 'rpc:realizar_checkin');
    expect(checkin?.payload).toEqual({ p_agendamento_id: 'ag-1', p_prioridade: 'normal' });
    expect(mockAtual.chamadas.some(c => c.tabela === 'fila_atendimento' && c.op === 'insert')).toBe(false);
    expect(mockAtual.chamadas.some(c => c.tabela === 'agendamentos' && c.op === 'update')).toBe(false);
  });

  it('reconhece check-in repetido sem criar outra entrada', async () => {
    mockAtual = criarSupabaseMock({
      'rpc.realizar_checkin': {
        data: { repetido: true, fila_id: 'fila-existente', status_agendamento: 'aguardando' },
        error: null,
      },
    });

    const { autoCheckin } = await import('@/lib/workflowAutomation');
    const result = await autoCheckin('ag-1');

    expect(result.success).toBe(true);
    expect(result.message).toContain('fila');
  });

  it('mant?m a prioridade da triagem ao entrar pela RPC', async () => {
    mockAtual = criarSupabaseMock({
      'fila_atendimento.select': { data: [], error: null },
      'rpc.realizar_checkin': {
        data: { repetido: false, fila_id: 'fila-1', status_agendamento: 'aguardando' },
        error: null,
      },
    });

    const { autoTriagemParaFila } = await import('@/lib/workflowAutomation');
    const result = await autoTriagemParaFila({
      agendamentoId: 'ag-1',
      classificacaoRisco: 'vermelho',
      clinicaId: 'clin-1',
    });

    expect(result.success).toBe(true);
    expect(mockAtual.chamadas.find(c => c.tabela === 'rpc:realizar_checkin')?.payload)
      .toEqual({ p_agendamento_id: 'ag-1', p_prioridade: 'urgente' });
    expect(mockAtual.chamadas.some(c => c.tabela === 'fila_atendimento' && c.op === 'insert')).toBe(false);
  });

  it('reporta falha da RPC sem alterar a agenda ou a fila diretamente', async () => {
    mockAtual = criarSupabaseMock({
      'rpc.realizar_checkin': { data: null, error: { message: 'sem permissao' } },
    });

    const { autoCheckin } = await import('@/lib/workflowAutomation');
    const result = await autoCheckin('ag-1');

    expect(result.success).toBe(false);
    expect(mockAtual.chamadas.some(c => c.tabela === 'fila_atendimento' && c.op === 'insert')).toBe(false);
    expect(mockAtual.chamadas.some(c => c.tabela === 'agendamentos' && c.op === 'update')).toBe(false);
  });
});

describe('faturamento automático — uma cobrança por agendamento', () => {
  it('não cobra de novo quando já existe lançamento', async () => {
    mockAtual = criarSupabaseMock({
      'lancamentos.select': { data: [{ id: 'lanc-1' }], error: null },
    });

    const { createAutoBilling } = await import('@/lib/autoBilling');
    const criou = await createAutoBilling({
      agendamentoId: 'ag-1',
      pacienteId: 'pac-1',
      pacienteNome: 'Maria',
      data: '2026-08-12',
      clinicaId: 'cli-1',
    });

    expect(criou).toBe(false);
    expect(mockAtual.chamadas.some(c => c.tabela === 'lancamentos' && c.op === 'insert')).toBe(false);
  });

  it('não permite reutilizar uma cobrança cancelada como cobrança válida', async () => {
    mockAtual = criarSupabaseMock({
      'lancamentos.select': { data: [{ id: 'lanc-cancelado', valor: 100, status: 'cancelado' }], error: null },
    });
    const { createAutoBillingDetailed } = await import('@/lib/autoBilling');

    await expect(createAutoBillingDetailed({
      agendamentoId: 'ag-1', pacienteId: 'pac-1', pacienteNome: 'Maria',
      tipoConsulta: 'Consulta', data: '2026-08-14', clinicaId: 'cli-1',
    })).rejects.toThrow(/cobrança anterior.*cancelada ou estornada/i);
  });

  it('repara exame legado pela RPC protegida e confirma a linha alterada', async () => {
    mockAtual = criarSupabaseMock({
      'lancamentos.select': { data: [{ id: 'lanc-zero', valor: 0, categoria: 'exame', status: 'pendente' }], error: null },
      'configuracoes_clinica.select': {
        data: [{ valor: [{ nome: 'Hemograma completo', valor: 89.9 }] }], error: null,
      },
      'rpc.reparar_cobranca_exame_atomica': { data: true, error: null },
    });

    const { createAutoBillingDetailed } = await import('@/lib/autoBilling');
    const result = await createAutoBillingDetailed({
      agendamentoId: 'ag-1', pacienteId: 'pac-1', pacienteNome: 'Maria',
      tipoConsulta: 'exame', tipoExame: 'Hemograma completo', clinicaId: 'cli-1',
    });

    expect(result).toBe('repaired');
    expect(mockAtual.chamadas.find(c => c.tabela === 'rpc:reparar_cobranca_exame_atomica')?.payload)
      .toMatchObject({ p_lancamento_id: 'lanc-zero', p_clinica_id: 'cli-1', p_valor: 89.9 });
  });

  it('não relata exame legado corrigido se a RPC não alterou nenhuma cobrança', async () => {
    mockAtual = criarSupabaseMock({
      'lancamentos.select': { data: [{ id: 'lanc-zero', valor: 0, categoria: 'exame', status: 'pendente' }], error: null },
      'configuracoes_clinica.select': {
        data: [{ valor: [{ nome: 'Hemograma completo', valor: 89.9 }] }], error: null,
      },
      'rpc.reparar_cobranca_exame_atomica': { data: false, error: null },
    });

    const { createAutoBillingDetailed } = await import('@/lib/autoBilling');
    await expect(createAutoBillingDetailed({
      agendamentoId: 'ag-1', pacienteId: 'pac-1', pacienteNome: 'Maria',
      tipoConsulta: 'exame', tipoExame: 'Hemograma completo', clinicaId: 'cli-1',
    })).rejects.toThrow(/cobrança do exame mudou ou não pode ser corrigida/i);
  });

  it('perder a corrida para outro atendente (23505) não é tratado como erro', async () => {
    // Dois atendentes fazendo check-in ao mesmo tempo: os dois consultam, os
    // dois não acham nada, e os dois inserem. O índice único
    // lancamentos_um_por_agendamento barra o segundo — e isso é o resultado
    // desejado, não uma falha a ser gritada na tela.
    mockAtual = criarSupabaseMock({
      'lancamentos.select': { data: [], error: null },
      'tipos_consulta.select': { data: { id: 'tipo-1', nome: 'Consulta', valor_particular: 100 }, error: null },
      'rpc.criar_cobranca_checkin_atomica': { data: 'already_exists', error: null },
    });

    const { createAutoBilling } = await import('@/lib/autoBilling');
    const criou = await createAutoBilling({
      agendamentoId: 'ag-1',
      pacienteId: 'pac-1',
      pacienteNome: 'Maria',
      tipoConsulta: 'Consulta',
      data: '2026-08-12',
      clinicaId: 'cli-1',
    });

    expect(criou).toBe(false);
  });

  /**
   * Zero no catálogo é decisão da clínica; zero por ausência é esquecimento.
   * Tratar os dois como erro barrava o check-in de retorno — que é gratuito por
   * convenção no Brasil e tem 17 agendamentos na base.
   */
  it('atendimento cadastrado como gratuito não gera cobrança nem erro', async () => {
    mockAtual = criarSupabaseMock({
      'lancamentos.select': { data: [], error: null },
      'tipos_consulta.select': { data: { id: 't-retorno', nome: 'Retorno', valor_particular: 0 }, error: null },
    });

    const { createAutoBilling, createAutoBillingDetailed } = await import('@/lib/autoBilling');
    const params = {
      agendamentoId: 'ag-1', pacienteId: 'pac-1', pacienteNome: 'Maria',
      tipoConsulta: 'retorno', data: '2026-08-14', clinicaId: 'cli-1',
    };

    expect(await createAutoBillingDetailed(params)).toBe('free');
    const criou = await createAutoBilling(params);
    expect(criou).toBe(false);
    expect(
      mockAtual.chamadas.some(c => c.tabela === 'lancamentos' && c.op === 'insert'),
      'criou cobrança para atendimento gratuito',
    ).toBe(false);
  });

  it('consulta de retorno usa o item Retorno do catálogo', async () => {
    mockAtual = criarSupabaseMock({
      'lancamentos.select': { data: [], error: null },
      'tipos_consulta.select': { data: { id: 't-retorno', nome: 'Retorno', valor_particular: 0 }, error: null },
    });

    const { createAutoBilling } = await import('@/lib/autoBilling');
    const criou = await createAutoBilling({
      agendamentoId: 'ag-retorno-1', pacienteId: 'pac-1', pacienteNome: 'Maria',
      tipoConsulta: 'Consulta de retorno', data: '2026-08-26', clinicaId: 'cli-1',
    });

    expect(criou).toBe(false);
    expect(mockAtual.chamadas.some(c => c.tabela === 'lancamentos' && c.op === 'insert')).toBe(false);
  });

  it('preserva preço zero explícito mesmo com valor padrão do convênio', async () => {
    mockAtual = criarSupabaseMock({
      'lancamentos.select': { data: [], error: null },
      'tipos_consulta.select': { data: { id: 'retorno', nome: 'Retorno', valor_particular: 0 }, error: null },
      'precos_consulta_convenio.select': { data: { valor: 0 }, error: null },
      'convenios.select': { data: { valor_consulta: 150 }, error: null },
    });
    const { createAutoBilling } = await import('@/lib/autoBilling');
    expect(await createAutoBilling({
      agendamentoId: 'ag-gratis', pacienteId: 'pac-1', pacienteNome: 'Teste',
      tipoConsulta: 'Retorno', data: '2026-09-06', clinicaId: 'cli-1', convenioId: 'conv-1',
    })).toBe(false);
    expect(mockAtual.chamadas.some(c => c.tabela === 'lancamentos' && c.op === 'insert')).toBe(false);
  });

  it('tipo ausente do catálogo continua sendo erro de preço não cadastrado', async () => {
    mockAtual = criarSupabaseMock({
      'lancamentos.select': { data: [], error: null },
      'tipos_consulta.select': { data: null, error: null },
    });

    const { createAutoBilling } = await import('@/lib/autoBilling');
    await expect(createAutoBilling({
      agendamentoId: 'ag-1', pacienteId: 'pac-1', pacienteNome: 'Maria',
      tipoConsulta: 'consulta-que-ninguem-cadastrou', data: '2026-08-14', clinicaId: 'cli-1',
    })).rejects.toThrow(/preço cadastrado/i);
  });

  it('usa o preço interno do exame e não cria cobrança zerada', async () => {
    mockAtual = criarSupabaseMock({
      'lancamentos.select': { data: [], error: null },
      'configuracoes_clinica.select': {
        data: [{ valor: [{ nome: 'Hemograma completo', valor: 89.9 }] }],
        error: null,
      },
      'lancamentos.insert': { data: { id: 'lanc-exame' }, error: null },
    });

    const { createAutoBilling } = await import('@/lib/autoBilling');
    const criou = await createAutoBilling({
      agendamentoId: 'ag-exame-1',
      pacienteId: 'pac-1',
      pacienteNome: 'Maria',
      tipoConsulta: 'exame',
      tipoExame: 'Hemograma completo',
      data: '2026-08-12',
      clinicaId: 'cli-1',
    });

    expect(criou).toBe(true);
    const insercao = mockAtual.chamadas.find(c => c.tabela === 'rpc:criar_cobranca_checkin_atomica' && c.op === 'call');
    expect(insercao?.payload).toMatchObject({ p_categoria: 'exame', p_valor: 89.9 });
  });

  it('cobra o exame cadastrado mesmo quando o agendamento omite a preposição do nome', async () => {
    mockAtual = criarSupabaseMock({
      'lancamentos.select': { data: [], error: null },
      'configuracoes_clinica.select': {
        data: [{ valor: [
          { nome: 'ultrassom obstetrico 1 trimestre', valor: 85 },
          { nome: 'ultrassom transvagnal Obstetrico', valor: 149.9 },
          { nome: 'USG OBSTETRICO DE 13 SEMANAS 3º MÊS', valor: 125 },
        ] }], error: null,
      },
    });
    const { createAutoBillingDetailed } = await import('@/lib/autoBilling');

    await expect(createAutoBillingDetailed({
      agendamentoId: 'ag-exame-13', pacienteId: 'pac-1', pacienteNome: 'Paciente',
      tipoConsulta: 'exame', tipoExame: 'USG OBSTÉTRICO 13 SEMANAS', clinicaId: 'cli-1',
    })).resolves.toBe('created');
    expect(mockAtual.chamadas.find(c => c.tabela === 'rpc:criar_cobranca_checkin_atomica')?.payload)
      .toMatchObject({ p_categoria: 'exame', p_valor: 125 });
  });

  it('recusa nomes sem preposição quando ainda correspondem a mais de um preço', async () => {
    mockAtual = criarSupabaseMock({
      'configuracoes_clinica.select': {
        data: [{ valor: [
          { nome: 'USG OBSTETRICO DE 13 SEMANAS 3º MÊS', valor: 125 },
          { nome: 'USG OBSTETRICO DE 13 SEMANAS COM DOPPLER', valor: 180 },
        ] }], error: null,
      },
    });
    const { resolveExamPrice } = await import('@/lib/autoBilling');

    await expect(resolveExamPrice({ tipoExame: 'USG OBSTÉTRICO 13 SEMANAS', clinicaId: 'cli-1' }))
      .rejects.toThrow(/combina com vários preços/);
  });

  it('mantém a preferência pelo nome exato antes de ignorar preposições', async () => {
    mockAtual = criarSupabaseMock({
      'configuracoes_clinica.select': {
        data: [{ valor: [
          { nome: 'USG OBSTETRICO DE 13 SEMANAS', valor: 125 },
          { nome: 'USG OBSTETRICO 13 SEMANAS', valor: 150 },
        ] }], error: null,
      },
    });
    const { resolveExamPrice } = await import('@/lib/autoBilling');

    await expect(resolveExamPrice({ tipoExame: 'USG OBSTÉTRICO 13 SEMANAS', clinicaId: 'cli-1' }))
      .resolves.toBe(150);
  });

  it('não confunde exames com números de semanas diferentes', async () => {
    mockAtual = criarSupabaseMock({
      'configuracoes_clinica.select': {
        data: [{ valor: [{ nome: 'USG OBSTETRICO DE 13 SEMANAS 3º MÊS', valor: 125 }] }], error: null,
      },
    });
    const { resolveExamPrice } = await import('@/lib/autoBilling');

    await expect(resolveExamPrice({ tipoExame: 'USG OBSTÉTRICO 30 SEMANAS', clinicaId: 'cli-1' }))
      .rejects.toThrow(/Não há preço cadastrado/);
  });

  it('recusa exame sem preço em vez de enviar R$ 0,00 ao balcão', async () => {
    mockAtual = criarSupabaseMock({
      'lancamentos.select': { data: [], error: null },
      'configuracoes_clinica.select': { data: [], error: null },
      'tipo_exames_catalog.select': { data: [], error: null },
    });

    const { createAutoBilling } = await import('@/lib/autoBilling');
    await expect(createAutoBilling({
      agendamentoId: 'ag-exame-2',
      pacienteId: 'pac-1',
      pacienteNome: 'Maria',
      tipoConsulta: 'exame',
      tipoExame: 'Exame sem cadastro',
      data: '2026-08-12',
      clinicaId: 'cli-1',
    })).rejects.toThrow('Não há preço cadastrado');

    expect(mockAtual.chamadas.some(c => c.tabela === 'lancamentos' && c.op === 'insert')).toBe(false);
  });
  it('usa o valor de tabela quando o valor total legado está zerado', async () => {
    mockAtual = criarSupabaseMock({
      'lancamentos.select': { data: [], error: null },
      'precos_exames_convenio.select': {
        data: [{ tipo_exame: 'Raio X', valor_total: 0, valor_tabela: 75 }],
        error: null,
      },
      'lancamentos.insert': { data: { id: 'lanc-exame-legado' }, error: null },
    });

    const { createAutoBilling } = await import('@/lib/autoBilling');
    const criou = await createAutoBilling({
      agendamentoId: 'ag-exame-legado',
      pacienteId: 'pac-1',
      pacienteNome: 'Maria',
      convenioId: 'conv-1',
      tipoConsulta: 'exame',
      tipoExame: 'Raio X',
      data: '2026-08-12',
      clinicaId: 'cli-1',
    });

    expect(criou).toBe(true);
    const insercao = mockAtual.chamadas.find(c => c.tabela === 'rpc:criar_cobranca_checkin_atomica' && c.op === 'call');
    expect(insercao?.payload).toMatchObject({ p_categoria: 'exame', p_valor: 75 });
  });

  it('recusa consulta sem preço em vez de criar lançamento zerado', async () => {
    mockAtual = criarSupabaseMock({
      'lancamentos.select': { data: [], error: null },
      'tipos_consulta.select': { data: null, error: null },
    });

    const { createAutoBilling } = await import('@/lib/autoBilling');
    await expect(createAutoBilling({
      agendamentoId: 'ag-consulta-sem-preco',
      pacienteId: 'pac-1',
      pacienteNome: 'Maria',
      tipoConsulta: 'Consulta sem cadastro',
      data: '2026-08-12',
      clinicaId: 'cli-1',
    })).rejects.toThrow('Não há preço cadastrado para o tipo');

    expect(mockAtual.chamadas.some(c => c.tabela === 'lancamentos' && c.op === 'insert')).toBe(false);
  });

  it('usa o preço do tipo da clínica escolhido no agendamento, não o nome genérico', async () => {
    mockAtual = criarSupabaseMock({
      'lancamentos.select': { data: [], error: null },
      'agendamentos.select': { data: { tipo_consulta_id: 'tipo-pediatra' }, error: null },
      'tipos_consulta.select': { data: { id: 'tipo-pediatra', nome: 'PEDIATRA', valor_particular: 150 }, error: null },
    });

    const { createAutoBilling } = await import('@/lib/autoBilling');
    await createAutoBilling({
      agendamentoId: 'ag-pediatra',
      pacienteId: 'pac-1',
      pacienteNome: 'Maria',
      tipoConsulta: 'consulta',
      data: '2026-10-27',
      clinicaId: 'cli-1',
    });

    expect(mockAtual.filtros).toContainEqual({ tabela: 'tipos_consulta', coluna: 'id', valor: 'tipo-pediatra' });
    const insercao = mockAtual.chamadas.find(c => c.tabela === 'rpc:criar_cobranca_checkin_atomica');
    expect(insercao?.payload).toMatchObject({ p_valor: 150 });
  });
});

describe('finalizacao - retorno e estados operacionais', () => {
  it('delega status e retorno a uma única transacao no banco', async () => {
    mockAtual = criarSupabaseMock({
      'lancamentos.select': { data: [], error: null },
      'tipos_consulta.select': {
        data: { id: 'tipo-1', nome: 'Consulta', valor_particular: 120 },
        error: null,
      },
      'lancamentos.insert': { data: { id: 'lanc-1' }, error: null },
      'rpc.finalizar_atendimento_atomico': { data: null, error: { message: 'horario indisponivel' } },
    });

    const { autoFinalizarAtendimento } = await import('@/lib/workflowAutomation');
    const resultado = await autoFinalizarAtendimento({
      agendamentoId: 'ag-1',
      filaId: 'fila-1',
      pacienteId: 'pac-1',
      pacienteNome: 'Maria',
      medicoId: 'med-1',
      tipoConsulta: 'Consulta',
      clinicaId: 'cli-1',
      agendarRetorno: true,
      diasRetorno: 30,
    });

    expect(resultado.success).toBe(false);
    expect(resultado.message).toContain('horario indisponivel');

    const chamada = mockAtual.chamadas.find(c => c.tabela === 'rpc:finalizar_atendimento_atomico');
    expect(chamada?.payload).toEqual({
      p_agendamento_id: 'ag-1',
      p_fila_id: 'fila-1',
      p_agendar_retorno: true,
      p_dias_retorno: 30,
      p_tipo_exame: null,
    });
    expect(mockAtual.chamadas.some(c => c.tabela === 'agendamentos' && c.op === 'update')).toBe(false);
    expect(mockAtual.chamadas.some(c => c.tabela === 'fila_atendimento' && c.op === 'update')).toBe(false);
    expect(mockAtual.chamadas.some(c => c.tabela === 'retornos' && c.op === 'insert')).toBe(false);
  });

  it('escapes the patient name in the completion email and includes clinic scope', async () => {
    mockAtual = criarSupabaseMock({
      'rpc.finalizar_atendimento_atomico': {
        data: [{ status_agendamento: 'finalizado', retorno_id: null, cobranca_criada: false }], error: null,
      },
      'pacientes.select': { data: { email: 'ana@example.test' }, error: null },
      'notification_queue.insert': { data: null, error: null },
    });

    const { autoFinalizarAtendimento } = await import('@/lib/workflowAutomation');
    await autoFinalizarAtendimento({
      agendamentoId: 'ag-1',
      pacienteId: 'pac-1',
      pacienteNome: '<img src=x onerror=alert(1)>',
      medicoId: 'med-1',
      clinicaId: 'cli-1',
    });

    const notificacao = mockAtual.chamadas.find(c => c.tabela === 'notification_queue' && c.op === 'insert');
    expect(notificacao?.payload).toMatchObject({
      clinica_id: 'cli-1',
      conteudo: expect.stringContaining('&lt;img src=x onerror=alert(1)&gt;'),
    });
  });

  it('treats duplicate finalization as a no-op and does not send a second email', async () => {
    mockAtual = criarSupabaseMock({
      'rpc.finalizar_atendimento_atomico': {
        data: [{ status_agendamento: 'finalizado', retorno_id: null, cobranca_criada: false, repetido: true }], error: null,
      },
    });

    const { autoFinalizarAtendimento } = await import('@/lib/workflowAutomation');
    const resultado = await autoFinalizarAtendimento({
      agendamentoId: 'ag-1',
      pacienteId: 'pac-1',
      pacienteNome: 'Ana',
      medicoId: 'med-1',
      clinicaId: 'cli-1',
    });

    expect(resultado.success).toBe(true);
    expect(resultado.message).toContain('já estava finalizado');
    expect(mockAtual.chamadas.some(c => c.tabela === 'notification_queue')).toBe(false);
    expect(mockAtual.chamadas.some(c => c.tabela === 'pacientes')).toBe(false);
  });
});

/**
 * O caso do enunciado: o paciente pagou R$ 250 antes de entrar e levou uma
 * sutura de R$ 100 no meio da consulta. O atendimento acabou, o dinheiro não
 * entrou — e o paciente precisa aparecer no balcão, não sumir em "finalizado".
 */
describe('finalizacao - cobranca lancada durante a consulta', () => {
  const cenario = (extras: Record<string, any>) => criarSupabaseMock({
    'lancamentos.select': { data: [{ id: 'lanc-1' }], error: null },
    ...extras,
  });

  const finalizar = async () => {
    const { autoFinalizarAtendimento } = await import('@/lib/workflowAutomation');
    return autoFinalizarAtendimento({
      agendamentoId: 'ag-1',
      filaId: 'fila-1',
      pacienteId: 'pac-1',
      pacienteNome: 'Maria',
      medicoId: 'med-1',
      tipoConsulta: 'Consulta',
      clinicaId: 'cli-1',
    });
  };

  it('sobrou saldo com a trava ligada: vai para aguardando pagamento adicional', async () => {
    mockAtual = cenario({
      'rpc.finalizar_atendimento_atomico': {
        data: [{ status_agendamento: 'aguardando_pagamento_adicional', retorno_id: null }], error: null,
      },
    });

    const resultado = await finalizar();

    expect(resultado.success).toBe(true);
    expect(resultado.actions).toContain('Agendamento → Aguardando pagamento adicional');
  });

  it('saldo zerado: finaliza como sempre', async () => {
    mockAtual = cenario({
      'rpc.finalizar_atendimento_atomico': {
        data: [{ status_agendamento: 'finalizado', retorno_id: null }], error: null,
      },
    });

    const resultado = await finalizar();
    expect(resultado.actions).toContain('Agendamento → Finalizado');
    expect(resultado.actions).not.toContain('Agendamento → Aguardando pagamento adicional');
  });

  it('trava desligada: o estado novo nao aparece, nem devendo', async () => {
    // Clínica que não pediu pagamento antecipado não pode ver atendimentos
    // saindo da contagem de "finalizado" em relatório e dashboard.
    mockAtual = cenario({
      'rpc.finalizar_atendimento_atomico': {
        data: [{ status_agendamento: 'finalizado', retorno_id: null }], error: null,
      },
    });

    const resultado = await finalizar();
    expect(resultado.actions).toContain('Agendamento → Finalizado');
    expect(resultado.actions).not.toContain('Agendamento → Aguardando pagamento adicional');
  });

  it('erro na transacao não deixa a tela afirmar que finalizou', async () => {
    mockAtual = cenario({
      'rpc.finalizar_atendimento_atomico': { data: null, error: { message: 'timeout' } },
    });

    const resultado = await finalizar();
    expect(resultado.success).toBe(false);
    expect(resultado.message).toContain('demorou mais que o esperado');
  });
});

describe('dispensacao - baixa de estoque transacional', () => {
  it('usa a baixa atomica do banco e nao atualiza o saldo pela leitura da tela', async () => {
    mockAtual = criarSupabaseMock({
      'estoque.select': {
        data: {
          id: 'item-1',
          nome: 'Dipirona 500mg',
          quantidade: 10,
          quantidade_minima: 2,
        },
        error: null,
      },
      'rpc.registrar_baixa_estoque': {
        data: [{ item_id: 'item-1', quantidade_anterior: 10, quantidade_nova: 8, ja_baixado: false }],
        error: null,
      },
    });

    const { autoDispensarMedicamentos } = await import('@/lib/workflowAutomation');
    const resultado = await autoDispensarMedicamentos({
      medicamentos: [{ nome: 'Dipirona 500mg', quantidade: '2' }],
      pacienteId: 'pac-1',
      pacienteNome: 'Maria',
      prontuarioId: 'pront-1',
      userId: 'user-1',
    });

    expect(resultado.success).toBe(true);
    expect(resultado.actions).toContain('Dipirona 500mg: -2 unidade(s)');
    expect(mockAtual.chamadas.some(c => c.tabela === 'estoque' && c.op === 'update')).toBe(false);

    const chamada = mockAtual.chamadas.find(c => c.tabela === 'rpc:registrar_baixa_estoque');
    expect(chamada?.payload).toMatchObject({
      p_item_id: 'item-1',
      p_quantidade: 2,
      p_prontuario_id: 'pront-1',
      p_usuario_id: 'user-1',
    });
  });

  it('não permite baixar estoque sem prontuário vinculado', async () => {
    const { autoDispensarMedicamentos } = await import('@/lib/workflowAutomation');
    const resultado = await autoDispensarMedicamentos({
      medicamentos: [{ nome: 'Dipirona 500mg', quantidade: '2' }],
      pacienteId: 'pac-1',
      pacienteNome: 'Maria',
      prontuarioId: '',
      userId: 'user-1',
    });

    expect(resultado.success).toBe(false);
    expect(resultado.message).toContain('prontuário');
    expect(mockAtual.chamadas.some(c => c.tabela === 'rpc:registrar_baixa_estoque')).toBe(false);
  });
});
