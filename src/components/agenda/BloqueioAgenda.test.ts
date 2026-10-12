import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/components/agenda/BloqueioAgenda.tsx', 'utf8');

describe('conflito ao criar bloqueio de agenda', () => {
  it('explica quando o período colide com uma consulta existente', () => {
    expect(source).toMatch(/AGENDA_BLOQUEIO_CONFLITO/);
    expect(source).toMatch(/Existe uma consulta marcada neste período/);
  });
});
