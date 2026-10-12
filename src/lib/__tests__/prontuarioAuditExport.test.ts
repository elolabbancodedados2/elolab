import { describe, expect, it } from 'vitest';
import { buscarPorIdsEmLotes, buscarTodasAsPaginas, combinarEventosAuditoria, filtrarEventosAuditoria, gerarCsvAuditoria } from '../prontuarioAuditExport';

const eventos = [
  { id: '1', ts: '2026-10-10T12:00:00.000Z', action: 'visualizacao', user_id: 'user-a', user_name: 'Ana', user_crm: '123', prontuario_id: 'record-1' },
  { id: '2', ts: '2026-10-11T12:00:00.000Z', action: 'exportacao', user_id: 'user-b', user_name: 'Bia', user_crm: null, prontuario_id: 'record-1' },
];

describe('auditoria de prontuário exportável', () => {
  it('carrega páginas até o fim sem truncar o histórico', async () => {
    const chamadas: Array<[number, number]> = [];
    const resultado = await buscarTodasAsPaginas(async (inicio, fim) => {
      chamadas.push([inicio, fim]);
      const valores = Array.from({ length: 5 }, (_, index) => inicio + index).filter(value => value < 8);
      return { data: valores, error: null };
    }, 5);

    expect(resultado).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(chamadas).toEqual([[0, 4], [5, 9]]);
  });

  it('consulta prescrições em lotes pequenos para exportações longas', async () => {
    const lotes: string[][] = [];
    const ids = Array.from({ length: 205 }, (_, index) => `record-${index}`);
    const resultado = await buscarPorIdsEmLotes(ids, async lote => {
      lotes.push(lote);
      return lote.map(id => ({ prontuario_id: id }));
    }, 100);

    expect(lotes.map(lote => lote.length)).toEqual([100, 100, 5]);
    expect(resultado).toHaveLength(205);
  });

  it('combines access and mutation events in chronological order with source-qualified ids', () => {
    const merged = combinarEventosAuditoria(
      [{ ...eventos[0], id: '42', source: 'prontuario_acessos' }],
      [{ ...eventos[1], id: '42', source: 'audit_log', action: 'update' }],
    );

    expect(merged.map(event => event.id)).toEqual(['audit_log:42', 'prontuario_acessos:42']);
    expect(merged.map(event => event.action)).toEqual(['update', 'visualizacao']);
  });

  it('deduplicates legacy frontend events against database trigger events', () => {
    const base = { ...eventos[0], source: 'audit_log' };
    const merged = combinarEventosAuditoria(
      [{ ...eventos[0], id: 'access', source: 'prontuario_acessos' }],
      [
        { ...base, id: 'legacy-access', action: 'access' },
        { ...base, id: 'legacy-create', action: 'create', operacaoBanco: 'create' },
        { ...base, id: 'trigger-create', action: 'insert', operacaoBanco: 'insert' },
        { ...base, id: 'legacy-update', action: 'update', possuiDiff: false },
        { ...base, id: 'trigger-update', action: 'update', possuiDiff: false },
        { ...base, id: 'standalone-delete', action: 'delete' },
      ],
    );

    expect(merged).toHaveLength(4);
    expect(merged.filter(event => event.action === 'create')).toHaveLength(1);
    expect(merged.filter(event => event.action === 'update')).toHaveLength(1);
    expect(merged.some(event => event.action === 'delete')).toBe(true);
    expect(merged.map(event => event.action)).toContain('create');
  });

  it('preserves separate saves made close together', () => {
    const base = { ...eventos[0], source: 'audit_log', action: 'update' };
    const merged = combinarEventosAuditoria([], [
      { ...base, id: 'save-1', ts: '2026-10-10T12:00:00.000Z' },
      { ...base, id: 'save-2', ts: '2026-10-10T12:00:01.500Z' },
    ]);

    expect(merged).toHaveLength(2);
  });

  it('aplica período, evento e usuário estável sem descartar o restante do histórico', () => {
    expect(filtrarEventosAuditoria(eventos, {
      dataInicial: '2026-10-11', dataFinal: '', acao: 'exportacao', userId: 'user-b',
    })).toEqual([eventos[1]]);
    expect(filtrarEventosAuditoria(eventos, {
      dataInicial: '', dataFinal: '', acao: 'todos', userId: 'todos',
    })).toHaveLength(2);
  });

  it('gera CSV com metadados de software e instituição e sem justificativa clínica', () => {
    const csv = gerarCsvAuditoria(eventos, {
      softwareNome: 'EloLab', softwareFornecedor: 'EloLab', softwareVersao: '1.2.3', softwareBuild: 'abc123',
      instituicaoNome: 'Clínica Azul', instituicaoCnes: '12345', instituicaoCnpj: '12.345.678/0001-90',
    });

    expect(csv).toContain('"EloLab";"EloLab";"1.2.3";"abc123"');
    expect(csv).toContain('"Clínica Azul";"12345";"12.345.678/0001-90"');
    expect(csv).toContain('"1";"prontuario_acessos"');
    expect(csv).toContain('record-1');
    expect(csv).toContain('user-a');
    expect(csv).not.toContain('paciente_nome');
    expect(csv).not.toContain('justificativa');
  });

  it('neutraliza campos CSV que poderiam ser interpretados como fórmula', () => {
    const csv = gerarCsvAuditoria([{
      ...eventos[0], user_name: '=HYPERLINK("x")', user_crm: null,
    }], {
      softwareNome: '+EloLab', softwareFornecedor: 'EloLab', softwareVersao: '1', softwareBuild: 'build',
      instituicaoNome: 'Clínica', instituicaoCnes: '', instituicaoCnpj: '',
    });

    expect(csv).toContain("'=HYPERLINK(");
    expect(csv).toContain("'+EloLab");
  });
});
