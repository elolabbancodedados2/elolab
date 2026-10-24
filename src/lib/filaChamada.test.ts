import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ calls: [] as Array<[string, unknown[]]>, result: { data: [{ id: 'f1' }], error: null as unknown } }));

vi.mock('@/integrations/supabase/client', () => {
  const builder: Record<string, unknown> = {};
  for (const method of ['update', 'eq', 'in', 'is', 'select']) {
    builder[method] = (...args: unknown[]) => { mocks.calls.push([method, args]); return builder; };
  }
  builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(mocks.result).then(resolve);
  return { supabase: { from: (table: string) => { mocks.calls.push(['from', [table]]); return builder; } } };
});

import { chamarPacienteNaFila } from './filaChamada';

describe('chamada concorrente da fila', () => {
  beforeEach(() => {
    mocks.calls = [];
    mocks.result = { data: [{ id: 'f1' }], error: null };
  });

  it('só grava se a linha ainda estiver na versão lida (compare-and-set em updated_at)', async () => {
    await expect(chamarPacienteNaFila({ filaId: 'f1', clinicaId: 'c1', versao: '2026-10-24T13:00:00.123456+00:00', salaId: 's1' }))
      .resolves.toBe('chamado');
    expect(mocks.calls).toEqual([
      ['from', ['fila_atendimento']],
      ['update', [{ status: 'chamado', sala_id: 's1' }]],
      ['eq', ['id', 'f1']],
      ['eq', ['clinica_id', 'c1']],
      ['in', ['status', ['aguardando', 'chamado']]],
      ['eq', ['updated_at', '2026-10-24T13:00:00.123456+00:00']],
      ['select', ['id']],
    ]);
  });

  it('informa que outra recepção chamou antes quando nenhuma linha muda', async () => {
    mocks.result = { data: [], error: null };
    await expect(chamarPacienteNaFila({ filaId: 'f1', clinicaId: 'c1', versao: null })).resolves.toBe('mudou');
    expect(mocks.calls).toContainEqual(['is', ['updated_at', null]]);
    expect(mocks.calls).toContainEqual(['update', [{ status: 'chamado' }]]);
  });

  it('propaga erro do banco', async () => {
    mocks.result = { data: null, error: new Error('falha') };
    await expect(chamarPacienteNaFila({ filaId: 'f1', clinicaId: 'c1', versao: 'v' })).rejects.toThrow('falha');
  });
});
