import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }));

import {
  contactConfirmationSourceLabel,
  describeContactVerification,
  recordPatientContactVerification,
} from './patientContactVerification';

describe('patient contact verification', () => {
  beforeEach(() => vi.clearAllMocks());

  it('translates verification sources and identifies missing history', () => {
    expect(contactConfirmationSourceLabel('paciente')).toBe('Paciente');
    expect(contactConfirmationSourceLabel('responsavel')).toBe('Responsável');
    expect(contactConfirmationSourceLabel('equipe')).toBe('Equipe');
    expect(contactConfirmationSourceLabel('legacy')).toBe('Origem não registrada');
    expect(describeContactVerification(null, null)).toBe('Ainda não confirmado');
  });

  it('shows the confirmation date and source without returning the contact value', () => {
    expect(describeContactVerification('2026-10-14T15:30:00.000Z', 'paciente'))
      .toBe('Confirmado em 14/10/2026 · Paciente');
  });

  it('persists channel and source through the clinic-authorized RPC', async () => {
    mocks.rpc.mockResolvedValue({ error: null });
    await recordPatientContactVerification('patient-1', 'email', 'responsavel');
    expect(mocks.rpc).toHaveBeenCalledWith('registrar_confirmacao_contato_paciente', {
      p_paciente_id: 'patient-1', p_canal: 'email', p_origem: 'responsavel',
    });
  });
});
