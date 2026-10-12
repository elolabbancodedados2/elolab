import { describe, expect, it } from 'vitest';
import { canAccessPlanFeature } from '../planFeatures';

describe('acesso a recursos do plano', () => {
  it('bloqueia recursos quando a assinatura está expirada mesmo se o plano era Ultra', () => {
    expect(canAccessPlanFeature({ plano_slug: 'elolab-ultra', status: 'expirada' }, 'agente_ia')).toBe(false);
  });

  it('libera recursos compatíveis em planos ativos e em teste', () => {
    expect(canAccessPlanFeature({ plano_slug: 'elolab-ultra', status: 'ativa' }, 'agente_ia')).toBe(true);
    expect(canAccessPlanFeature({ plano_slug: 'elolab-ultra', status: 'trial' }, 'agente_ia')).toBe(true);
    expect(canAccessPlanFeature({ plano_slug: 'elolab-max', status: 'ativa' }, 'automacoes')).toBe(true);
  });

  it('mantém as restrições por plano e a isenção de administradores da plataforma', () => {
    expect(canAccessPlanFeature({ plano_slug: 'elolab-max', status: 'ativa' }, 'agente_ia')).toBe(false);
    expect(canAccessPlanFeature(null, 'agente_ia', true)).toBe(true);
  });
});
