import { describe, expect, it } from 'vitest';
import { filaRealtimeMessage, filaRealtimeState } from './filaRealtimeStatus';
import { readFileSync } from 'node:fs';

describe('filaRealtimeState', () => {
  it('distinguishes active, connecting and fallback states', () => {
    expect(filaRealtimeState('SUBSCRIBED')).toBe('connected');
    expect(filaRealtimeState('CHANNEL_ERROR')).toBe('fallback');
    expect(filaRealtimeState('TIMED_OUT')).toBe('fallback');
    expect(filaRealtimeState('CLOSED')).toBe('fallback');
    expect(filaRealtimeState('JOINING')).toBe('connecting');
    expect(filaRealtimeMessage('fallback')).toContain('15 s');
    expect(filaRealtimeMessage('fallback')).toContain('atualizar manualmente');
  });

  it('connects the visible status to subscription state and preserves manual refresh', () => {
    const source = readFileSync('src/pages/Fila.tsx', 'utf8');
    expect(source).toMatch(/\.subscribe\(\(status\) => setRealtimeStatus\(status\)\)/);
    expect(source).toMatch(/filaRealtimeMessage\(queueRealtimeState\)/);
    expect(source).toMatch(/aria-label="Atualizar fila"/);
    expect(source).toMatch(/refetchInterval:\s*15_000/);
  });
});
