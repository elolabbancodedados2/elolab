import { describe, expect, it } from 'vitest';
import { chaveMes, gerarCsvNotivisa, resumoMensal, rotuloMes, ultimosMeses } from '@/lib/segurancaAssistencialRelatorio';
import type { Report } from '@/lib/seguranca-assistencial';

const relato = (parcial: Partial<Report>): Report => ({
  id: 'abcdef12-0000-0000-0000-000000000000', category: 'fall', severity: 'moderate', occurred_at: '2026-10-05T13:00:00Z',
  location_label: 'Recepção', summary: 'Paciente escorregou no piso molhado', immediate_action: 'Avaliação médica',
  status: 'submitted', reporter_confidential: true, reporter_display: 'Fulano', assigned_to: null, due_at: null,
  created_at: '2026-10-05T14:00:00Z', updated_at: '2026-10-05T14:00:00Z', ...parcial,
});

describe('segurancaAssistencialRelatorio', () => {
  it('agrupa no fuso de Brasília', () => {
    // 02:00 UTC do dia 1º ainda é o mês anterior em São Paulo.
    expect(chaveMes('2026-11-01T02:00:00Z')).toBe('2026-10');
    expect(rotuloMes('2026-10')).toBe('Out de 2026');
  });

  it('lista os últimos meses em ordem', () => {
    expect(ultimosMeses(3, new Date('2026-01-15T12:00:00Z'))).toEqual(['2025-11', '2025-12', '2026-01']);
  });

  it('resume por mês, gravidade e situação', () => {
    const resumo = resumoMensal([
      relato({}),
      relato({ id: '2', severity: 'critical', category: 'adverse_event', status: 'closed' }),
      relato({ id: '3', occurred_at: '2026-08-01T12:00:00Z' }),
    ], ['2026-09', '2026-10']);
    expect(resumo).toEqual([
      { mes: '2026-09', total: 0, porGravidade: {}, eventosAdversos: 0, encerrados: 0 },
      { mes: '2026-10', total: 2, porGravidade: { moderate: 1, critical: 1 }, eventosAdversos: 1, encerrados: 1 },
    ]);
  });

  it('gera a planilha sem identificar o relator', () => {
    const csv = gerarCsvNotivisa([relato({})]);
    expect(csv).toContain('"Queda do paciente"');
    expect(csv).toContain('"05/10/2026 10:00"');
    expect(csv).not.toContain('Fulano');
  });
});
