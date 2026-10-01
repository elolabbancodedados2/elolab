import {
  AVISO_CLINICA_NAO_NOTIFICADA,
  limiteDataRemarcacao,
  normalizarDiasAntecedencia,
  recusarDataAlemDoLimite,
  remarcarAgendamento,
} from './remarcacao.ts';

// 2026-10-01 09:00 em Brasília.
const AGORA = new Date('2026-10-01T12:00:00.000Z');
const CTX = { pacienteId: 'paciente-1', clinicaId: 'clinica-1' };

interface Cenario {
  agendamento?: Record<string, unknown> | null;
  /** Valor salvo em configuracoes_clinica.agendamento_online; `undefined` = sem configuração. */
  config?: Record<string, unknown>;
  /** Linha no momento do UPDATE; padrão: a mesma lida no SELECT. Simula outra escrita no meio. */
  estadoNoUpdate?: Record<string, unknown>;
  /** `false` simula profissional desativado (ou de outra clínica); padrão: ativo. */
  medicoAtivo?: boolean;
  /** Tabelas cujo INSERT devolve erro (registro pós-remarcação). */
  falhaInsert?: string[];
}

/** Banco falso: responde às consultas da remarcação e registra os UPDATEs. */
function bancoFalso(cenario: Cenario) {
  const updates: Record<string, unknown>[] = [];
  const filtrosUpdate: Record<string, unknown>[] = [];
  const filtrosMedico: Record<string, unknown>[] = [];
  const consultasConfig: string[] = [];
  const inserts: { tabela: string; payload: Record<string, unknown> }[] = [];
  const linhasAuxiliares: Record<string, Record<string, unknown>> = {
    clinicas: { nome: 'Clínica Teste', owner_id: 'owner-1' },
    pacientes: { nome: 'Paciente Teste' },
    profiles: { id: 'owner-1', nome: 'Dona', email: 'dona@clinica.test' },
  };
  const db = {
    from(tabela: string) {
      let payloadUpdate: Record<string, unknown> | null = null;
      const filtros: Record<string, unknown> = {};
      const resultadoLista = () => ({ data: [], error: null });
      const builder: any = {
        select: () => builder,
        eq: (coluna: string, valor: unknown) => { filtros[coluna] = valor; return builder; },
        is: (coluna: string, valor: unknown) => { filtros[coluna] = valor; filtros[`${coluna}:is`] = true; return builder; },
        neq: () => builder,
        in: () => builder,
        not: () => builder,
        order: () => builder,
        limit: () => builder,
        update: (payload: Record<string, unknown>) => { payloadUpdate = payload; return builder; },
        insert: (payload: Record<string, unknown>) => {
          inserts.push({ tabela, payload });
          const error = cenario.falhaInsert?.includes(tabela) ? { message: `falha em ${tabela}` } : null;
          return Promise.resolve({ data: null, error });
        },
        single: async () => {
          if (tabela === 'agendamentos') return { data: cenario.agendamento ?? null, error: null };
          return { data: null, error: null };
        },
        maybeSingle: async () => {
          if (tabela in linhasAuxiliares) return { data: linhasAuxiliares[tabela], error: null };
          if (tabela === 'medicos') {
            filtrosMedico.push({ ...filtros });
            return { data: cenario.medicoAtivo === false ? null : { id: filtros.id }, error: null };
          }
          if (tabela === 'configuracoes_clinica') {
            consultasConfig.push(String(filtros.chave));
            return { data: cenario.config === undefined ? null : { valor: cenario.config }, error: null };
          }
          if (tabela === 'agendamentos' && payloadUpdate) {
            filtrosUpdate.push({ ...filtros });
            // Como o Postgres: só altera a linha se todos os filtros ainda batem.
            const atual = cenario.estadoNoUpdate ?? cenario.agendamento;
            const bate = atual
              && filtros.id === atual.id
              && filtros.data === atual.data
              && filtros.hora_inicio === atual.hora_inicio
              && ['agendado', 'confirmado'].includes(String(atual.status));
            if (!bate) return { data: null, error: null };
            updates.push(payloadUpdate);
            return { data: { id: filtros.id }, error: null };
          }
          return { data: null, error: null };
        },
        then: (resolve: (value: unknown) => unknown) => resolve(resultadoLista()),
      };
      return builder;
    },
  };
  return { db, updates, filtrosUpdate, filtrosMedico, consultasConfig, inserts };
}

const agendamentoBase = {
  id: 'consulta-1',
  medico_id: 'medico-1',
  data: '2026-10-10',
  hora_inicio: '09:00:00',
  paciente_id: 'paciente-1',
  tipo: 'Consulta',
  status: 'confirmado',
};

function validadorLivre() {
  const chamadas: unknown[][] = [];
  const validarSlot = (async (...args: unknown[]) => {
    chamadas.push(args);
    return { error: null, duration: 30 };
  }) as any;
  return { validarSlot, chamadas };
}

function assertEquals(atual: unknown, esperado: unknown, contexto: string) {
  if (JSON.stringify(atual) !== JSON.stringify(esperado)) {
    throw new Error(`${contexto}: esperado ${JSON.stringify(esperado)}, recebido ${JSON.stringify(atual)}`);
  }
}

Deno.test('normaliza a antecedência como o link público (padrão 60, entre 1 e 180)', () => {
  assertEquals(normalizarDiasAntecedencia(undefined), 60, 'sem valor');
  assertEquals(normalizarDiasAntecedencia(0), 60, 'zero');
  assertEquals(normalizarDiasAntecedencia('30'), 30, 'texto numérico');
  assertEquals(normalizarDiasAntecedencia(500), 180, 'acima do máximo');
  assertEquals(normalizarDiasAntecedencia(-5), 1, 'negativo');
});

Deno.test('calcula o limite a partir de hoje em Brasília e da configuração da clínica', async () => {
  const { db, consultasConfig } = bancoFalso({ config: { dias_antecedencia: 30 } });
  assertEquals(await limiteDataRemarcacao(db, 'clinica-1', AGORA), '2026-10-31', 'limite com 30 dias');
  assertEquals(consultasConfig, ['agendamento_online'], 'chave consultada');

  const semConfig = bancoFalso({});
  assertEquals(await limiteDataRemarcacao(semConfig.db, 'clinica-1', AGORA), '2026-11-30', 'limite padrão de 60 dias');
});

Deno.test('aceita remarcar exatamente no último dia permitido', async () => {
  const { db, updates } = bancoFalso({ agendamento: agendamentoBase, config: { dias_antecedencia: 30 } });
  const { validarSlot } = validadorLivre();
  const resposta = await remarcarAgendamento(
    db, CTX, { agendamento_id: 'consulta-1', nova_data: '2026-10-31', novo_horario: '10:00' }, { agora: AGORA, validarSlot },
  );
  assertEquals(resposta.status, 200, 'status');
  assertEquals(updates, [{ data: '2026-10-31', hora_inicio: '10:00', hora_fim: '10:30', status: 'agendado' }], 'update');
});

Deno.test('recusa nova data um dia depois do limite configurado, sem gravar', async () => {
  const { db, updates } = bancoFalso({ agendamento: agendamentoBase, config: { dias_antecedencia: 30 } });
  const { validarSlot, chamadas } = validadorLivre();
  const resposta = await remarcarAgendamento(
    db, CTX, { agendamento_id: 'consulta-1', nova_data: '2026-11-01', novo_horario: '10:00' }, { agora: AGORA, validarSlot },
  );
  assertEquals(resposta.status, 400, 'status');
  assertEquals(resposta.body.code, 'date_beyond_limit', 'code');
  assertEquals(resposta.body.limite, '2026-10-31', 'limite devolvido');
  if (!String(resposta.body.error).includes('31/10/2026')) throw new Error(`Mensagem sem a data limite: ${resposta.body.error}`);
  assertEquals(updates.length, 0, 'nenhum update');
  assertEquals(chamadas.length, 0, 'validação de horário não chamada');
});

Deno.test('sem configuração, aplica o limite padrão de 60 dias', async () => {
  const dentro = bancoFalso({ agendamento: agendamentoBase });
  const okResp = await remarcarAgendamento(
    dentro.db, CTX, { agendamento_id: 'consulta-1', nova_data: '2026-11-30', novo_horario: '10:00' },
    { agora: AGORA, validarSlot: validadorLivre().validarSlot },
  );
  assertEquals(okResp.status, 200, 'dia 60 aceito');

  const fora = bancoFalso({ agendamento: agendamentoBase });
  const foraResp = await remarcarAgendamento(
    fora.db, CTX, { agendamento_id: 'consulta-1', nova_data: '2026-12-01', novo_horario: '10:00' },
    { agora: AGORA, validarSlot: validadorLivre().validarSlot },
  );
  assertEquals(foraResp.status, 400, 'dia 61 recusado');
  assertEquals(foraResp.body.code, 'date_beyond_limit', 'code dia 61');
  assertEquals(fora.updates.length, 0, 'nenhum update no dia 61');
});

Deno.test('recusa remarcar para a mesma data e hora atuais (HH:MM contra HH:MM:SS)', async () => {
  const { db, updates } = bancoFalso({ agendamento: agendamentoBase, config: { dias_antecedencia: 30 } });
  const { validarSlot, chamadas } = validadorLivre();
  const resposta = await remarcarAgendamento(
    db, CTX, { agendamento_id: 'consulta-1', nova_data: '2026-10-10', novo_horario: '09:00' }, { agora: AGORA, validarSlot },
  );
  assertEquals(resposta.status, 400, 'status');
  assertEquals(resposta.body.code, 'same_slot', 'code');
  assertEquals(updates.length, 0, 'nenhum update: a confirmação é preservada');
  assertEquals(chamadas.length, 0, 'validação de horário não chamada');
});

Deno.test('aceita mesma data com outro horário, ou mesmo horário em outra data', async () => {
  for (const [novaData, novoHorario] of [['2026-10-10', '09:30'], ['2026-10-11', '09:00']]) {
    const { db, updates } = bancoFalso({ agendamento: agendamentoBase, config: { dias_antecedencia: 30 } });
    const resposta = await remarcarAgendamento(
      db, CTX, { agendamento_id: 'consulta-1', nova_data: novaData, novo_horario: novoHorario },
      { agora: AGORA, validarSlot: validadorLivre().validarSlot },
    );
    assertEquals(resposta.status, 200, `status ${novaData} ${novoHorario}`);
    assertEquals(updates.length, 1, `update ${novaData} ${novoHorario}`);
  }
});

Deno.test('a busca de horários da remarcação usa o mesmo limite', async () => {
  const { db } = bancoFalso({ config: { dias_antecedencia: 30 } });
  assertEquals(await recusarDataAlemDoLimite(db, 'clinica-1', '2026-10-31', AGORA), null, 'último dia liberado');
  const recusa = await recusarDataAlemDoLimite(db, 'clinica-1', '2026-11-01', AGORA);
  assertEquals(recusa?.status, 400, 'dia seguinte recusado');
  assertEquals(recusa?.body.code, 'date_beyond_limit', 'code');
});

Deno.test('não sobrescreve remarcação feita pela recepção entre a leitura e a gravação', async () => {
  // O paciente lê a consulta em 10/10 09:00; antes do UPDATE, a recepção a
  // move para 12/10 14:00 (ainda "agendado").
  const { db, updates, filtrosUpdate } = bancoFalso({
    agendamento: agendamentoBase,
    estadoNoUpdate: { ...agendamentoBase, data: '2026-10-12', hora_inicio: '14:00:00', status: 'agendado' },
    config: { dias_antecedencia: 30 },
  });
  const resposta = await remarcarAgendamento(
    db, CTX, { agendamento_id: 'consulta-1', nova_data: '2026-10-20', novo_horario: '10:00' },
    { agora: AGORA, validarSlot: validadorLivre().validarSlot },
  );
  assertEquals(resposta.status, 409, 'status');
  assertEquals(resposta.body.code, 'appointment_state_changed', 'code');
  assertEquals(updates.length, 0, 'nenhuma linha alterada');
  assertEquals(filtrosUpdate[0].data, '2026-10-10', 'UPDATE condicionado à data lida');
  assertEquals(filtrosUpdate[0].hora_inicio, '09:00:00', 'UPDATE condicionado à hora lida');
  assertEquals(filtrosUpdate[0]['hora_inicio:is'], undefined, 'hora não nula usa igualdade');
});

Deno.test('consulta sem horário usa IS NULL na guarda e detecta horário definido no meio', async () => {
  const semHora = { ...agendamentoBase, hora_inicio: null };

  const livre = bancoFalso({ agendamento: semHora, config: { dias_antecedencia: 30 } });
  const ok = await remarcarAgendamento(
    livre.db, CTX, { agendamento_id: 'consulta-1', nova_data: '2026-10-20', novo_horario: '10:00' },
    { agora: AGORA, validarSlot: validadorLivre().validarSlot },
  );
  assertEquals(ok.status, 200, 'sem corrida, remarca');
  assertEquals(livre.filtrosUpdate[0]['hora_inicio:is'], true, 'hora nula usa IS');
  assertEquals(livre.filtrosUpdate[0].hora_inicio, null, 'IS NULL');

  const corrida = bancoFalso({
    agendamento: semHora,
    estadoNoUpdate: { ...semHora, hora_inicio: '11:00:00' },
    config: { dias_antecedencia: 30 },
  });
  const conflito = await remarcarAgendamento(
    corrida.db, CTX, { agendamento_id: 'consulta-1', nova_data: '2026-10-20', novo_horario: '10:00' },
    { agora: AGORA, validarSlot: validadorLivre().validarSlot },
  );
  assertEquals(conflito.status, 409, 'status na corrida');
  assertEquals(conflito.body.code, 'appointment_state_changed', 'code na corrida');
  assertEquals(corrida.updates.length, 0, 'nenhuma linha alterada na corrida');
});

Deno.test('recusa remarcar com profissional desativado, sem validar horário nem gravar', async () => {
  const { db, updates, filtrosMedico, consultasConfig } = bancoFalso({
    agendamento: agendamentoBase,
    medicoAtivo: false,
    config: { dias_antecedencia: 30 },
  });
  const { validarSlot, chamadas } = validadorLivre();
  const resposta = await remarcarAgendamento(
    db, CTX, { agendamento_id: 'consulta-1', nova_data: '2026-10-20', novo_horario: '10:00' }, { agora: AGORA, validarSlot },
  );
  assertEquals(resposta.status, 409, 'status');
  assertEquals(resposta.body.code, 'professional_unavailable', 'code');
  assertEquals(filtrosMedico, [{ id: 'medico-1', clinica_id: 'clinica-1', ativo: true }], 'consulta por id + clínica + ativo');
  assertEquals(chamadas.length, 0, 'validação de horário não chamada');
  assertEquals(updates.length, 0, 'nenhum update');
  assertEquals(consultasConfig.length, 0, 'limite nem chega a ser consultado');
});

/** Silencia e captura console.error durante `fn` (o registro loga falhas de propósito). */
async function capturandoErros<T>(fn: () => Promise<T>): Promise<{ resultado: T; erros: string[] }> {
  const original = console.error;
  const erros: string[] = [];
  console.error = (...args: unknown[]) => { erros.push(String(args[0])); };
  try {
    return { resultado: await fn(), erros };
  } finally {
    console.error = original;
  }
}

Deno.test('remarcação bem-sucedida grava auditoria e enfileira aviso à clínica', async () => {
  const { db, updates, inserts } = bancoFalso({ agendamento: agendamentoBase, config: { dias_antecedencia: 30 } });
  const resposta = await remarcarAgendamento(
    db, CTX, { agendamento_id: 'consulta-1', nova_data: '2026-10-20', novo_horario: '10:00' },
    { agora: AGORA, validarSlot: validadorLivre().validarSlot },
  );
  assertEquals(resposta.status, 200, 'status');
  assertEquals(updates.length, 1, 'consulta gravada');
  assertEquals(inserts.map((i) => i.tabela), ['audit_log', 'notification_queue'], 'registro e aviso');
  assertEquals(
    (inserts[0].payload.changes as unknown[]).slice(0, 2),
    [
      { field: 'data', oldValue: '2026-10-10', newValue: '2026-10-20' },
      { field: 'hora_inicio', oldValue: '09:00', newValue: '10:00' },
    ],
    'antes/depois na auditoria',
  );
  assertEquals(resposta.body.avisos, { auditoria: 'registrada', aviso_clinica: 'enfileirado' }, 'avisos');
  assertEquals(resposta.body.aviso, undefined, 'sem aviso ao paciente');
});

Deno.test('falha ao enfileirar o aviso mantém o sucesso e avisa o paciente', async () => {
  const { db, updates } = bancoFalso({
    agendamento: agendamentoBase,
    config: { dias_antecedencia: 30 },
    falhaInsert: ['notification_queue'],
  });
  const { resultado: resposta, erros } = await capturandoErros(() => remarcarAgendamento(
    db, CTX, { agendamento_id: 'consulta-1', nova_data: '2026-10-20', novo_horario: '10:00' },
    { agora: AGORA, validarSlot: validadorLivre().validarSlot },
  ));
  assertEquals(resposta.status, 200, 'remarcação continua bem-sucedida');
  assertEquals(resposta.body.success, true, 'success');
  assertEquals(updates.length, 1, 'consulta gravada');
  assertEquals(resposta.body.avisos, { auditoria: 'registrada', aviso_clinica: 'falhou' }, 'avisos');
  assertEquals(resposta.body.aviso, AVISO_CLINICA_NAO_NOTIFICADA, 'aviso ao paciente');
  if (!erros.some((e) => e.includes('aviso à clínica não enfileirado'))) throw new Error('Falha da fila não foi para o log');
});

Deno.test('registro pós-remarcação que lança não vira erro para o paciente', async () => {
  const { db, updates } = bancoFalso({ agendamento: agendamentoBase, config: { dias_antecedencia: 30 } });
  const { resultado: resposta, erros } = await capturandoErros(() => remarcarAgendamento(
    db, CTX, { agendamento_id: 'consulta-1', nova_data: '2026-10-20', novo_horario: '10:00' },
    {
      agora: AGORA,
      validarSlot: validadorLivre().validarSlot,
      registrarRemarcacao: async () => { throw new Error('banco indisponível'); },
    },
  ));
  assertEquals(resposta.status, 200, 'status');
  assertEquals(updates.length, 1, 'consulta gravada');
  assertEquals(resposta.body.aviso, AVISO_CLINICA_NAO_NOTIFICADA, 'aviso ao paciente');
  if (!erros.some((e) => e.includes('registro pós-remarcação falhou'))) throw new Error('Falha não foi para o log');
});

Deno.test('remarcação recusada não grava auditoria nem aviso', async () => {
  const { db, inserts } = bancoFalso({
    agendamento: agendamentoBase,
    estadoNoUpdate: { ...agendamentoBase, data: '2026-10-12', hora_inicio: '14:00:00', status: 'agendado' },
    config: { dias_antecedencia: 30 },
  });
  const resposta = await remarcarAgendamento(
    db, CTX, { agendamento_id: 'consulta-1', nova_data: '2026-10-20', novo_horario: '10:00' },
    { agora: AGORA, validarSlot: validadorLivre().validarSlot },
  );
  assertEquals(resposta.status, 409, 'status');
  assertEquals(inserts.length, 0, 'nada registrado');
});

Deno.test('mantém as recusas de estado antes das regras de data', async () => {
  const { db, updates } = bancoFalso({ agendamento: { ...agendamentoBase, status: 'em_atendimento' } });
  const resposta = await remarcarAgendamento(
    db, CTX, { agendamento_id: 'consulta-1', nova_data: '2026-10-10', novo_horario: '09:00' },
    { agora: AGORA, validarSlot: validadorLivre().validarSlot },
  );
  assertEquals(resposta.status, 409, 'status');
  assertEquals(resposta.body.code, 'appointment_state_changed', 'code');
  assertEquals(updates.length, 0, 'nenhum update');
});
