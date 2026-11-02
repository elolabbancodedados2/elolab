import { describe, expect, it } from 'vitest';
import { cursorAposAtualizacaoWorklist, mensagemWhatsAppLaudo, mesclarJanelaLaudos } from '../laudoWorklist';

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

describe('mescla da janela recarregada', () => {
  const c = (id: string, dia: string, v = 1) => ({ id, created_at: `2026-10-${dia}T10:00:00Z`, v });

  it('substitui o trecho recarregado e remove o que saiu dele', () => {
    const atuais = [c('velha', '01'), c('a', '10'), c('sem-resultado-agora', '11')];
    const janela = [c('a', '10', 2), c('nova', '12')];
    const resultado = mesclarJanelaLaudos(atuais, janela, { created_at: '2026-10-05T00:00:00Z', id: 'x' }, true);
    expect(resultado.map(item => [item.id, item.v])).toEqual([['velha', 1], ['a', 2], ['nova', 1]]);
  });

  it('sem janela completa não há histórico separado para manter', () => {
    const resultado = mesclarJanelaLaudos([c('velha', '01')], [c('a', '10')], { created_at: '2026-10-10T10:00:00Z', id: 'a' }, false);
    expect(resultado.map(item => item.id)).toEqual(['a']);
  });
});

describe('mensagem de WhatsApp do laudo', () => {
  it('fala de disponibilidade só quando tudo foi liberado', () => {
    expect(mensagemWhatsAppLaudo('Ana', 'A1', 'liberado', false)).toContain('está disponível');
    expect(mensagemWhatsAppLaudo('Ana', 'A1', 'pendente', false)).toContain('em análise');
    expect(mensagemWhatsAppLaudo('Ana', 'A1', 'parcial', false)).toContain('Parte dos resultados');
  });

  it('não sugere mensagem com resultado crítico', () => {
    expect(mensagemWhatsAppLaudo('Ana', 'A1', 'liberado', true)).toBeNull();
  });
});
