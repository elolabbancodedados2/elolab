export type FilaRealtimeState = 'connected' | 'connecting' | 'fallback';

export function filaRealtimeState(status: string): FilaRealtimeState {
  if (status === 'SUBSCRIBED') return 'connected';
  if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') return 'fallback';
  return 'connecting';
}

export function filaRealtimeMessage(state: FilaRealtimeState): string {
  if (state === 'connected') return 'Atualizações em tempo real ativas';
  if (state === 'fallback') return 'Tempo real indisponível. Atualização automática a cada 15 s; você pode atualizar manualmente.';
  return 'Conectando ao tempo real. Atualização automática a cada 15 s.';
}
