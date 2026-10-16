import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }));

import { isValidPatientStatusReason, setPatientActiveStatus } from './patientStatus';

describe('patient status changes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires a categorized administrative reason before changing status', () => {
    expect(isValidPatientStatusReason('')).toBe(false);
    expect(isValidPatientStatusReason('free text')).toBe(false);
    expect(isValidPatientStatusReason('solicitacao_titular')).toBe(true);
  });

  it('delegates clinic authorization and event recording to the server RPC', async () => {
    mocks.rpc.mockResolvedValue({ data: { ativo: false, alterado: true }, error: null });
    await expect(setPatientActiveStatus('patient-1', false, 'solicitacao_titular')).resolves.toEqual({
      ativo: false,
      alterado: true,
    });
    expect(mocks.rpc).toHaveBeenCalledWith('alterar_status_paciente', {
      p_paciente_id: 'patient-1',
      p_ativo: false,
      p_motivo: 'solicitacao_titular',
    });
  });

  it('does not swallow server failures', async () => {
    const error = new Error('Há consulta futura');
    mocks.rpc.mockResolvedValue({ data: null, error });
    await expect(setPatientActiveStatus('patient-1', false, 'solicitacao_titular')).rejects.toBe(error);
  });
});
