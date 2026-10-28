import { MARCADOR_AGENDAMENTO_ONLINE, OBSERVACAO_AGENDAMENTO_ONLINE } from './observacoes.ts';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

Deno.test('observação do agendamento online mantém o marcador usado pela recepção', () => {
  assert(OBSERVACAO_AGENDAMENTO_ONLINE.startsWith(MARCADOR_AGENDAMENTO_ONLINE), 'marcador no início');
  assert(OBSERVACAO_AGENDAMENTO_ONLINE.toLowerCase().includes(MARCADOR_AGENDAMENTO_ONLINE), 'ilike da contagem');
});

Deno.test('CLIN-QA-320: observação não carrega dados de contato', () => {
  for (const proibido of ['informado', 'Nome', 'Telefone', 'E-mail', '@', '\n']) {
    assert(!OBSERVACAO_AGENDAMENTO_ONLINE.includes(proibido), `não deve conter "${proibido}"`);
  }
});

Deno.test('CLIN-QA-320: index.ts grava só a observação fixa no agendamento', async () => {
  const fonte = await Deno.readTextFile(new URL('./index.ts', import.meta.url));
  assert(/p_observacoes:\s*OBSERVACAO_AGENDAMENTO_ONLINE,/.test(fonte), 'deve usar a constante');
  assert(!/informado:/.test(fonte), 'não deve montar texto com dados informados');
  assert(fonte.includes(".ilike('observacoes', `%${MARCADOR_AGENDAMENTO_ONLINE}%`)"), 'contagem usa o mesmo marcador');
});
