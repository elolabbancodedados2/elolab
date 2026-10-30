import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { selectResult } = vi.hoisted(() => ({ selectResult: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ order: selectResult }),
      }),
    }),
  },
}));

import { ProntuarioAdendos } from '@/components/clinical/ProntuarioAdendos';

describe('adendos de prontuario', () => {
  it('reports load errors and allows retry', async () => {
    selectResult.mockResolvedValueOnce({ data: null, error: new Error('Network failure') })
      .mockResolvedValueOnce({ data: [], error: null });
    render(<ProntuarioAdendos prontuarioId="prontuario-1" />);

    expect(await screen.findByText(/Não foi possível carregar/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/i }));
    expect(await screen.findByText(/Nenhum adendo registrado/i)).toBeInTheDocument();
  });

  it('navigates to the dedicated page to create an immutable addendum', async () => {
    selectResult.mockResolvedValue({ data: [], error: null });
    const onNovoAdendo = vi.fn();
    render(<ProntuarioAdendos prontuarioId="prontuario-1" onNovoAdendo={onNovoAdendo} />);

    fireEvent.click(screen.getByRole('button', { name: /Novo Adendo/i }));

    expect(onNovoAdendo).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
