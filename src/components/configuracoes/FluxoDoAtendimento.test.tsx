import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { queryResult } = vi.hoisted(() => ({ queryResult: { current: { data: undefined, isLoading: false, isError: true, error: new Error('network unavailable'), refetch: vi.fn() } as any } }));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => queryResult.current, useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('@/contexts/SupabaseAuthContext', () => ({ useSupabaseAuth: () => ({ profile: { clinica_id: 'clinic-1' }, user: { id: 'owner-1' } }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { FluxoDoAtendimento } from './FluxoDoAtendimento';

describe('FluxoDoAtendimento', () => {
  it('does not show default off settings when the clinic rules fail to load', () => {
    render(<FluxoDoAtendimento />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Pagamento antes da consulta' })).not.toBeInTheDocument();
  });
});
