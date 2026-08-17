import { describe, expect, it } from 'vitest';
import { escapeHtml } from '@/lib/html';

describe('escapeHtml', () => {
  it('neutraliza marcação e atributos antes da impressão', () => {
    expect(escapeHtml(`<img src=x onerror="alert('x')">`)).toBe(
      '&lt;img src=x onerror=&quot;alert(&#039;x&#039;)&quot;&gt;',
    );
  });

  it('aceita valores nulos sem imprimir undefined', () => {
    expect(escapeHtml(null)).toBe('');
  });
});
