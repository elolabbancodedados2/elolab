import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));

beforeEach(() => rpc.mockReset());

describe('transições operacionais atômicas', () => {
  it('faz check-in em uma única chamada ao banco', async () => {
    rpc.mockResolvedValue({ data: { repetido: false, fila_id: 'f1', status_anterior: 'confirmado' }, error: null });
    const { atomicCheckin } = await import('@/lib/operationalTransitions');
    const result = await atomicCheckin('a1', 'clinic-1');
    expect(result.success).toBe(true);
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith('realizar_checkin', { p_agendamento_id: 'a1', p_prioridade: 'normal' });
    expect(result.filaId).toBe('f1');
    expect(result.statusAnterior).toBe('confirmado');
  });

  it('envia a prioridade escolhida para a transição atômica', async () => {
    rpc.mockResolvedValue({ data: { repetido: false, fila_id: 'f2', status_anterior: 'agendado' }, error: null });
    const { atomicCheckin } = await import('@/lib/operationalTransitions');
    const result = await atomicCheckin('a2', 'clinica-1', 'urgente');

    expect(result.success).toBe(true);
    expect(result.filaId).toBe('f2');
    expect(rpc).toHaveBeenCalledWith('realizar_checkin', { p_agendamento_id: 'a2', p_prioridade: 'urgente' });
  });

  it('trata repetição de check-in como sucesso idempotente', async () => {
    rpc.mockResolvedValue({ data: { repetido: true, fila_id: 'f1', status_anterior: 'aguardando' }, error: null });
    const { atomicCheckin } = await import('@/lib/operationalTransitions');
    const result = await atomicCheckin('a1', 'clinic-1');
    expect(result.success).toBe(true);
    expect(result.actions).toEqual([]);
    expect(result.filaId).toBe('f1');
    expect(result.statusAnterior).toBe('aguardando');
  });

  it('não anuncia sucesso quando o banco rejeita a transição', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('Triagem pendente') });
    const { atomicStartAppointment } = await import('@/lib/operationalTransitions');
    const result = await atomicStartAppointment('a1', 'f1');
    expect(result.success).toBe(false);
    expect(result.message).toContain('Triagem pendente');
  });

  it('conclui a fila em uma operação atômica', async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    const { atomicConcludeQueue } = await import('@/lib/operationalTransitions');
    const result = await atomicConcludeQueue('a5', 'f5');

    expect(result.success).toBe(true);
    expect(rpc).toHaveBeenCalledWith('concluir_fila_atomico', {
      p_agendamento_id: 'a5', p_fila_id: 'f5',
    });
  });

  it('não informa conclusão se o estado mudou no servidor', async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    const { atomicConcludeQueue } = await import('@/lib/operationalTransitions');
    const result = await atomicConcludeQueue('a6', 'f6');

    expect(result.success).toBe(false);
    expect(result.message).toContain('Atualize a recepção');
  });

  it('marca como não realizado na mesma operação que protege status e cobrança', async () => {
    rpc.mockResolvedValue({
      data: { desfeito: true, cobranca_cancelada: true, havia_cobranca: true },
      error: null,
    });
    const { atomicMarkNoShow } = await import('@/lib/operationalTransitions');
    const result = await atomicMarkNoShow('a3', 'clinic-1');

    expect(result.success).toBe(true);
    expect(result.cobrancaCancelada).toBe(true);
    expect(rpc).toHaveBeenCalledWith('marcar_atendimento_nao_realizado', {
      p_agendamento_id: 'a3', p_clinica_id: 'clinic-1',
    });
  });

  it('recusa o não comparecimento quando o estado mudou ou há pagamento registrado', async () => {
    rpc.mockResolvedValue({ data: { desfeito: false, motivo: 'pagamento_registrado' }, error: null });
    const { atomicMarkNoShow } = await import('@/lib/operationalTransitions');
    const result = await atomicMarkNoShow('a4', 'clinic-1');

    expect(result.success).toBe(false);
    expect(result.message).toContain('pagamento registrado');
  });
});
