import { describe, expect, it } from 'vitest';
import { isInvitationExpired } from '../../../supabase/functions/_shared/invitationExpiry';

describe('isInvitationExpired', () => {
  const now = Date.parse('2026-10-08T12:00:00.000Z');

  it('considers an already expired invitation invalid', () => {
    expect(isInvitationExpired('2026-10-08T11:59:59.999Z', now)).toBe(true);
  });

  it('considers an invitation expired at its exact deadline', () => {
    expect(isInvitationExpired('2026-10-08T12:00:00.000Z', now)).toBe(true);
  });

  it('keeps a future invitation valid', () => {
    expect(isInvitationExpired('2026-10-08T12:00:00.001Z', now)).toBe(false);
  });

  it('fails closed for an invalid expiration date', () => {
    expect(isInvitationExpired('invalid', now)).toBe(true);
  });
});
