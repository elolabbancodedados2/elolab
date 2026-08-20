import { describe, expect, it } from 'vitest';
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
});
