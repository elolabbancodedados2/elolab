/**
 * Modo fila do whatsapp-webhook (ADR 0003, fase 3).
 *
 * Com a clínica em `WHATSAPP_FILA_CLINICAS` (lista de UUIDs separada por
 * vírgula, ou `*` para todas), o webhook só grava a mensagem, enfileira
 * `whatsapp.mensagem_recebida` e responde 200. A IA e o envio da resposta
 * rodam no worker (`whatsapp-webhook?modo=jobs`, disparado pelo pg_cron com
 * x-cron-secret). Variável vazia mantém o modo síncrono atual.
 */
import type { NovoJob } from '../_shared/jobs.ts';

export const TIPO_MENSAGEM_RECEBIDA = 'whatsapp.mensagem_recebida';

/** Reentregas do Evolution chegam em minutos; fora disso não reenfileira. */
export const JANELA_REENFILEIRAR_MS = 15 * 60 * 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function filaAtivaParaClinica(clinicaId: string | null | undefined, valorEnv: string | undefined): boolean {
  if (!clinicaId || !UUID.test(clinicaId)) return false;
  const itens = String(valorEnv ?? '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
  return itens.includes('*') || itens.includes(clinicaId.toLowerCase());
}

export interface PayloadMensagemRecebida {
  mensagem_id: string;
  conversation_id: string;
  session_id: string;
}

export function montarJobMensagem(dados: {
  clinicaId: string;
  sessionId: string;
  conversationId: string;
  mensagemId: string;
  messageIdProvedor: string | null | undefined;
}): NovoJob {
  const payload: PayloadMensagemRecebida = {
    mensagem_id: dados.mensagemId,
    conversation_id: dados.conversationId,
    session_id: dados.sessionId,
  };
  return {
    tipo: TIPO_MENSAGEM_RECEBIDA,
    // A chave inclui a clínica: o id do Evolution é único por instância, não globalmente.
    chaveIdempotencia: `${dados.clinicaId}:${dados.messageIdProvedor || `db:${dados.mensagemId}`}`.slice(0, 200),
    payload: { ...payload },
    clinicaId: dados.clinicaId,
    // Mensagens da mesma conversa são respondidas em ordem.
    chaveOrdenacao: `conversa:${dados.conversationId}`,
    // Envio de mensagem não é idempotente: lease expirado vai para incerto.
    repetivel: false,
    maxTentativas: 3,
  };
}

export function lerPayloadMensagem(payload: unknown): PayloadMensagemRecebida | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  const ok = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
  if (!ok(p.mensagem_id) || !ok(p.conversation_id) || !ok(p.session_id)) return null;
  return { mensagem_id: p.mensagem_id, conversation_id: p.conversation_id, session_id: p.session_id };
}

export function recenteParaReenfileirar(criadoEm: string | null | undefined, agora = Date.now()): boolean {
  const t = criadoEm ? Date.parse(criadoEm) : NaN;
  return Number.isFinite(t) && agora - t <= JANELA_REENFILEIRAR_MS;
}

/** Comparação em tempo constante do token do Evolution (CLIN-QA-217). */
export function tokenConfere(fornecido: string, esperado: string): boolean {
  if (!fornecido || !esperado) return false;
  const a = new TextEncoder().encode(fornecido);
  const b = new TextEncoder().encode(esperado);
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i];
  return diff === 0;
}
