import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));

beforeEach(() => rpc.mockReset());

describe('transições operacionais atômicas', () => {
  it('faz check-in em uma única chamada ao banco', async () => {
    rpc.mockResolvedValue({ data: { repetido: false, fila_id: 'f1' }, error: null });
    const { atomicCheckin } = await import('@/lib/operationalTransitions');
    const result = await atomicCheckin('a1');
    expect(result.success).toBe(true);
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith('realizar_checkin', { p_agendamento_id: 'a1' });
  });

  it('trata repetição de check-in como sucesso idempotente', async () => {
    rpc.mockResolvedValue({ data: { repetido: true, fila_id: 'f1' }, error: null });
    const { atomicCheckin } = await import('@/lib/operationalTransitions');
    const result = await atomicCheckin('a1');
    expect(result.success).toBe(true);
    expect(result.actions).toEqual([]);
  });

  it('não anuncia sucesso quando o banco rejeita a transição', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('Triagem pendente') });
    const { atomicStartAppointment } = await import('@/lib/operationalTransitions');
    const result = await atomicStartAppointment('a1', 'f1');
    expect(result.success).toBe(false);
    expect(result.message).toContain('Triagem pendente');
  });
});
