import { describe, expect, it } from 'vitest';
import { canAccessCashTab, canAccessReceptionTab, canAccessRestrictedCashTabs, getReceptionCashTab } from '../cashierAccess';

describe('canAccessRestrictedCashTabs', () => {
  it('allows only administrators and finance staff into financial modules', () => {
    expect(canAccessRestrictedCashTabs(['admin'])).toBe(true);
    expect(canAccessRestrictedCashTabs(['financeiro'])).toBe(true);
    expect(canAccessRestrictedCashTabs(['recepcao'])).toBe(false);
    expect(canAccessRestrictedCashTabs(['enfermagem'])).toBe(false);
    expect(canAccessRestrictedCashTabs(['medico'])).toBe(false);
  });

  it('keeps daily cash tabs available while protecting linked financial modules', () => {
    expect(canAccessCashTab('hoje', ['recepcao'])).toBe(true);
    expect(canAccessCashTab('historico', ['recepcao'])).toBe(true);
    expect(canAccessCashTab('fluxo', ['recepcao'])).toBe(false);
    expect(canAccessCashTab('relatorios', ['recepcao'])).toBe(false);
  });

  it('keeps patient reception limited to administrators and reception staff', () => {
    expect(canAccessReceptionTab(['admin'])).toBe(true);
    expect(canAccessReceptionTab(['recepcao'])).toBe(true);
    expect(canAccessReceptionTab(['financeiro'])).toBe(false);
  });

  it('sends finance staff to the cash register even when the reception route has no tab parameter', () => {
    expect(getReceptionCashTab(null, ['financeiro'])).toBe('caixa');
    expect(getReceptionCashTab('recepcao', ['financeiro'])).toBe('caixa');
    expect(getReceptionCashTab(null, ['recepcao'])).toBe('recepcao');
    expect(getReceptionCashTab('caixa', ['recepcao'])).toBe('caixa');
  });
});
