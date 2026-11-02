import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ordenarOrdensDoAtivo, rotuloAuditoria, situacaoGarantia } from '@/lib/patrimonioOperacao';

const estado = vi.hoisted(() => ({ data: undefined as unknown, error: null as unknown, mutate: vi.fn() }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: estado.data, error: estado.error, isLoading: false, isFetching: false, refetch: vi.fn() }),
  useMutation: () => ({ mutate: estado.mutate, isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock('@/contexts/SupabaseAuthContext', () => ({ useSupabaseAuth: () => ({ profile: { clinica_id: 'clinic-1' } }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: vi.fn() }, storage: { from: vi.fn() } } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/dateOnly', async (original) => ({ ...(await original<typeof import('@/lib/dateOnly')>()), todaySaoPauloDateOnly: () => '2026-11-01' }));

import PatrimonioEquipamentos from '../PatrimonioEquipamentos';

const ativo = {
  id: 'a1', room_id: null, name: 'Monitor multiparamétrico', category: 'clinical', manufacturer: null, model: null, serial_number: null, asset_tag: null,
  acquired_on: null, warranty_until: '2026-12-01', calibration_due: null, maintenance_interval_days: 90, responsible_user_id: null, status: 'active',
  block_room_when_unavailable: false, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z',
};
const ordem = (id: string, status: string, created_at: string) => ({
  id, asset_id: 'a1', kind: 'corrective', status, priority: 'normal', title: `OS ${id}`, description: null, due_on: null, assigned_to: null,
  opened_by: 'u1', completion_note: null, completed_at: null, created_at, updated_at: created_at,
});

function renderizar(extra: Record<string, unknown> = {}) {
  estado.data = { assets: [ativo], orders: [], documents: [], audit: [], rooms: [], profiles: [], canManageAssets: true, canMaintain: true, canOpenOrders: true, ...extra };
  return render(<MemoryRouter><PatrimonioEquipamentos /></MemoryRouter>);
}

describe('Patrimônio', () => {
  it('pede confirmação antes de aposentar e mostra o alerta de garantia', () => {
    estado.mutate.mockReset();
    renderizar();
    expect(screen.getByText(/A garantia termina em 30 dias/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Aposentar' }));
    expect(estado.mutate).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toHaveTextContent('sai de operação de vez');
    fireEvent.click(screen.getAllByRole('button', { name: 'Aposentar' }).at(-1)!);
    expect(estado.mutate).toHaveBeenCalledWith(expect.objectContaining({ action: 'update_asset', patch: { status: 'retired' } }), expect.anything());
  });

  it('mostra ordens abertas antigas primeiro, ver todas e cancelar OS', () => {
    const encerradas = Array.from({ length: 6 }, (_, i) => ordem(`c${i}`, 'completed', `2026-10-2${i}T00:00:00Z`));
    renderizar({ orders: [...encerradas, ordem('velha', 'open', '2026-01-01T00:00:00Z')] });
    expect(screen.getByText(/OS velha/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver todas (7)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar OS' })).toBeInTheDocument();
  });

  it('não derruba a tela quando a atualização falha com dados', () => {
    estado.error = new Error('rede');
    renderizar();
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível atualizar o patrimônio');
    expect(screen.getByText('Monitor multiparamétrico')).toBeInTheDocument();
    estado.error = null;
  });
});

describe('patrimônio: regras', () => {
  it('traduz a auditoria', () => {
    expect(rotuloAuditoria('order_updated', { status: 'cancelled' }, { status: {}, ordem: { cancelled: 'Cancelada' } })).toBe('Ordem de serviço atualizada: cancelada');
    expect(rotuloAuditoria('document_added', {}, { status: {}, ordem: {} })).toBe('Documento anexado');
  });

  it('ordena ordens e classifica a garantia', () => {
    expect(ordenarOrdensDoAtivo([ordem('n', 'completed', '2026-10-01'), ordem('a', 'open', '2026-01-01')]).map(o => o.id)).toEqual(['a', 'n']);
    expect(situacaoGarantia('2027-06-01', '2026-11-01')).toEqual({ tipo: 'vigente' });
    expect(situacaoGarantia('2026-11-20', '2026-11-01')).toEqual({ tipo: 'termina', dias: 19 });
    expect(situacaoGarantia('2026-10-01', '2026-11-01')).toEqual({ tipo: 'vencida' });
  });
});
