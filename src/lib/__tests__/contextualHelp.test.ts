import { describe, expect, it } from 'vitest';
import { tutorials } from '@/lib/treinamentoTutoriais';
import { getContextualHelp, getVisibleHelpLinks } from '@/lib/contextualHelp';

describe('contextualHelp', () => {
  it('retorna ajuda específica para a rota e para subrotas', () => {
    expect(getContextualHelp('/agenda').title).toBe('Organizar a agenda');
    expect(getContextualHelp('/agenda/novo').title).toBe('Organizar a agenda');
  });

  it('retorna conteúdo seguro padrão em telas sem orientação específica', () => {
    const help = getContextualHelp('/modulo-novo');
    expect(help.title).toBe('Ajuda desta tela');
    expect(help.steps).toHaveLength(3);
  });

  it('esconde atalhos incompatíveis com o papel', () => {
    const help = getContextualHelp('/configuracoes');
    expect(getVisibleHelpLinks(help, ['admin'])).toHaveLength(2);
    expect(getVisibleHelpLinks(help, ['recepcao'])).toHaveLength(0);
  });

  it('os atalhos para roteiros apontam para tutoriais existentes', () => {
    const keys = tutorials.map(tutorial => tutorial.key);
    for (const route of ['/caixa-diario', '/prontuarios', '/estoque']) {
      for (const link of getContextualHelp(route).links ?? []) {
        expect(keys).toContain(link.href.replace('/treinamento/', ''));
      }
    }
  });
});
