import { describe, expect, it } from 'vitest';
import { canAccessReceptionTab, getReceptionCashTab } from '../cashierAccess';

describe('acesso às áreas de recepção e caixa', () => {
  it('limita a recepção a administradores e à equipe de recepção', () => {
    expect(canAccessReceptionTab(['admin'])).toBe(true);
    expect(canAccessReceptionTab(['recepcao'])).toBe(true);
    expect(canAccessReceptionTab(['financeiro'])).toBe(false);
  });

  it('envia o perfil financeiro ao Caixa Diário', () => {
    expect(getReceptionCashTab(null, ['financeiro'])).toBe('caixa');
    expect(getReceptionCashTab('recepcao', ['financeiro'])).toBe('caixa');
    expect(getReceptionCashTab(null, ['recepcao'])).toBe('recepcao');
    expect(getReceptionCashTab('caixa', ['recepcao'])).toBe('caixa');
  });
});
