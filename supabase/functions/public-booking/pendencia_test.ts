import {
  type DadosPendencia,
  type DbPendencia,
  montarTarefaPendencia,
  primeiroNome,
  registrarPendenciaELiberar,
} from './pendencia.ts';

// Dados sintéticos.
const DADOS: DadosPendencia = {
  clinicaId: '11111111-1111-4111-8111-111111111111',
  motivo: 'nascimento_divergente',
  data: '2026-11-03',
  hora: '09:30',
  medicoNome: 'Dra. Exemplo',
  nome: 'Fulana Teste da Silva',
  telefone: '(11) 90000-0000',
  hoje: '2026-10-27',
};

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

type Chamada = { tabela: string; op: 'insert' | 'delete'; valores?: Record<string, unknown>; filtros?: [string, string][] };

function fakeDb(opts: { erroInsert?: boolean; erroDelete?: boolean } = {}) {
  const chamadas: Chamada[] = [];
  const db: DbPendencia = {
    from(tabela) {
      return {
        insert(valores) {
          chamadas.push({ tabela, op: 'insert', valores });
          return Promise.resolve({ error: opts.erroInsert ? { message: 'falha', code: '500' } : null });
        },
        delete() {
          const filtros: [string, string][] = [];
          return {
            eq(c1, v1) {
              filtros.push([c1, v1]);
              return {
                eq(c2, v2) {
                  filtros.push([c2, v2]);
                  chamadas.push({ tabela, op: 'delete', filtros });
                  return Promise.resolve({ error: opts.erroDelete ? { message: 'falha', code: '500' } : null });
                },
              };
            },
          };
        },
      };
    },
  };
  return { db, chamadas };
}

Deno.test('tarefa de pendência não copia nome completo, CPF, nascimento nem e-mail', () => {
  const tarefa = montarTarefaPendencia(DADOS);
  const texto = `${tarefa.titulo}\n${tarefa.descricao}`;
  assert(!texto.includes('Fulana Teste da Silva'), 'nome completo vazou');
  assert(!texto.includes('Silva'), 'sobrenome vazou');
  assert(!/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/.test(texto), 'CPF vazou');
  assert(!/CPF informado|Nascimento informado|E-mail informado/.test(texto), 'campo pessoal presente');
  assert(!/\d{4}-\d{2}-\d{2}/.test(tarefa.descricao.replace(DADOS.data, '')), 'data extra (nascimento?) presente');
  assert(texto.includes('Fulana'), 'primeiro nome ausente');
  assert(texto.includes(DADOS.telefone), 'telefone para retorno ausente');
  assert(texto.includes('2026-11-03 às 09:30 com Dra. Exemplo'), 'horário pedido ausente');
  assert(tarefa.paciente_id === null && tarefa.clinica_id === DADOS.clinicaId, 'vínculo incorreto');
});

Deno.test('primeiroNome usa só o primeiro termo e limita o tamanho', () => {
  assert(primeiroNome('  Ana   Maria Souza ') === 'Ana', 'primeiro nome errado');
  assert(primeiroNome('x'.repeat(80)).length === 40, 'sem limite de tamanho');
});

Deno.test('libera a reserva depois de criar a tarefa', async () => {
  const { db, chamadas } = fakeDb();
  await registrarPendenciaELiberar(db, DADOS, 'hash-abc');
  assert(chamadas.length === 2, `esperava 2 chamadas, veio ${chamadas.length}`);
  assert(chamadas[0].tabela === 'tarefas' && chamadas[0].op === 'insert', 'tarefa não criada primeiro');
  assert(chamadas[1].tabela === 'public_booking_holds' && chamadas[1].op === 'delete', 'reserva não liberada');
  const filtros = Object.fromEntries(chamadas[1].filtros ?? []);
  assert(filtros.clinica_id === DADOS.clinicaId && filtros.token_hash === 'hash-abc', 'filtro da liberação errado');
});

Deno.test('preserva a reserva quando a tarefa falha', async () => {
  const { db, chamadas } = fakeDb({ erroInsert: true });
  let falhou = false;
  try {
    await registrarPendenciaELiberar(db, DADOS, 'hash-abc');
  } catch {
    falhou = true;
  }
  assert(falhou, 'erro da tarefa não subiu');
  assert(!chamadas.some((c) => c.op === 'delete'), 'reserva liberada sem tarefa');
});

Deno.test('falha ao liberar a reserva não desfaz a pendência registrada', async () => {
  const { db, chamadas } = fakeDb({ erroDelete: true });
  const errorOriginal = console.error;
  console.error = () => {};
  try {
    await registrarPendenciaELiberar(db, DADOS, 'hash-abc');
  } finally {
    console.error = errorOriginal;
  }
  assert(chamadas.length === 2, 'fluxo incompleto');
});
