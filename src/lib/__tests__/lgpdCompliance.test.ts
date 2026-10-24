import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  updates: [] as Array<{ table: string; values: Record<string, unknown> }>,
  inserts: [] as Array<{ table: string; values: Record<string, unknown> }>,
  from: vi.fn(),
  invoke: vi.fn(),
  rpc: vi.fn(),
  getUser: vi.fn(),
  download: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: mocks.from,
    functions: { invoke: mocks.invoke },
    rpc: mocks.rpc,
    storage: { from: vi.fn(() => ({ download: mocks.download })) },
    auth: { getUser: mocks.getUser },
  },
}));

import { exportPatientData } from '@/lib/lgpdCompliance';

describe('exportPatientData', () => {
  beforeEach(() => {
    mocks.updates.length = 0;
    mocks.inserts.length = 0;
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'staff-1' } }, error: null });
    mocks.invoke.mockResolvedValue({ data: { memed_prescricoes: [] }, error: null });
    mocks.rpc.mockResolvedValue({ data: 1, error: null });
    mocks.download.mockResolvedValue({ data: { size: 14, type: 'text/plain', arrayBuffer: async () => new TextEncoder().encode('arquivo clinico').buffer }, error: null });
    mocks.from.mockImplementation((table: string) => {
      let write: Record<string, unknown> | null = null;
      const builder: any = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        in: vi.fn(() => builder),
        or: vi.fn(() => builder),
        order: vi.fn(() => builder),
        range: vi.fn(() => builder),
        insert: vi.fn((values: Record<string, unknown>) => { write = values; mocks.inserts.push({ table, values }); return builder; }),
        update: vi.fn((values: Record<string, unknown>) => { write = values; mocks.updates.push({ table, values }); return builder; }),
        single: vi.fn(async () => table === 'pacientes'
          ? { data: { id: 'patient-1', nome: 'Paciente fictício' }, error: null }
          : table === 'lgpd_access_request_log'
            ? { data: { id: 'request-1', requested_at: '2026-10-13T12:00:00.000Z', ...write }, error: null }
            : { data: null, error: null }),
        maybeSingle: vi.fn(async () => ({
          data: { id: 'request-1', status: 'pending', responsavel_id: 'staff-1', evidencia: write?.evidencia },
          error: null,
        })),
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
          Promise.resolve({ data: table === 'anexos_prontuario' ? [{ id: 'attachment-1', paciente_id: 'patient-1', prontuario_id: 'chart-1', nome_arquivo: 'exame.txt', tipo_arquivo: 'text/plain', url_arquivo: 'chart-1/exame.txt' }] : [], error: null }).then(resolve, reject),
      };
      return builder;
    });
  });

  it('mantém o pedido pendente até a clínica confirmar a entrega ao titular', async () => {
    const exported = await exportPatientData('patient-1');
    const requestUpdate = mocks.updates.find((item) => item.table === 'lgpd_access_request_log');
    const requestInExport = exported.lgpd_access_request_log.find((item) => item.id === 'request-1');

    expect(mocks.inserts).toContainEqual({
      table: 'lgpd_access_request_log',
      values: { paciente_id: 'patient-1', request_type: 'export', status: 'pending', escopo: ['cadastro', 'agenda', 'clinico', 'anexos', 'financeiro', 'comunicacao', 'auditoria'] },
    });
    expect(requestUpdate?.values).not.toHaveProperty('status', 'fulfilled');
    expect(requestUpdate?.values).not.toHaveProperty('fulfillment_date');
    expect(requestUpdate?.values.evidencia).toContain('entrega formal ao titular');
    expect(requestInExport).toMatchObject({ id: 'request-1', status: 'pending', responsavel_id: 'staff-1' });
    expect(requestInExport).not.toHaveProperty('fulfillment_date');
  });

  it('inclui o conteúdo do anexo e não exporta o caminho interno do Storage', async () => {
    const exported = await exportPatientData('patient-1');

    expect(mocks.download).toHaveBeenCalledWith('chart-1/exame.txt');
    expect(exported.attachments).toHaveLength(1);
    expect(exported.attachments[0]).toMatchObject({
      id: 'attachment-1',
      nome_arquivo: 'exame.txt',
      conteudo_base64: btoa('arquivo clinico'),
      tamanho_bytes: 14,
    });
    expect(exported.attachments[0]).not.toHaveProperty('url_arquivo');
    expect(mocks.rpc).toHaveBeenCalledWith('registrar_exportacao_lgpd_paciente', { p_paciente_id: 'patient-1' });
  });

  it('respeita o escopo escolhido e não baixa anexos fora dele', async () => {
    mocks.download.mockClear();
    const exported = await exportPatientData('patient-1', ['agenda']);

    expect(mocks.download).not.toHaveBeenCalled();
    expect(exported).toHaveProperty('agendamentos');
    expect(exported).not.toHaveProperty('prontuarios');
    expect(exported).not.toHaveProperty('attachments');
    expect(exported.exportacao).toMatchObject({ escopo: ['cadastro', 'agenda'] });
  });

  it('interrompe a exportação se não puder baixar um anexo autorizado', async () => {
    mocks.download.mockResolvedValueOnce({ data: null, error: { message: 'forbidden' } });

    await expect(exportPatientData('patient-1')).rejects.toThrow('Falha ao incluir o anexo');
  });
});
