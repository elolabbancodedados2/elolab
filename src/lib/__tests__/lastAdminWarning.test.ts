import { describe, expect, it } from 'vitest';
import { shouldWarnAboutLastAdmin } from '../lastAdminWarning';

describe('aviso preventivo para alteração do último administrador', () => {
  it('avisa ao remover o papel admin de uma conta ativa vinculada', () => {
    expect(shouldWarnAboutLastAdmin({
      userLinked: true,
      currentActive: true,
      currentRoles: ['admin', 'recepcao'],
      nextActive: true,
      nextRoles: ['recepcao'],
    })).toBe(true);
  });

  it('avisa ao inativar uma conta que hoje tem papel admin', () => {
    expect(shouldWarnAboutLastAdmin({
      userLinked: true,
      currentActive: true,
      currentRoles: ['admin'],
      nextActive: false,
      nextRoles: ['admin'],
    })).toBe(true);
  });

  it('não avisa quando o papel admin permanece ativo ou a conta não está vinculada', () => {
    expect(shouldWarnAboutLastAdmin({
      userLinked: true,
      currentActive: true,
      currentRoles: ['admin'],
      nextActive: true,
      nextRoles: ['admin', 'medico'],
    })).toBe(false);
    expect(shouldWarnAboutLastAdmin({
      userLinked: false,
      currentActive: true,
      currentRoles: ['admin'],
      nextActive: false,
      nextRoles: [],
    })).toBe(false);
  });

  it('não avisa ao reativar uma conta já inativa', () => {
    expect(shouldWarnAboutLastAdmin({
      userLinked: true,
      currentActive: false,
      currentRoles: ['admin'],
      nextActive: true,
      nextRoles: ['admin'],
    })).toBe(false);
  });
});
