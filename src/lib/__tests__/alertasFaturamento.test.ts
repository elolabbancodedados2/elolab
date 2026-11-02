import { describe, expect, it } from 'vitest';
import { alertasFaturamento } from '@/lib/alertasFaturamento';

describe('alertasFaturamento', () => {
  it('reúne recursos vencendo, autorizações e lotes antigos em rascunho', () => {
    const alertas = alertasFaturamento({
      hoje: '2026-11-01',
      glosas: [
        { id: 'g1', status: 'recurso_preparacao', codigo_glosa: '1308', recurso_prazo: '2026-10-30', lotes_tiss: { numero_lote: '41' } },
        { id: 'g2', status: 'pendente', codigo_glosa: '1801', recurso_prazo: '2026-11-03' },
        { id: 'g3', status: 'pendente', codigo_glosa: '1001', recurso_prazo: '2026-12-30' },
        { id: 'g4', status: 'recurso_enviado', codigo_glosa: '1005', recurso_prazo: '2026-10-01' },
      ],
      autorizacoes: [{ id: 'a1', status: 'autorizada', data_expiracao: '2026-11-04', numero_autorizacao: 'S1', paciente_nome: 'Ana' }],
      lotes: [
        { id: 'l1', status: 'rascunho', numero_lote: '40', competencia: '2026-09-01' },
        { id: 'l2', status: 'rascunho', numero_lote: '42', competencia: '2026-11-01' },
      ],
    });
    expect(alertas.map(a => a.id)).toEqual(['glosa-g1', 'glosa-g2', 'autorizacao-a1', 'lote-l1']);
    expect(alertas[0]).toMatchObject({ gravidade: 'erro', tarefa: { prioridade: 'urgente', data_vencimento: '2026-10-30', categoria: 'Financeiro' } });
    expect(alertas[0].texto).toBe('Recurso da glosa 1308 do lote 41 venceu em 30/10/2026.');
    expect(alertas[3].texto).toBe('Lote 40 (09/2026) ainda está em rascunho.');
  });
});
