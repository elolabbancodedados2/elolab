import { describe, expect, it } from 'vitest';
import { cursorAposAtualizacaoWorklist } from '../laudoWorklist';

describe('cursor da worklist de laudos', () => {
  it('preserva o cursor antigo quando já foram carregadas páginas históricas', () => {
    const cursorAtual = { created_at: '2026-01-01T00:00:00Z', id: 'oldest-loaded' };
    const cursorRecente = { created_at: '2026-10-01T00:00:00Z', id: 'newest-window' };
    expect(cursorAposAtualizacaoWorklist(cursorAtual, cursorRecente, true)).toEqual(cursorAtual);
  });

  it('inicializa a paginação pela janela mais recente antes de carregar histórico', () => {
    const cursorRecente = { created_at: '2026-10-01T00:00:00Z', id: 'newest-window' };
    expect(cursorAposAtualizacaoWorklist(null, cursorRecente, false)).toEqual(cursorRecente);
  });
});
