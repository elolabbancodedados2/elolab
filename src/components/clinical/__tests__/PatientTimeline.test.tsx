import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { refetch, useQuery } = vi.hoisted(() => ({
  refetch: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({ useQuery }));
vi.mock('@/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => ({ user: { id: 'user-1' }, profile: { clinica_id: 'clinic-1' } }),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { PatientTimeline } from '../PatientTimeline';

describe('PatientTimeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useQuery.mockReturnValue({ data: undefined, isLoading: false, error: new Error('offline'), refetch });
  });

  it('offers a retry action when history fails to load', () => {
    render(<PatientTimeline pacienteId="patient-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(refetch).toHaveBeenCalledOnce();
  });
});
