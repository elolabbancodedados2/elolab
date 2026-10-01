/**
 * Nome único para um canal de realtime.
 *
 * `supabase.channel(nome)` devolve o canal EXISTENTE quando o nome se repete.
 * Se esse canal já recebeu `.subscribe()`, o `.on(...)` seguinte lança
 * "cannot add `postgres_changes` callbacks ... after `subscribe()`" e derruba a
 * tela. Acontecia no Chat Interno (a página e o painel flutuante montam juntos
 * e geravam `chat-realtime-${Date.now()}` no mesmo milissegundo) e pode
 * acontecer com qualquer nome fixo quando o componente remonta antes de o
 * canal anterior ser removido.
 */
export function canalUnico(prefixo: string): string {
  const sufixo = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefixo}:${sufixo}`;
}
