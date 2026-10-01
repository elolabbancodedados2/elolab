import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  atomicCheckin: vi.fn(),
  createAutoBillingDetailed: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/lib/operationalTransitions', () => ({ atomicCheckin: mocks.atomicCheckin }));
vi.mock('@/lib/autoBilling', () => ({ createAutoBillingDetailed: mocks.createAutoBillingDetailed }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }));

import { checkinComCobranca } from '@/lib/checkinWithBilling';

const cobranca = {
  agendamentoId: 'ag-1',
  pacienteId: 'pac-1',
  pacienteNome: 'Ana Silva',
  clinicaId: 'clinic-1',
  tipoConsulta: 'Consulta',
};

function queryChain(result: unknown) {
  const chain: Record<string, unknown> = {};
  for (const method of ['delete', 'update', 'eq', 'neq', 'select']) {
    chain[method] = vi.fn(() => chain);
  }
  chain.limit = vi.fn().mockResolvedValue(result);
  chain.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return chain;
}

describe('check-in com cobrança', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.atomicCheckin.mockResolvedValue({
      success: true,
      message: 'Check-in realizado',
      actions: ['Paciente adicionado à fila'],
      filaId: 'fila-1',
      statusAnterior: 'confirmado',
    });
    mocks.createAutoBillingDetailed.mockResolvedValue('created');
    mocks.rpc.mockImplementation((name: string) => Promise.resolve(
      name === 'tem_cobranca_ativa_do_agendamento'
        ? { data: false, error: null }
        : { data: { desfeito: true }, error: null },
    ));
    mocks.from.mockImplementation((table: string) => queryChain({
      data: table === 'lancamentos'
        ? [{ id: 'lanc-1' }]
        : table === 'fila_atendimento'
          ? [{ id: 'fila-1' }]
          : [{ id: 'ag-1' }],
      error: null,
    }));
  });

  it('mantém o check-in se a cobrança foi criada', async () => {
    const result = await checkinComCobranca(cobranca, 'urgente');

    expect(result.success).toBe(true);
    expect(result.billingOutcome).toBe('created');
    expect(mocks.atomicCheckin).toHaveBeenCalledWith('ag-1', 'clinic-1', 'urgente');
    expect(mocks.createAutoBillingDetailed).toHaveBeenCalledWith(cobranca);
    expect(mocks.rpc).toHaveBeenCalledWith('confirmar_estado_cobranca_checkin', {
      p_agendamento_id: 'ag-1', p_clinica_id: 'clinic-1', p_gratuito: false,
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('aceita consulta gratuita sem exigir lançamento', async () => {
    mocks.createAutoBillingDetailed.mockResolvedValue('free');

    const result = await checkinComCobranca(cobranca);

    expect(result.success).toBe(true);
    expect(result.billingOutcome).toBe('free');
    expect(mocks.rpc).toHaveBeenCalledWith('confirmar_estado_cobranca_checkin', {
      p_agendamento_id: 'ag-1', p_clinica_id: 'clinic-1', p_gratuito: true,
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('confirma check-in se a cobrança já existe', async () => {
    mocks.createAutoBillingDetailed.mockResolvedValue('already_exists');

    const result = await checkinComCobranca(cobranca);

    expect(result.success).toBe(true);
    expect(result.billingOutcome).toBe('already_exists');
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('allows an idempotent retry for an existing queue entry and preserves its outcome', async () => {
    mocks.atomicCheckin.mockResolvedValue({
      success: true,
      message: 'Paciente já está na fila',
      actions: [],
      filaId: 'fila-1',
      statusAnterior: 'aguardando',
    });
    mocks.createAutoBillingDetailed.mockResolvedValue('already_exists');

    const result = await checkinComCobranca(cobranca);

    expect(result).toMatchObject({ success: true, actions: [], billingOutcome: 'already_exists' });
    expect(mocks.createAutoBillingDetailed).toHaveBeenCalledWith(cobranca);
  });

  it('desfaz a fila e restaura o status se a cobrança de um novo check-in falhar', async () => {
    mocks.createAutoBillingDetailed.mockRejectedValue(new Error('Preço do exame não cadastrado'));
    mocks.from.mockImplementation((table: string) => queryChain({ data: [], error: null }));

    const result = await checkinComCobranca({ ...cobranca, tipoConsulta: 'exame' });

    expect(result.success).toBe(false);
    expect(result.message).toContain('A entrada na fila foi desfeita.');
    expect(mocks.rpc).toHaveBeenCalledWith('desfazer_checkin_sem_cobranca', {
      p_agendamento_id: 'ag-1', p_fila_id: 'fila-1', p_clinica_id: 'clinic-1', p_status_anterior: 'confirmado',
    });
  });

  it('preserva o check-in quando a cobrança foi persistida apesar da falha de resposta', async () => {
    mocks.createAutoBillingDetailed.mockRejectedValue(new Error('A conexão caiu após gravar'));
    mocks.rpc.mockImplementation((name: string) => Promise.resolve(
      name === 'tem_cobranca_ativa_do_agendamento'
        ? { data: true, error: null }
        : { data: { desfeito: true }, error: null },
    ));

    const result = await checkinComCobranca(cobranca);

    expect(result.success).toBe(true);
    expect(result.message).toContain('cobrança confirmada');
    expect(mocks.rpc).not.toHaveBeenCalledWith('desfazer_checkin_sem_cobranca', expect.anything());
  });

  it('não afirma que o paciente segue na fila quando a verificação do financeiro falha', async () => {
    mocks.createAutoBillingDetailed.mockRejectedValue(new Error('Falha de rede'));
    mocks.from.mockImplementation(() => queryChain({ data: [], error: null }));
    mocks.rpc.mockResolvedValue({ data: null, error: new Error('Falha de leitura') });

    const result = await checkinComCobranca(cobranca);

    expect(result.success).toBe(false);
    expect(result.message).toContain('Atualize a fila e confira o financeiro');
    expect(result.message).not.toContain('permanece na fila');
    expect(mocks.rpc).not.toHaveBeenCalledWith('desfazer_checkin_sem_cobranca', expect.anything());
  });

  it('não remove uma entrada preexistente se a cobrança não puder ser confirmada', async () => {
    mocks.atomicCheckin.mockResolvedValue({
      success: true,
      message: 'Paciente já está na fila',
      actions: [],
      filaId: 'fila-existente',
      statusAnterior: 'aguardando',
    });
    mocks.createAutoBillingDetailed.mockRejectedValue(new Error('Falha de rede'));
    mocks.from.mockImplementation(() => queryChain({ data: [], error: null }));

    const result = await checkinComCobranca(cobranca);

    expect(result.success).toBe(false);
    expect(result.message).toContain('Atualize a fila e confira o financeiro');
    expect(mocks.rpc).toHaveBeenCalledWith('tem_cobranca_ativa_do_agendamento', {
      p_agendamento_id: 'ag-1', p_clinica_id: 'clinic-1',
    });
    expect(mocks.rpc).not.toHaveBeenCalledWith('desfazer_checkin_sem_cobranca', expect.anything());
  });

  it('não afirma que desfez o check-in se o banco não alterou as linhas', async () => {
    mocks.createAutoBillingDetailed.mockRejectedValue(new Error('Falha de rede'));
    mocks.from.mockImplementation(() => queryChain({ data: [], error: null }));
    mocks.rpc.mockImplementation((name: string) => Promise.resolve(
      name === 'tem_cobranca_ativa_do_agendamento'
        ? { data: false, error: null }
        : { data: { desfeito: false, motivo: 'atendimento_ja_avancou' }, error: null },
    ));

    const result = await checkinComCobranca(cobranca);

    expect(result.success).toBe(false);
    expect(result.message).toContain('estado do check-in mudou');
    expect(mocks.rpc).toHaveBeenCalledWith('tem_cobranca_ativa_do_agendamento', {
      p_agendamento_id: 'ag-1', p_clinica_id: 'clinic-1',
    });
    expect(mocks.rpc).toHaveBeenCalledWith('desfazer_checkin_sem_cobranca', expect.anything());
  });

  it('preserva sucesso se uma cobrança concorrente vencer o rollback', async () => {
    mocks.createAutoBillingDetailed.mockRejectedValue(new Error('Falha de rede'));
    mocks.from.mockImplementation(() => queryChain({ data: [], error: null }));
    mocks.rpc.mockImplementation((name: string) => Promise.resolve(
      name === 'tem_cobranca_ativa_do_agendamento'
        ? { data: false, error: null }
        : { data: { desfeito: false, motivo: 'cobranca_ativa' }, error: null },
    ));

    const result = await checkinComCobranca(cobranca);

    expect(result.success).toBe(true);
    expect(result.message).toContain('cobrança confirmada');
  });
});
