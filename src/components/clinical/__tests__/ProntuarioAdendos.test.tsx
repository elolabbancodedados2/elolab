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
    render(<ProntuarioAdendos prontuarioId="prontuario-1" medicoNome="Dra. Ana" crm="CRM 123" />);

    expect(await screen.findByText(/Não foi possível carregar/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/i }));
    expect(await screen.findByText(/Nenhum adendo registrado/i)).toBeInTheDocument();
  });

  it('opens the form and shows the doctor identity', async () => {
    selectResult.mockResolvedValue({ data: [], error: null });
    render(<ProntuarioAdendos prontuarioId="prontuario-1" medicoNome="Dra. Ana Costa" crm="CRM-SP 12345" />);

    fireEvent.click(screen.getByRole('button', { name: /Novo Adendo/i }));

    expect(await screen.findByText('Dra. Ana Costa')).toBeInTheDocument();
    expect(screen.getByText(/CRM-SP 12345/)).toBeInTheDocument();
    expect(screen.getByLabelText('Motivo *')).toBeInTheDocument();
    expect(screen.getByLabelText(/Conteúdo do Adendo/)).toBeInTheDocument();
  });
});
