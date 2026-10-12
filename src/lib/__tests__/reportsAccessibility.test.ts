import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const files = [
  'src/components/relatorios/RelatorioCustomizado.tsx',
  'src/pages/Relatorios.tsx',
  'src/pages/Analytics.tsx',
];

describe('nomes acessíveis dos controles de relatórios', () => {
  it('associa nomes acessíveis a todos os seletores', () => {
    for (const path of files) {
      const source = readFileSync(path, 'utf8');
      const triggers = source.match(/<SelectTrigger\b[^>]*>/g) ?? [];
      expect(triggers.length, path).toBeGreaterThan(0);
      expect(triggers.every((tag) => /aria-label(?:ledby)?=/.test(tag)), path).toBe(true);
    }
  });

  it('fornece nome direto ou associação por id a entradas e textos', () => {
    const source = readFileSync(files[0], 'utf8');
    const fields = source.match(/<(?:Input|Textarea)\b[^>]*>/g) ?? [];
    expect(fields.length).toBeGreaterThan(0);
    expect(fields.every((tag) => /\bid=|aria-label=/.test(tag)), files[0]).toBe(true);
  });
});
