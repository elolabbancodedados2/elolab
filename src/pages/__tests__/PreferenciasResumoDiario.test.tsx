import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

const upsert = vi.fn(async (_row: Record<string, unknown>, _options?: unknown) => ({ error: null }));
vi.mock('@/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => ({ user: { id: 'u1' }, profile: { clinica_id: 'c1', roles: ['recepcao'] } }),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
      upsert,
    }),
  },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import PreferenciasPessoais from '../PreferenciasPessoais';

describe('Resumo diário por e-mail', () => {
  it('permite ativar o resumo e salva o opt-in no servidor', async () => {
    render(<MemoryRouter><PreferenciasPessoais /></MemoryRouter>);
    const toggle = await screen.findByRole('switch', { name: /resumo diário por e-mail/i });
    expect(screen.queryByText(/indisponível/i)).not.toBeInTheDocument();
    expect(screen.getByText(/somente contagens/i)).toBeInTheDocument();

    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole('button', { name: /salvar preferências/i }));
    await waitFor(() => expect(upsert).toHaveBeenCalled());
    expect(upsert.mock.calls[0][0]).toMatchObject({ user_id: 'u1', clinica_id: 'c1', email_daily_summary: true });
  });
});
