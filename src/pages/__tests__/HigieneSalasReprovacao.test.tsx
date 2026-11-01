import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

const estado = vi.hoisted(() => ({ data: undefined as unknown }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: estado.data, error: null, isLoading: false, isFetching: false, refetch: vi.fn() }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock('@/contexts/SupabaseAuthContext', () => ({ useSupabaseAuth: () => ({ profile: { clinica_id: 'clinic-1' } }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: vi.fn() } } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import HigieneSalas from '../HigieneSalas';

const checklist = { id: 'ck1', version: 2, title: 'Entre atendimentos', items: [{ id: 'i1', label: 'Limpar bancada', required: true }], created_at: '2026-10-01T10:00:00Z' };

describe('HigieneSalas: reprovação e motivos', () => {
  it('mostra quem reprovou, a nota e oferece refazer o checklist', () => {
    estado.data = {
      rooms: [{ id: 'r1', nome: 'Consultório 1', status: 'limpeza', localizacao: null }],
      activeChecklistId: 'ck1', checklists: [checklist],
      executions: [{ id: 'e1', room_id: 'r1', checklist_version_id: 'ck1', started_by: 'u1', started_at: '2026-10-31T13:00:00Z', submitted_by: 'u1', submitted_at: '2026-10-31T13:10:00Z', completed_items: [], notes: null }],
      reviews: [{ id: 'v1', execution_id: 'e1', reviewer_id: 'u2', decision: 'rejected', note: 'Pia com resíduo', created_at: '2026-10-31T13:30:00Z' }],
      canReview: true, canConfigure: false,
    };
    render(<MemoryRouter><HigieneSalas /></MemoryRouter>);
    expect(screen.getByText(/Reprovada por Equipe/)).toBeInTheDocument();
    expect(screen.getAllByText(/Pia com resíduo/).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Refazer checklist/ })).toBeEnabled();
  });

  it('explica por que não dá para iniciar numa sala em uso', () => {
    estado.data = {
      rooms: [{ id: 'r1', nome: 'Consultório 1', status: 'ocupado', localizacao: null }],
      activeChecklistId: 'ck1', checklists: [checklist], executions: [], reviews: [], canReview: false, canConfigure: false,
    };
    render(<MemoryRouter><HigieneSalas /></MemoryRouter>);
    expect(screen.getByRole('button', { name: /Iniciar higienização/ })).toBeDisabled();
    expect(screen.getByText(/Sala em uso/)).toBeInTheDocument();
  });
});
