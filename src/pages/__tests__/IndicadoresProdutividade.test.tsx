import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: [
      { metric_key: 'appointments_completed', label: 'Atendimentos concluídos', current_value: 12, previous_value: 10, unit: 'atendimentos', scope: 'Clínica' },
      { metric_key: 'payments_received', label: 'Pagamentos recebidos', current_value: 7, previous_value: 6, unit: 'pagamentos', scope: 'Clínica' },
    ],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock('@/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => ({ user: { id: 'staff-1' }, clinicaId: 'clinic-1', isLoading: false }),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import IndicadoresProdutividade from '../IndicadoresProdutividade';

describe('IndicadoresProdutividade', () => {
  afterEach(() => { delete document.documentElement.dataset.contrast; });

  it('usa os tokens do tema nas métricas para respeitar contraste pessoal', () => {
    document.documentElement.dataset.contrast = 'high';
    render(<IndicadoresProdutividade />);

    for (const label of ['Atendimentos concluídos', 'Pagamentos recebidos']) {
      const title = screen.getByText(label);
      const card = title.closest('div[class*="bg-card"]');
      expect(card).not.toBeNull();
      expect(card).toHaveClass('border-border');
      expect(card).toHaveClass('bg-card');
      expect(card).not.toHaveClass('bg-gradient-to-br');
    }
  });
});
