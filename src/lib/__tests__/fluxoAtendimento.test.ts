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

  const construirQuery = (tabela: string, op: string, payload?: any) => {
    chamadas.push({ tabela, op, payload });
    const chave = `${tabela}.${op}`;
    const resposta = respostas[chave] ?? { data: null, error: null };

    const encadeavel: any = {
      select: () => encadeavel,
      eq: () => encadeavel,
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
        return Promise.resolve(respostas[`rpc.${nome}`] ?? { data: null, error: null });
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

describe('check-in — o paciente nunca fica marcado como aguardando fora da fila', () => {
  it('entra na fila antes de mudar o status do agendamento', async () => {
    mockAtual = criarSupabaseMock({
      'fila_atendimento.select': { data: [], error: null },
      'fila_atendimento.insert': { data: { id: 'fila-1' }, error: null },
      'agendamentos.update': { data: null, error: null },
    });

    const { autoCheckin } = await import('@/lib/workflowAutomation');
    const resultado = await autoCheckin('ag-1');

    expect(resultado.success).toBe(true);

    const ordem = mockAtual.chamadas
      .filter(c => (c.tabela === 'fila_atendimento' && c.op === 'insert')
                || (c.tabela === 'agendamentos' && c.op === 'update'))
      .map(c => `${c.tabela}.${c.op}`);

    // A fila (artefato visível no painel) precisa vir primeiro: se ela falhar,
    // nada mudou. O contrário deixava o agendamento "aguardando" sem fila.
    expect(ordem[0]).toBe('fila_atendimento.insert');
    expect(ordem[1]).toBe('agendamentos.update');
  });

  it('grava a clínica no item da fila para ele continuar visível no isolamento', async () => {
    mockAtual = criarSupabaseMock({
      'fila_atendimento.select': { data: [], error: null },
      'fila_atendimento.insert': { data: { id: 'fila-1' }, error: null },
      'agendamentos.update': { data: null, error: null },
    });

    const { autoCheckin } = await import('@/lib/workflowAutomation');
    const resultado = await autoCheckin('ag-1', 'clinica-1');

    expect(resultado.success).toBe(true);
    const insercao = mockAtual.chamadas.find(
      c => c.tabela === 'fila_atendimento' && c.op === 'insert',
    );
    expect(insercao?.payload).toMatchObject({ clinica_id: 'clinica-1' });
  });

  it('falha ao entrar na fila não mexe no agendamento', async () => {
    mockAtual = criarSupabaseMock({
      'fila_atendimento.select': { data: [], error: null },
      'fila_atendimento.insert': { data: null, error: { message: 'permissão negada' } },
    });

    const { autoCheckin } = await import('@/lib/workflowAutomation');
    const resultado = await autoCheckin('ag-1');

    expect(resultado.success).toBe(false);
    const mexeuNoAgendamento = mockAtual.chamadas.some(
      c => c.tabela === 'agendamentos' && c.op === 'update',
    );
    expect(mexeuNoAgendamento, 'agendamento foi alterado apesar da falha na fila').toBe(false);
  });

  it('falha no status desfaz a entrada na fila', async () => {
    mockAtual = criarSupabaseMock({
      'fila_atendimento.select': { data: [], error: null },
      'fila_atendimento.insert': { data: { id: 'fila-1' }, error: null },
      'agendamentos.update': { data: null, error: { message: 'permissão negada' } },
    });

    const { autoCheckin } = await import('@/lib/workflowAutomation');
    const resultado = await autoCheckin('ag-1');

    expect(resultado.success).toBe(false);

    // Sem a compensação, sobraria na fila um paciente que ninguém consegue chamar.
    const desfezFila = mockAtual.chamadas.some(
      c => c.tabela === 'fila_atendimento' && c.op === 'delete',
    );
    expect(desfezFila, 'entrada órfã ficou na fila').toBe(true);
  });

  it('paciente já na fila não é inserido de novo', async () => {
    mockAtual = criarSupabaseMock({
      'fila_atendimento.select': { data: [{ id: 'fila-existente' }], error: null },
    });

    const { autoCheckin } = await import('@/lib/workflowAutomation');
    const resultado = await autoCheckin('ag-1');

    expect(resultado.success).toBe(true);
    expect(resultado.message).toContain('já está na fila');
    expect(mockAtual.chamadas.some(c => c.op === 'insert')).toBe(false);
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

  it('perder a corrida para outro atendente (23505) não é tratado como erro', async () => {
    // Dois atendentes fazendo check-in ao mesmo tempo: os dois consultam, os
    // dois não acham nada, e os dois inserem. O índice único
    // lancamentos_um_por_agendamento barra o segundo — e isso é o resultado
    // desejado, não uma falha a ser gritada na tela.
    mockAtual = criarSupabaseMock({
      'lancamentos.select': { data: [], error: null },
      'tipos_consulta.select': { data: { id: 'tipo-1', nome: 'Consulta', valor_particular: 100 }, error: null },
      'lancamentos.insert': { data: null, error: { code: '23505', message: 'duplicate key' } },
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

    const { createAutoBilling } = await import('@/lib/autoBilling');
    const criou = await createAutoBilling({
      agendamentoId: 'ag-1', pacienteId: 'pac-1', pacienteNome: 'Maria',
      tipoConsulta: 'retorno', data: '2026-08-14', clinicaId: 'cli-1',
    });

    expect(criou).toBe(false);
    expect(
      mockAtual.chamadas.some(c => c.tabela === 'lancamentos' && c.op === 'insert'),
      'criou cobrança para atendimento gratuito',
    ).toBe(false);
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
    const insercao = mockAtual.chamadas.find(c => c.tabela === 'lancamentos' && c.op === 'insert');
    expect(insercao?.payload).toMatchObject({ categoria: 'exame', valor: 89.9 });
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
    const insercao = mockAtual.chamadas.find(c => c.tabela === 'lancamentos' && c.op === 'insert');
    expect(insercao?.payload).toMatchObject({ categoria: 'exame', valor: 75 });
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
    })).rejects.toThrow('Não há preço cadastrado para a consulta');

    expect(mockAtual.chamadas.some(c => c.tabela === 'lancamentos' && c.op === 'insert')).toBe(false);
  });
});

describe('finalizacao - retorno e estados operacionais', () => {
  it('desfaz a finalizacao se o retorno nao puder ser agendado', async () => {
    mockAtual = criarSupabaseMock({
      'fila_atendimento.select': { data: { status: 'em_atendimento' }, error: null },
      'fila_atendimento.update': { data: { id: 'fila-1' }, error: null },
      'agendamentos.update': { data: { id: 'ag-1' }, error: null },
      'lancamentos.select': { data: [], error: null },
      'tipos_consulta.select': {
        data: { id: 'tipo-1', nome: 'Consulta', valor_particular: 120 },
        error: null,
      },
      'lancamentos.insert': { data: { id: 'lanc-1' }, error: null },
      'retornos.insert': { data: null, error: { message: 'horario indisponivel' } },
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

    const atualizacoesFila = mockAtual.chamadas
      .filter(c => c.tabela === 'fila_atendimento' && c.op === 'update')
      .map(c => c.payload);
    const atualizacoesAgendamento = mockAtual.chamadas
      .filter(c => c.tabela === 'agendamentos' && c.op === 'update')
      .map(c => c.payload);

    expect(atualizacoesFila).toEqual([{ status: 'finalizado' }, { status: 'em_atendimento' }]);
    expect(atualizacoesAgendamento).toEqual([{ status: 'finalizado' }, { status: 'em_atendimento' }]);
  });
});

/**
 * O caso do enunciado: o paciente pagou R$ 250 antes de entrar e levou uma
 * sutura de R$ 100 no meio da consulta. O atendimento acabou, o dinheiro não
 * entrou — e o paciente precisa aparecer no balcão, não sumir em "finalizado".
 */
describe('finalizacao - cobranca lancada durante a consulta', () => {
  const cenario = (extras: Record<string, any>) => criarSupabaseMock({
    'fila_atendimento.select': { data: { status: 'em_atendimento' }, error: null },
    'fila_atendimento.update': { data: { id: 'fila-1' }, error: null },
    'agendamentos.update': { data: { id: 'ag-1' }, error: null },
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

  const statusGravado = () => mockAtual.chamadas
    .filter(c => c.tabela === 'agendamentos' && c.op === 'update')
    .map(c => c.payload?.status);

  it('sobrou saldo com a trava ligada: vai para aguardando pagamento adicional', async () => {
    mockAtual = cenario({
      'clinicas.select': { data: { exigir_pagamento_previo: true }, error: null },
      'rpc.saldo_devedor_do_agendamento': { data: 100, error: null },
    });

    const resultado = await finalizar();

    expect(resultado.success).toBe(true);
    expect(statusGravado()).toContain('aguardando_pagamento_adicional');
    expect(resultado.actions).toContain('Agendamento → Aguardando pagamento adicional');
  });

  it('saldo zerado: finaliza como sempre', async () => {
    mockAtual = cenario({
      'clinicas.select': { data: { exigir_pagamento_previo: true }, error: null },
      'rpc.saldo_devedor_do_agendamento': { data: 0, error: null },
    });

    await finalizar();
    expect(statusGravado()).toContain('finalizado');
    expect(statusGravado()).not.toContain('aguardando_pagamento_adicional');
  });

  it('trava desligada: o estado novo nao aparece, nem devendo', async () => {
    // Clínica que não pediu pagamento antecipado não pode ver atendimentos
    // saindo da contagem de "finalizado" em relatório e dashboard.
    mockAtual = cenario({
      'clinicas.select': { data: { exigir_pagamento_previo: false }, error: null },
      'rpc.saldo_devedor_do_agendamento': { data: 100, error: null },
    });

    await finalizar();
    expect(statusGravado()).toContain('finalizado');
    expect(statusGravado()).not.toContain('aguardando_pagamento_adicional');
  });

  it('erro ao consultar o saldo nao impede o fechamento', async () => {
    mockAtual = cenario({
      'clinicas.select': { data: { exigir_pagamento_previo: true }, error: null },
      'rpc.saldo_devedor_do_agendamento': { data: null, error: { message: 'timeout' } },
    });

    const resultado = await finalizar();
    expect(resultado.success).toBe(true);
    expect(statusGravado()).toContain('finalizado');
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
      userId: 'user-1',
    });

    expect(resultado.success).toBe(true);
    expect(resultado.actions).toContain('Dipirona 500mg: -2 unidade(s)');
    expect(mockAtual.chamadas.some(c => c.tabela === 'estoque' && c.op === 'update')).toBe(false);

    const chamada = mockAtual.chamadas.find(c => c.tabela === 'rpc:registrar_baixa_estoque');
    expect(chamada?.payload).toMatchObject({
      p_item_id: 'item-1',
      p_quantidade: 2,
      p_usuario_id: 'user-1',
    });
  });
});
