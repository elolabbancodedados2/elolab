import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }));

import { revokePatientPortalLinks } from './patientPortalAccess';

describe('revokePatientPortalLinks', () => {
  beforeEach(() => vi.clearAllMocks());

  it('revokes links through the clinic-scoped server RPC and returns the count', async () => {
    mocks.rpc.mockResolvedValue({ data: 2, error: null });

    await expect(revokePatientPortalLinks('patient-1')).resolves.toBe(2);
    expect(mocks.rpc).toHaveBeenCalledWith('revogar_links_portal_paciente', {
      p_paciente_id: 'patient-1',
    });
  });

  it('returns zero when no active link exists', async () => {
    mocks.rpc.mockResolvedValue({ data: 0, error: null });
    await expect(revokePatientPortalLinks('patient-1')).resolves.toBe(0);
  });

  it('propagates authorization or server errors', async () => {
    const error = new Error('Sem permissão');
    mocks.rpc.mockResolvedValue({ data: null, error });
    await expect(revokePatientPortalLinks('patient-1')).rejects.toBe(error);
  });
});
