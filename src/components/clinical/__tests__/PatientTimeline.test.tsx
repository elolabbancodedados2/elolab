import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { refetch, useQuery, navigate, auth } = vi.hoisted(() => ({
  refetch: vi.fn(),
  useQuery: vi.fn(),
  navigate: vi.fn(),
  auth: { profile: { clinica_id: 'clinic-1', roles: [] as string[] } },
}));

vi.mock('@tanstack/react-query', () => ({ useQuery }));
vi.mock('@/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => ({ user: { id: 'user-1' }, profile: auth.profile }),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));

import { PatientTimeline } from '../PatientTimeline';

describe('PatientTimeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.profile.roles = [];
    useQuery.mockReturnValue({ data: undefined, isLoading: false, error: new Error('offline'), refetch });
  });

  it('offers a retry action when history fails to load', () => {
    render(<PatientTimeline pacienteId="patient-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(refetch).toHaveBeenCalledOnce();
  });

  it('shows only role-authorized next actions for timeline events', () => {
    auth.profile.roles = ['enfermagem'];
    useQuery.mockReturnValue({
      data: [
        { id: 'ag-appointment-1', type: 'agendamento', date: new Date('2026-10-12T12:00:00'), title: 'Agendamento' },
        { id: 'exam-1', type: 'exame', date: new Date('2026-10-12T12:00:00'), title: 'Exame' },
        { id: 'tr-triage-1', type: 'triagem', date: new Date('2026-10-12T12:00:00'), title: 'Triagem' },
      ], isLoading: false, error: null, refetch,
    });

    render(<PatientTimeline pacienteId="patient-1" />);

    expect(screen.queryByRole('button', { name: /Abrir atendimento/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ver exames deste paciente/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Abrir triagem do paciente/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Ver exames deste paciente/ }));
    expect(navigate).toHaveBeenCalledWith('/exames?paciente=patient-1');
  });

  it('preserves patient and appointment context when a clinician opens an appointment', () => {
    auth.profile.roles = ['medico'];
    useQuery.mockReturnValue({
      data: [{ id: 'ag-appointment-2', type: 'agendamento', date: new Date('2026-10-12T12:00:00'), title: 'Consulta' }],
      isLoading: false, error: null, refetch,
    });

    render(<PatientTimeline pacienteId="patient-2" />);
    fireEvent.click(screen.getByRole('button', { name: /Abrir atendimento/ }));
    expect(navigate).toHaveBeenCalledWith('/prontuarios?paciente=patient-2&agendamento=appointment-2');
  });
});
