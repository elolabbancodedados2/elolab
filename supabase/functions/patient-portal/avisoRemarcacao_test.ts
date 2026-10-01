import {
  ASSUNTO_AVISO_REMARCACAO,
  ORIGEM_PORTAL,
  escaparHtml,
  registrarRemarcacao,
  resumoErro,
} from './avisoRemarcacao.ts';

/** Erro no formato do PostgREST, com dado pessoal onde ele costuma aparecer. */
function erroComDadoPessoal(code: string) {
  return {
    code,
    message: 'new row for relation violates check constraint: Maria Silva',
    details: 'Failing row contains (Maria Silva, 123.456.789-00)',
    hint: 'Verifique Maria Silva',
  };
}

interface CenarioAviso {
  clinica?: Record<string, unknown> | null;
  paciente?: Record<string, unknown> | null;
  responsavel?: Record<string, unknown> | null;
  /** Tabelas cujo INSERT devolve erro (com dado pessoal em message/details/hint). */
  falhaInsert?: string[];
  /** Tabelas cuja leitura devolve erro (com dado pessoal em message/details/hint). */
  falhaLeitura?: string[];
}

function bancoFalso(cenario: CenarioAviso) {
  const inserts: { tabela: string; payload: Record<string, unknown> }[] = [];
  const leituras: { tabela: string; filtros: Record<string, unknown> }[] = [];
  const linhas: Record<string, Record<string, unknown> | null | undefined> = {
    clinicas: cenario.clinica === undefined ? { nome: 'Clínica Teste', owner_id: 'owner-1' } : cenario.clinica,
    pacientes: cenario.paciente === undefined ? { nome: 'Maria Silva', clinica_id: 'clinica-1' } : cenario.paciente,
    profiles: cenario.responsavel === undefined ? { id: 'owner-1', nome: 'Dra. Dona', email: 'dona@clinica.test' } : cenario.responsavel,
  };
  const db = {
    from(tabela: string) {
      const filtros: Record<string, unknown> = {};
      const builder: any = {
        select: () => builder,
        eq: (coluna: string, valor: unknown) => { filtros[coluna] = valor; return builder; },
        maybeSingle: async () => {
          leituras.push({ tabela, filtros: { ...filtros } });
          if (cenario.falhaLeitura?.includes(tabela)) return { data: null, error: erroComDadoPessoal('PGRST301') };
          const linha = linhas[tabela];
          // Como o banco: a linha só volta se bater com todos os filtros que ela tem.
          const bate = linha && Object.entries(filtros).every(([c, v]) => linha[c] === undefined || linha[c] === v);
          return { data: bate ? linha : null, error: null };
        },
        insert: (payload: Record<string, unknown>) => {
          inserts.push({ tabela, payload });
          const error = cenario.falhaInsert?.includes(tabela) ? erroComDadoPessoal('23514') : null;
          return Promise.resolve({ data: null, error });
        },
      };
      return builder;
    },
  };
  return { db, inserts, leituras };
}

/** Captura TODOS os argumentos do log, serializados, para detectar objetos de erro vazados. */
function logFalso() {
  const avisos: string[] = [];
  const erros: string[] = [];
  const serializar = (args: unknown[]) => args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  return {
    log: {
      warn: (...a: unknown[]) => { avisos.push(serializar(a)); },
      error: (...a: unknown[]) => { erros.push(serializar(a)); },
    },
    avisos,
    erros,
  };
}

/** Nenhum trecho de dado pessoal (nome, CPF, details/hint do PostgREST) pode estar no log. */
function assertLogSemDadoPessoal(linhas: string[], contexto: string) {
  const tudo = linhas.join('\n');
  for (const proibido of ['Maria Silva', '123.456.789-00', 'Failing row', 'check constraint', 'Verifique']) {
    if (tudo.includes(proibido)) throw new Error(`${contexto}: log contém "${proibido}": ${tudo}`);
  }
}

const DADOS = {
  agendamentoId: 'consulta-1',
  clinicaId: 'clinica-1',
  pacienteId: 'paciente-1',
  anterior: { data: '2026-10-10', hora_inicio: '09:00:00' },
  nova: { data: '2026-10-20', hora_inicio: '10:00' },
};

function assertEquals(atual: unknown, esperado: unknown, contexto: string) {
  if (JSON.stringify(atual) !== JSON.stringify(esperado)) {
    throw new Error(`${contexto}: esperado ${JSON.stringify(esperado)}, recebido ${JSON.stringify(atual)}`);
  }
}

function assertContains(texto: unknown, trecho: string, contexto: string) {
  if (!String(texto).includes(trecho)) throw new Error(`${contexto}: "${trecho}" não encontrado em ${JSON.stringify(texto)}`);
}

Deno.test('sucesso: grava auditoria com antes/depois/origem e enfileira e-mail ao responsável', async () => {
  const { db, inserts, leituras } = bancoFalso({});
  const { log, avisos, erros } = logFalso();
  const resultado = await registrarRemarcacao(db, DADOS, log);

  assertEquals(resultado, { auditoria: 'registrada', aviso_clinica: 'enfileirado' }, 'resultado');
  assertEquals(leituras, [
    { tabela: 'clinicas', filtros: { id: 'clinica-1' } },
    { tabela: 'pacientes', filtros: { id: 'paciente-1', clinica_id: 'clinica-1' } },
    { tabela: 'profiles', filtros: { id: 'owner-1' } },
  ], 'leituras escopadas (paciente por id + clínica)');
  assertEquals(inserts.map((i) => i.tabela), ['audit_log', 'notification_queue'], 'tabelas gravadas');

  const auditoria = inserts[0].payload;
  assertEquals(auditoria.action, 'update', 'action');
  assertEquals(auditoria.collection, 'agendamentos', 'collection');
  assertEquals(auditoria.record_id, 'consulta-1', 'record_id');
  assertEquals(auditoria.clinica_id, 'clinica-1', 'clinica_id');
  assertEquals(auditoria.record_name, 'Maria Silva', 'record_name');
  assertEquals(auditoria.changes, [
    { field: 'data', oldValue: '2026-10-10', newValue: '2026-10-20' },
    { field: 'hora_inicio', oldValue: '09:00', newValue: '10:00' },
    { field: 'origem', oldValue: null, newValue: ORIGEM_PORTAL },
  ], 'changes');

  const fila = inserts[1].payload;
  assertEquals(fila.tipo, 'email', 'tipo');
  assertEquals(fila.assunto, ASSUNTO_AVISO_REMARCACAO, 'assunto fixo, sem dado do paciente');
  assertEquals(fila.status, 'pendente', 'status');
  assertEquals(fila.destinatario_email, 'dona@clinica.test', 'destinatário');
  assertEquals(fila.destinatario_id, 'owner-1', 'destinatario_id');
  assertEquals(fila.clinica_id, 'clinica-1', 'clinica_id da fila');
  assertContains(fila.conteudo, 'Clínica Teste', 'conteúdo com clínica');
  assertContains(fila.conteudo, 'Maria Silva', 'conteúdo com paciente');
  assertContains(fila.conteudo, '10/10/2026 às 09:00', 'conteúdo com horário anterior');
  assertContains(fila.conteudo, '20/10/2026 às 10:00', 'conteúdo com novo horário');
  assertEquals((fila.dados_extras as Record<string, unknown>).tipo, 'remarcacao_portal', 'dados_extras.tipo');
  assertEquals((fila.dados_extras as Record<string, unknown>).origem, ORIGEM_PORTAL, 'dados_extras.origem');
  assertEquals(avisos.length + erros.length, 0, 'sem avisos no log');
});

Deno.test('responsável sem e-mail válido: registra auditoria, não enfileira e avisa no log', async () => {
  for (const email of [null, '', 'sem-arroba']) {
    const { db, inserts } = bancoFalso({ responsavel: { id: 'owner-1', nome: 'Dra. Dona', email } });
    const { log, avisos, erros } = logFalso();
    const resultado = await registrarRemarcacao(db, DADOS, log);

    assertEquals(resultado, { auditoria: 'registrada', aviso_clinica: 'sem_email' }, `resultado (${email})`);
    assertEquals(inserts.map((i) => i.tabela), ['audit_log'], `só auditoria (${email})`);
    assertEquals(erros.length, 0, `sem erro (${email})`);
    assertContains(avisos.join('\n'), 'sem e-mail válido', `aviso no log (${email})`);
  }
});

Deno.test('clínica sem responsável: registra auditoria e informa no log', async () => {
  const { db, inserts } = bancoFalso({ clinica: { nome: 'Clínica Teste', owner_id: null } });
  const { log, avisos } = logFalso();
  const resultado = await registrarRemarcacao(db, DADOS, log);
  assertEquals(resultado, { auditoria: 'registrada', aviso_clinica: 'sem_responsavel' }, 'resultado');
  assertEquals(inserts.map((i) => i.tabela), ['audit_log'], 'só auditoria');
  assertContains(avisos.join('\n'), 'sem responsável', 'aviso no log');
});

Deno.test('falha da fila: não lança, mantém a auditoria e registra o erro sem nome de paciente', async () => {
  const { db, inserts } = bancoFalso({ falhaInsert: ['notification_queue'] });
  const { log, erros } = logFalso();
  const resultado = await registrarRemarcacao(db, DADOS, log);

  assertEquals(resultado, { auditoria: 'registrada', aviso_clinica: 'falhou' }, 'resultado');
  assertEquals(inserts.map((i) => i.tabela), ['audit_log', 'notification_queue'], 'tentou as duas gravações');
  assertContains(erros.join('\n'), 'aviso à clínica não enfileirado', 'erro no log');
  assertContains(erros.join('\n'), 'agendamento=consulta-1', 'log identifica a consulta');
  assertContains(erros.join('\n'), 'codigo=23514', 'log traz só o código do erro');
  assertLogSemDadoPessoal(erros, 'falha da fila');
});

Deno.test('falha de leitura do paciente: segue sem o nome e loga só o código', async () => {
  const { db, inserts } = bancoFalso({ falhaLeitura: ['pacientes'] });
  const { log, avisos, erros } = logFalso();
  const resultado = await registrarRemarcacao(db, DADOS, log);

  assertEquals(resultado, { auditoria: 'registrada', aviso_clinica: 'enfileirado' }, 'resultado');
  assertEquals(inserts[0].payload.record_name, 'Paciente', 'auditoria com nome genérico');
  assertContains(avisos.join('\n'), 'não foi possível ler pacientes paciente-1 (codigo=PGRST301)', 'aviso com código');
  assertLogSemDadoPessoal([...avisos, ...erros], 'falha de leitura');
});

Deno.test('paciente de outra clínica não é lido: nome não chega à auditoria nem ao e-mail', async () => {
  const { db, inserts } = bancoFalso({ paciente: { nome: 'Pessoa De Outra Clínica', clinica_id: 'clinica-2' } });
  const { log } = logFalso();
  await registrarRemarcacao(db, DADOS, log);

  assertEquals(inserts[0].payload.record_name, 'Paciente', 'auditoria sem o nome');
  const conteudo = String(inserts.find((i) => i.tabela === 'notification_queue')!.payload.conteudo);
  if (conteudo.includes('Pessoa De Outra Clínica')) throw new Error(`Nome de outra clínica no e-mail: ${conteudo}`);
});

Deno.test('erros nos dois inserts: logs só com códigos e ids', async () => {
  const { db } = bancoFalso({ falhaInsert: ['audit_log', 'notification_queue'] });
  const { log, avisos, erros } = logFalso();
  const resultado = await registrarRemarcacao(db, DADOS, log);

  assertEquals(resultado, { auditoria: 'falhou', aviso_clinica: 'falhou' }, 'resultado');
  assertEquals(erros.length, 2, 'dois erros registrados');
  for (const linha of erros) assertContains(linha, 'codigo=23514', 'código em cada erro');
  assertLogSemDadoPessoal([...avisos, ...erros], 'falha dos dois inserts');
});

Deno.test('resumoErro devolve só código ou tipo', () => {
  assertEquals(resumoErro(erroComDadoPessoal('23505')), 'codigo=23505', 'erro do PostgREST');
  assertEquals(resumoErro(new TypeError('Maria Silva')), 'tipo=TypeError', 'Error sem código');
  assertEquals(resumoErro({ code: 'Maria Silva 123.456.789-00' }), 'tipo=desconhecido', 'código fora do formato não é ecoado');
  assertEquals(resumoErro('texto qualquer'), 'tipo=desconhecido', 'valor solto');
  assertEquals(resumoErro(null), 'tipo=desconhecido', 'nulo');
});

Deno.test('falha da auditoria não impede o aviso à clínica', async () => {
  const { db, inserts } = bancoFalso({ falhaInsert: ['audit_log'] });
  const { log, erros } = logFalso();
  const resultado = await registrarRemarcacao(db, DADOS, log);

  assertEquals(resultado, { auditoria: 'falhou', aviso_clinica: 'enfileirado' }, 'resultado');
  assertEquals(inserts.map((i) => i.tabela), ['audit_log', 'notification_queue'], 'tabelas');
  assertContains(erros.join('\n'), 'auditoria não gravada', 'erro no log');
});

Deno.test('escapa como texto HTML nomes com < e > no e-mail, sem levá-los ao assunto', async () => {
  const pacienteMalicioso = '<b>Maria</b> <script>alert("x")</script>';
  const clinicaMaliciosa = 'Clínica <img src=x onerror=alert(1)> & Cia';
  const { db, inserts } = bancoFalso({
    paciente: { nome: pacienteMalicioso },
    clinica: { nome: clinicaMaliciosa, owner_id: 'owner-1' },
  });
  const { log } = logFalso();
  const resultado = await registrarRemarcacao(db, DADOS, log);
  assertEquals(resultado.aviso_clinica, 'enfileirado', 'aviso enfileirado');

  const fila = inserts.find((i) => i.tabela === 'notification_queue')!.payload;
  const conteudo = String(fila.conteudo);
  for (const proibido of ['<b>', '</b>', '<script', '<img', 'onerror=alert(1)>']) {
    if (conteudo.includes(proibido)) throw new Error(`Markup não escapado no e-mail: ${proibido} em ${conteudo}`);
  }
  assertContains(conteudo, '&lt;b&gt;Maria&lt;/b&gt; &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;', 'paciente escapado');
  assertContains(conteudo, 'Clínica &lt;img src=x onerror=alert(1)&gt; &amp; Cia', 'clínica escapada');
  assertEquals(fila.assunto, ASSUNTO_AVISO_REMARCACAO, 'assunto sem o nome');

  // O que não é renderizado como HTML guarda o valor original.
  const auditoria = inserts.find((i) => i.tabela === 'audit_log')!.payload;
  assertEquals(auditoria.record_name, pacienteMalicioso, 'auditoria com o nome original');
});

Deno.test('escaparHtml cobre &, <, >, aspas e apóstrofo', () => {
  assertEquals(escaparHtml(`a & <b> "c" 'd'`), 'a &amp; &lt;b&gt; &quot;c&quot; &#39;d&#39;', 'escape');
});

Deno.test('consulta sem horário anterior aparece como tal no e-mail e na auditoria', async () => {
  const { db, inserts } = bancoFalso({});
  const { log } = logFalso();
  await registrarRemarcacao(db, { ...DADOS, anterior: { data: '2026-10-10', hora_inicio: null } }, log);
  const auditoria = inserts[0].payload.changes as { field: string; oldValue: unknown }[];
  assertEquals(auditoria[1], { field: 'hora_inicio', oldValue: null, newValue: '10:00' }, 'hora anterior nula');
  assertContains(inserts[1].payload.conteudo, '10/10/2026 (sem horário definido)', 'e-mail sem horário anterior');
});
