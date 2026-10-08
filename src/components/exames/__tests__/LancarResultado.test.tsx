import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  updateResult: { data: null as { id: string } | null, error: null as Error | null },
  eq: vi.fn(),
  is: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('@/contexts/SupabaseAuthContext', () => ({ useSupabaseAuth: () => ({ profile: { clinica_id: 'clinica-1' } }) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => {
      type QueryBuilder = {
        update: ReturnType<typeof vi.fn>;
        eq: ReturnType<typeof vi.fn>;
        is: ReturnType<typeof vi.fn>;
        select: ReturnType<typeof vi.fn>;
        maybeSingle: ReturnType<typeof vi.fn>;
      };
      const query = {} as QueryBuilder;
      query.update = vi.fn(() => query);
      query.eq = vi.fn((...args: unknown[]) => { mocks.eq(...args); return query; });
      query.is = vi.fn((...args: unknown[]) => { mocks.is(...args); return query; });
      query.select = vi.fn(() => query);
      query.maybeSingle = vi.fn(async () => mocks.updateResult);
      return query;
    },
  },
}));
vi.mock('sonner', () => ({ toast: mocks.toast }));

import { LancarResultado } from '@/components/exames/LancarResultado';

describe('LancarResultado', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateResult = { data: null, error: null };
  });

  async function tentarSalvar(updated_at: string | null) {
    const onFechar = vi.fn();
    const aoSalvar = vi.fn();
    render(<LancarResultado
      exame={{ id: 'exame-1', tipo_exame: 'Hemograma', paciente_id: 'paciente-1', updated_at }}
      onFechar={onFechar}
      aoSalvar={aoSalvar}
    />);
    fireEvent.change(screen.getByLabelText('Resultado'), { target: { value: 'Resultado revisado' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lançar resultado' }));
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith(
      'Não foi possível lançar o resultado',
      expect.objectContaining({ description: expect.stringContaining('Não sobrescrevi os dados') }),
    ));
    expect(aoSalvar).not.toHaveBeenCalled();
    expect(onFechar).not.toHaveBeenCalled();
  }

  it('usa updated_at para não sobrescrever um resultado lançado por outra pessoa', async () => {
    await tentarSalvar('versao-1');

    expect(mocks.eq).toHaveBeenCalledWith('updated_at', 'versao-1');
    expect(mocks.is).not.toHaveBeenCalled();
  });

  it('também protege registros legados cujo updated_at é nulo', async () => {
    await tentarSalvar(null);

    expect(mocks.is).toHaveBeenCalledWith('updated_at', null);
    expect(mocks.eq).not.toHaveBeenCalledWith('updated_at', expect.anything());
  });
});
