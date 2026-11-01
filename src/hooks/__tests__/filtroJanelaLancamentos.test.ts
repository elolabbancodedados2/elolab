import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/contexts/SupabaseAuthContext', () => ({ useSupabaseAuth: () => ({}) }));

import { filtroJanelaLancamentos } from '../useSupabaseData';

describe('filtroJanelaLancamentos', () => {
  it('inclui o período por data, vencimento ou pagamento, mais os em aberto e recorrentes', () => {
    const filtro = filtroJanelaLancamentos({ inicio: '2026-05-01', fim: '2026-10-31' });
    expect(filtro).toBe([
      'and(data.gte.2026-05-01,data.lte.2026-10-31)',
      'and(data_vencimento.gte.2026-05-01,data_vencimento.lte.2026-10-31)',
      'and(data_pagamento.gte.2026-05-01,data_pagamento.lte.2026-10-31)',
      'status.in.(pendente,atrasado,parcial)',
      'recorrente.is.true',
    ].join(','));
  });
});
