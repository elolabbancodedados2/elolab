import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { refetch, useQuery, navigate, auth, router, setSearchParams } = vi.hoisted(() => ({
  refetch: vi.fn(),
  useQuery: vi.fn(),
  navigate: vi.fn(),
  auth: { profile: { clinica_id: 'clinic-1', roles: [] as string[] } },
  router: { search: '' },
  setSearchParams: vi.fn((next: URLSearchParams | ((current: URLSearchParams) => URLSearchParams)) => {
    const current = new URLSearchParams(router.search);
    router.search = (typeof next === 'function' ? next(current) : next).toString();
  }),
}));

vi.mock('@tanstack/react-query', () => ({ useQuery }));
vi.mock('@/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => ({ user: { id: 'user-1' }, profile: auth.profile }),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
  useSearchParams: () => [new URLSearchParams(router.search), setSearchParams],
}));

import { PatientTimeline } from '../PatientTimeline';

describe('PatientTimeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.profile.roles = [];
    router.search = '';
    useQuery.mockReturnValue({ data: undefined, isLoading: false, error: new Error('offline'), refetch });
  });

  it('offers a retry action when history fails to load', () => {
    render(<PatientTimeline pacienteId="patient-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(refetch).toHaveBeenCalledOnce();
  });

  it('shows the loading state while history is being fetched', () => {
    useQuery.mockReturnValue({ data: undefined, isLoading: true, error: null, refetch });
    render(<PatientTimeline pacienteId="patient-1" />);
    expect(screen.getByText('Histórico Completo do Paciente')).toBeInTheDocument();
    expect(document.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('recovers safely when the summary URL is opened without an in-memory summary', () => {
    router.search = '?tab=historico&timeline=summary';
    useQuery.mockReturnValue({ data: [], isLoading: false, error: null, refetch });
    const { rerender } = render(<PatientTimeline pacienteId="patient-1" />);

    expect(screen.getByRole('heading', { name: 'Resumo clínico inteligente' })).toBeInTheDocument();
    expect(screen.getByText(/Este resumo não está carregado nesta sessão/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao histórico' }));
    expect(router.search).toBe('tab=historico');
    rerender(<PatientTimeline pacienteId="patient-1" />);
    expect(screen.getByRole('heading', { name: /Histórico Completo do Paciente/ })).toBeInTheDocument();
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

  it('distinguishes a patient with no history from a search with no matches and can reset filters', () => {
    useQuery.mockReturnValue({ data: [], isLoading: false, error: null, refetch });
    const { rerender } = render(<PatientTimeline pacienteId="patient-3" />);
    expect(screen.getByText('Este paciente ainda não possui eventos no histórico.')).toBeInTheDocument();

    useQuery.mockReturnValue({
      data: [{ id: 'exam-2', type: 'exame', date: new Date('2026-10-12T12:00:00'), title: 'Hemograma' }],
      isLoading: false, error: null, refetch,
    });
    rerender(<PatientTimeline pacienteId="patient-3" />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar no histórico do paciente' }), { target: { value: 'ecografia' } });
    expect(screen.getByText('Nenhum evento corresponde a esta busca.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Limpar busca e filtros' }));
    expect(screen.getByText('Hemograma')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Todos \(1\)/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps an event without a valid date and labels the missing date', () => {
    useQuery.mockReturnValue({
      data: [{ id: 'exam-undated', type: 'exame', date: null, title: 'Exame sem data' }],
      isLoading: false, error: null, refetch,
    });
    render(<PatientTimeline pacienteId="patient-4" />);
    expect(screen.getByText('Exame sem data')).toBeInTheDocument();
    expect(screen.getByText('Data não informada')).toBeInTheDocument();
  });
});
