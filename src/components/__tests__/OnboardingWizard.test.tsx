import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: { profile: { id: 'user-onboarding' } },
  maybeSingle: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock('@/contexts/SupabaseAuthContext', () => ({ useSupabaseAuth: () => mocks.auth }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }) }),
      upsert: mocks.upsert,
    }),
  },
}));

import { OnboardingWizard } from '@/components/OnboardingWizard';

describe('OnboardingWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    mocks.upsert.mockResolvedValue({ error: null });
  });

  it('dismisses the dialog for this session without saving completion', async () => {
    render(<OnboardingWizard />);
    await waitFor(() => expect(mocks.maybeSingle).toHaveBeenCalledOnce());
    await act(async () => { await new Promise(resolve => window.setTimeout(resolve, 1250)); });

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(localStorage.getItem('onboarding_done_user-onboarding')).toBeNull();
    expect(sessionStorage.getItem('onboarding_dismissed_user-onboarding')).toBe('true');
  });

  it('only persists completion after the final tour step', async () => {
    render(<OnboardingWizard />);
    await waitFor(() => expect(mocks.maybeSingle).toHaveBeenCalledOnce());
    await act(async () => { await new Promise(resolve => window.setTimeout(resolve, 1250)); });

    for (let step = 0; step < 5; step += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Próximo' }));
    }
    fireEvent.click(screen.getByRole('button', { name: 'Começar' }));

    await waitFor(() => expect(mocks.upsert).toHaveBeenCalledOnce());
    expect(localStorage.getItem('onboarding_done_user-onboarding')).toBe('true');
  });
});
