import { describe, expect, it } from 'vitest';
import { carregarHistoricoRecente } from '../chatMessageHistory';

describe('carregarHistoricoRecente', () => {
  it('loads multiple pages newest-first and returns the history in chronological order', async () => {
    const records = [5, 4, 3, 2, 1].map((n) => ({ id: String(n), created_at: `2026-01-01T00:00:0${n}Z` }));
    const history = await carregarHistoricoRecente(async (offset, limit) => records.slice(offset, offset + limit), { pageSize: 2, maxRows: 10 });
    expect(history.messages.map((message) => message.id)).toEqual(['1', '2', '3', '4', '5']);
    expect(history.truncated).toBe(false);
  });

  it('reports when the configured history cap is reached', async () => {
    const records = [4, 3, 2, 1].map((n) => ({ id: String(n), created_at: `2026-01-01T00:00:0${n}Z` }));
    const history = await carregarHistoricoRecente(async (offset, limit) => records.slice(offset, offset + limit), { pageSize: 2, maxRows: 2 });
    expect(history.messages.map((message) => message.id)).toEqual(['3', '4']);
    expect(history.truncated).toBe(true);
  });

  it('checks for more rows when the final page only partially fills the cap', async () => {
    const records = [5, 4, 3, 2, 1].map((n) => ({ id: String(n), created_at: `2026-01-01T00:00:0${n}Z` }));
    const history = await carregarHistoricoRecente(async (offset, limit) => records.slice(offset, offset + limit), { pageSize: 2, maxRows: 3 });
    expect(history.messages.map((message) => message.id)).toEqual(['3', '4', '5']);
    expect(history.truncated).toBe(true);
  });
});
