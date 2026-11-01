import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

import { separarConfirmacoes } from '@/pages/AgendaConfirmacoesPage';
import { agruparParaImpressao } from '@/pages/AgendaImpressaoPage';
import { ordenarVagas } from '@/lib/buscaVaga';

describe('páginas novas da agenda', () => {
  it('confirmação separa marcadas de confirmadas em ordem de horário', () => {
    const { pendentes, confirmadas } = separarConfirmacoes([
      { id: 'b', hora_inicio: '10:00:00', status: 'agendado' },
      { id: 'a', hora_inicio: '08:00:00', status: 'agendado' },
      { id: 'c', hora_inicio: '09:00:00', status: 'confirmado' },
      { id: 'd', hora_inicio: '07:00:00', status: 'cancelado' },
    ]);
    expect(pendentes.map(a => a.id)).toEqual(['a', 'b']);
    expect(confirmadas.map(a => a.id)).toEqual(['c']);
  });

  it('impressão agrupa por profissional e dia e respeita o filtro de médicos', () => {
    const grupos = agruparParaImpressao([
      { id: '1', medico_id: 'm1', data: '2026-11-03', hora_inicio: '09:00' },
      { id: '2', medico_id: 'm2', data: '2026-11-03', hora_inicio: '08:00' },
      { id: '3', medico_id: 'm1', data: '2026-11-02', hora_inicio: '10:00' },
    ], ['m1']);
    expect([...grupos.keys()]).toEqual(['m1']);
    expect([...grupos.get('m1')!.keys()]).toEqual(['2026-11-02', '2026-11-03']);
  });

  it('busca de vaga põe a mais cedo primeiro', () => {
    expect(ordenarVagas([
      { medico_id: 'b', data: '2026-11-04', hora_inicio: '08:00' },
      { medico_id: 'a', data: '2026-11-03', hora_inicio: '14:00' },
      { medico_id: 'c', data: '2026-11-03', hora_inicio: '09:30' },
    ]).map(v => v.medico_id)).toEqual(['c', 'a', 'b']);
  });
});
