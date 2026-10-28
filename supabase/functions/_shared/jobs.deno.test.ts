import {
  codigoDeErro,
  type DbJobs,
  enfileirarJob,
  ErroJobDefinitivo,
  ErroJobIncerto,
  type Job,
  processarLote,
} from './jobs.ts';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const CLINICA = '11111111-1111-4111-8111-111111111111';

function job(id: string, tipo = 'teste.tipo'): Job {
  return {
    id, tipo, clinica_id: CLINICA, chave_idempotencia: id, chave_ordenacao: null,
    payload: {}, status: 'executando', repetivel: false, tentativas: 1, max_tentativas: 3,
  };
}

function fakeDb(reservados: Job[], statusFalha = 'pendente') {
  const chamadas: { fn: string; args: Record<string, unknown> }[] = [];
  const db: DbJobs = {
    rpc(fn, args) {
      chamadas.push({ fn, args });
      if (fn === 'reivindicar_jobs') return Promise.resolve({ data: reservados, error: null });
      if (fn === 'concluir_job') return Promise.resolve({ data: true, error: null });
      if (fn === 'falhar_job') {
        const status = args.p_incerto ? 'incerto' : args.p_definitivo ? 'dead' : statusFalha;
        return Promise.resolve({ data: status, error: null });
      }
      if (fn === 'enfileirar_job') return Promise.resolve({ data: [{ job_id: 'j-1', criado: false }], error: null });
      return Promise.resolve({ data: null, error: { code: '42883' } });
    },
  };
  return { db, chamadas };
}

const silenciar = async (fn: () => Promise<void>) => {
  const original = console.error;
  console.error = () => {};
  try { await fn(); } finally { console.error = original; }
};

Deno.test('conclui jobs bem-sucedidos e classifica falhas', async () => {
  const { db, chamadas } = fakeDb([job('a'), job('b'), job('c'), job('d'), job('e', 'tipo.desconhecido')]);
  let resumo;
  await silenciar(async () => {
    resumo = await processarLote(db, {
      'teste.tipo': (j) => {
        if (j.id === 'b') return Promise.reject(new ErroJobDefinitivo('payload_invalido'));
        if (j.id === 'c') return Promise.reject(new ErroJobIncerto('falha_apos_envio'));
        if (j.id === 'd') return Promise.reject(new Error('Paciente Fulana: timeout'));
        return Promise.resolve();
      },
      'tipo.desconhecido': undefined as never,
    });
  });
  // 'tipo.desconhecido' com handler undefined vira dead (tipo_sem_handler).
  const r = resumo as unknown as Record<string, number>;
  assert(r.reservados === 5, `reservados ${r.reservados}`);
  assert(r.concluidos === 1, `concluidos ${r.concluidos}`);
  assert(r.dead === 2 && r.incertos === 1 && r.reagendados === 1, JSON.stringify(r));

  const falhas = chamadas.filter((c) => c.fn === 'falhar_job');
  const porId = Object.fromEntries(falhas.map((c) => [c.args.p_job_id, c.args]));
  assert(porId.b.p_definitivo === true && porId.b.p_erro === 'payload_invalido', 'definitivo');
  assert(porId.c.p_incerto === true, 'incerto');
  assert(porId.d.p_definitivo === false && porId.d.p_incerto === false, 'recuperável');
  assert(porId.e.p_erro === 'tipo_sem_handler', 'sem handler');
  // Mensagem do erro (pode ter dado pessoal) não vai para ultimo_erro.
  assert(!falhas.some((c) => String(c.args.p_erro).includes('Fulana')), 'dado pessoal no erro');
});

Deno.test('reserva só os tipos registrados, com lease e justiça por clínica', async () => {
  const { db, chamadas } = fakeDb([]);
  await processarLote(db, { 'x.y': () => Promise.resolve() }, { limite: 5, leaseSegundos: 90, porClinica: 2 });
  const r = chamadas[0];
  assert(r.fn === 'reivindicar_jobs', 'rpc errada');
  assert(JSON.stringify(r.args.p_tipos) === '["x.y"]' && r.args.p_limite === 5, 'args');
  assert(r.args.p_lease === '90 seconds' && r.args.p_por_clinica === 2, 'lease/clinica');
});

Deno.test('sem handlers não reserva nada', async () => {
  const { db, chamadas } = fakeDb([job('a')]);
  const r = await processarLote(db, {});
  assert(r.reservados === 0 && chamadas.length === 0, 'reservou sem handler');
});

Deno.test('enfileirarJob devolve criado=false na reentrega', async () => {
  const { db, chamadas } = fakeDb([]);
  const r = await enfileirarJob(db, { tipo: 'a.b', chaveIdempotencia: 'k', payload: { id: 1 }, clinicaId: CLINICA });
  assert(r.jobId === 'j-1' && r.criado === false, 'retorno');
  const a = chamadas[0].args;
  assert(a.p_repetivel === false && a.p_max_tentativas === 5 && a.p_chave_ordenacao === null, 'padrões');
});

Deno.test('codigoDeErro usa só código ou nome', () => {
  assert(codigoDeErro({ code: '23505', message: 'Fulana' }) === 'db_23505', 'code');
  assert(codigoDeErro(new TypeError('Fulana')) === 'TypeError', 'name');
  assert(codigoDeErro('texto livre') === 'erro_desconhecido', 'string');
});
