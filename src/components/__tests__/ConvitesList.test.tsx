import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  invites: [] as Array<Record<string, unknown>>,
  invalidateQueries: vi.fn(),
  invoke: vi.fn(),
  from: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
}));

type MutationOptions = {
  mutationFn: (value: unknown) => unknown;
  onSuccess?: (data: unknown, value: unknown) => void;
  onError?: (error: unknown) => void;
  onSettled?: (data: unknown, error: unknown, value: unknown) => void;
};

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => ({ data: queryKey[0] === 'convites-list' ? mocks.invites : undefined, isLoading: false, isError: false }),
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
  useMutation: (options: MutationOptions) => ({
    isPending: false,
    mutate: (value: unknown, callbacks?: { onSettled?: () => void }) => {
      void Promise.resolve(options.mutationFn(value))
        .then((data) => options.onSuccess?.(data, value))
        .catch((error) => options.onError?.(error))
        .finally(() => {
          options.onSettled?.(undefined, undefined, value);
          callbacks?.onSettled?.();
        });
    },
  }),
}));
vi.mock('@/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => ({ profile: { clinica_id: 'clinic-1' }, isPlatformAdmin: false }),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: mocks.invoke }, from: mocks.from },
}));
vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError, info: mocks.toastInfo },
}));
vi.mock('@/components/ConfirmDialog', () => ({
  ConfirmDialog: (props: { open: boolean; confirmLabel: string; onConfirm: () => void; description: string }) =>
    props.open ? <div><p>{props.description}</p><button onClick={props.onConfirm}>{props.confirmLabel}</button></div> : null,
}));

import { ConvitesList } from '@/components/ConvitesList';

const expiredInvite = (overrides: Record<string, unknown> = {}) => ({
  id: 'invite-1',
  source: 'employee_invitations',
  email: 'profissional@example.test',
  nome: 'Profissional',
  roles: ['recepcao'],
  token: 'old-token',
  created_at: '2026-10-01T12:00:00.000Z',
  expires_at: '2026-10-02T12:00:00.000Z',
  accepted_at: null,
  status: 'expirado',
  funcionario_id: 'employee-1',
  clinica_id: 'clinic-1',
  ...overrides,
});

describe('ConvitesList — gestão de convites expirados', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.invites = [expiredInvite()];
    mocks.invoke.mockResolvedValue({ data: { success: true, emailStatus: 'sent' }, error: null });
    const query = {
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'invite-1' }, error: null }),
    };
    mocks.from.mockReturnValue(query);
  });

  it('gera um novo convite somente para o destinatário expirado selecionado', async () => {
    render(<ConvitesList />);

    expect(screen.getByText('Expirado')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reenviar convite para profissional@example.test' }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith('invite-employee', {
      body: { email: 'profissional@example.test', nome: 'Profissional', roles: ['recepcao'] },
    }));
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['convites-list'] });
  });

  it('expira apenas o convite legado selecionado e restringe a operação à clínica ativa', async () => {
    render(<ConvitesList />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar convite para profissional@example.test' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar convite' }));

    await waitFor(() => expect(mocks.from).toHaveBeenCalledWith('employee_invitations'));
    const query = mocks.from.mock.results[0].value;
    expect(query.update).toHaveBeenCalledWith({ status: 'expired', expires_at: expect.any(String) });
    expect(query.eq).toHaveBeenNthCalledWith(1, 'id', 'invite-1');
    expect(query.eq).toHaveBeenNthCalledWith(2, 'clinica_id', 'clinic-1');
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['convites-list'] });
  });

  it('remove somente o convite novo selecionado ao cancelar', async () => {
    mocks.invites = [expiredInvite({ source: 'convites_funcionario' })];
    render(<ConvitesList />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar convite para profissional@example.test' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar convite' }));

    await waitFor(() => expect(mocks.from).toHaveBeenCalledWith('convites_funcionario'));
    const query = mocks.from.mock.results[0].value;
    expect(query.delete).toHaveBeenCalledOnce();
    expect(query.eq).toHaveBeenNthCalledWith(1, 'id', 'invite-1');
    expect(query.eq).toHaveBeenNthCalledWith(2, 'clinica_id', 'clinic-1');
  });
});
