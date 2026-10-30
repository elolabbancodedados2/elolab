import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), functions: { invoke: vi.fn() } } }));
vi.mock('@/contexts/SupabaseAuthContext', () => ({ useSupabaseAuth: () => ({ user: { id: 'admin-2' } }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), loading: vi.fn(), dismiss: vi.fn() } }));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
    data: queryKey[0] === 'platform-restores'
      ? [{ id: 'r1', backup_name: 'backup.json', reason: 'Restauração solicitada para teste', scope: 'full', status: 'requested', requested_at: '2026-10-01T10:00:00Z', requested_by: 'admin-1' }]
      : { generated_at: '2026-10-01T10:00:00Z', retention_days: 30, backup_schedule: '', verification_schedule: '', files: [], logs: [] },
  }),
}));

import PlatformBackups from '@/pages/PlatformBackups';

describe('decisão de restauração', () => {
  it('confirma rejeição com botão destrutivo', async () => {
    render(<MemoryRouter><PlatformBackups /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Rejeitar' }));
    const action = await screen.findByRole('button', { name: 'Confirmar rejeição' });
    expect(action.className).toContain('bg-destructive');
    expect(action.className).toContain('text-destructive-foreground');
  });

  it('mantém a aprovação no estilo primário', async () => {
    render(<MemoryRouter><PlatformBackups /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Aprovar' }));
    const action = await screen.findByRole('button', { name: 'Confirmar aprovação' });
    expect(action.className).not.toContain('bg-destructive');
    expect(action.className).toContain('bg-primary');
  });
});
