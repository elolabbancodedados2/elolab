import {
  filaAtivaParaClinica,
  JANELA_REENFILEIRAR_MS,
  lerPayloadMensagem,
  montarJobMensagem,
  recenteParaReenfileirar,
  TIPO_MENSAGEM_RECEBIDA,
  tokenConfere,
} from './fila.ts';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const S = '33333333-3333-4333-8333-333333333333';
const C = '44444444-4444-4444-8444-444444444444';
const M = '55555555-5555-4555-8555-555555555555';

Deno.test('fila só liga para clínicas listadas ou com *', () => {
  assert(!filaAtivaParaClinica(A, undefined), 'vazio deve ser síncrono');
  assert(!filaAtivaParaClinica(A, ''), 'vazio deve ser síncrono');
  assert(filaAtivaParaClinica(A, `${B}, ${A.toUpperCase()}`), 'lista');
  assert(!filaAtivaParaClinica(A, B), 'outra clínica');
  assert(filaAtivaParaClinica(A, '*'), 'todas');
  assert(!filaAtivaParaClinica(null, '*'), 'sem clínica');
  assert(!filaAtivaParaClinica('x', '*'), 'id inválido');
});

Deno.test('job da mensagem: chave por clínica, ordem por conversa, sem conteúdo', () => {
  const j = montarJobMensagem({ clinicaId: A, sessionId: S, conversationId: C, mensagemId: M, messageIdProvedor: 'ABC123' });
  assert(j.tipo === TIPO_MENSAGEM_RECEBIDA, 'tipo');
  assert(j.chaveIdempotencia === `${A}:ABC123`, `chave ${j.chaveIdempotencia}`);
  assert(j.chaveOrdenacao === `conversa:${C}`, 'ordenação');
  assert(j.repetivel === false && j.maxTentativas === 3, 'envio não idempotente');
  assert(j.clinicaId === A, 'clínica');
  assert(JSON.stringify(Object.keys(j.payload).sort()) === '["conversation_id","mensagem_id","session_id"]', 'payload mínimo');

  const outra = montarJobMensagem({ clinicaId: B, sessionId: S, conversationId: C, mensagemId: M, messageIdProvedor: 'ABC123' });
  assert(outra.chaveIdempotencia !== j.chaveIdempotencia, 'mesmo id do provedor em outra clínica colide');

  const semId = montarJobMensagem({ clinicaId: A, sessionId: S, conversationId: C, mensagemId: M, messageIdProvedor: null });
  assert(semId.chaveIdempotencia === `${A}:db:${M}`, 'fallback pelo id gravado');
});

Deno.test('lerPayloadMensagem valida os UUIDs', () => {
  assert(lerPayloadMensagem({ mensagem_id: M, conversation_id: C, session_id: S })?.mensagem_id === M, 'válido');
  assert(lerPayloadMensagem({ mensagem_id: M, conversation_id: C }) === null, 'faltando campo');
  assert(lerPayloadMensagem({ mensagem_id: 'x', conversation_id: C, session_id: S }) === null, 'uuid inválido');
  assert(lerPayloadMensagem(null) === null, 'nulo');
});

Deno.test('reenfileira só dentro da janela de reentrega', () => {
  const agora = Date.parse('2026-10-29T12:00:00Z');
  assert(recenteParaReenfileirar('2026-10-29T11:50:00Z', agora), 'recente');
  assert(!recenteParaReenfileirar(new Date(agora - JANELA_REENFILEIRAR_MS - 1000).toISOString(), agora), 'antiga');
  assert(!recenteParaReenfileirar(null, agora), 'sem data');
});

Deno.test('tokenConfere compara em tempo constante e recusa vazio', () => {
  assert(tokenConfere('segredo-teste', 'segredo-teste'), 'igual');
  assert(!tokenConfere('segredo-testx', 'segredo-teste'), 'diferente');
  assert(!tokenConfere('segredo', 'segredo-teste'), 'prefixo');
  assert(!tokenConfere('', 'segredo-teste') && !tokenConfere('x', ''), 'vazio');
});

Deno.test('no modo fila o webhook enfileira e responde antes de chamar a IA', async () => {
  const src = (await Deno.readTextFile(new URL('./index.ts', import.meta.url))).replace(/\r\n/g, '\n');
  const ramo = src.match(/if \(filaAtivaParaClinica\(session\.clinica_id[\s\S]*?\n {10}\}\n/);
  assert(ramo, 'ramo da fila não encontrado');
  assert(/enfileirarJob\(supabase, montarJobMensagem/.test(ramo[0]) && /\n {12}continue\n/.test(ramo[0]), 'ramo não enfileira e segue');
  assert(!/processarMensagemRecebida|runNvidiaAgent|enviar\(/.test(ramo[0]), 'ramo da fila chama IA ou envia');
  const idxRamo = src.indexOf(ramo[0]);
  const idxGravacao = src.indexOf("const { data: mensagemGravada, error: erroInsercaoMensagem }");
  assert(idxGravacao > 0 && idxGravacao < idxRamo, 'enfileira antes de gravar a mensagem');
  // Worker exige o segredo do cron.
  assert(/searchParams\.get\('modo'\) === 'jobs'\) \{\n\s+if \(!cronSecretOk\(req\)\)/.test(src), 'worker sem cronSecretOk');
  assert(/tokenConfere\(providedToken, evolutionApiKey\)/.test(src), 'token do Evolution sem comparação constante');
});
