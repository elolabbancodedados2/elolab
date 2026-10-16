import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mocks.from } }));

import { loadPatientConsentRecords } from './patientConsentRecords';

describe('loadPatientConsentRecords', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads only consent history for the selected patient and clinic', async () => {
    const query = {
      select: vi.fn(), eq: vi.fn(), order: vi.fn(),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.order.mockResolvedValue({ data: [{ id: 'consent-1', aceito: true }], error: null });
    mocks.from.mockReturnValue(query);

    await expect(loadPatientConsentRecords('clinic-1', 'patient-1')).resolves.toEqual([
      { id: 'consent-1', aceito: true },
    ]);
    expect(mocks.from).toHaveBeenCalledWith('consentimentos_lgpd');
    expect(query.eq).toHaveBeenNthCalledWith(1, 'clinica_id', 'clinic-1');
    expect(query.eq).toHaveBeenNthCalledWith(2, 'paciente_id', 'patient-1');
    expect(query.order).toHaveBeenCalledWith('updated_at', { ascending: false });
  });

  it('does not hide query failures', async () => {
    const query = { select: vi.fn(), eq: vi.fn(), order: vi.fn() };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    const error = new Error('Falha de leitura');
    query.order.mockResolvedValue({ data: null, error });
    mocks.from.mockReturnValue(query);
    await expect(loadPatientConsentRecords('clinic-1', 'patient-1')).rejects.toBe(error);
  });
});
