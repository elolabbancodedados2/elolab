import { describe, expect, it } from 'vitest';
import { generateFilaShiftHandoff } from './filaShiftHandoff';
import { readFileSync } from 'node:fs';

describe('generateFilaShiftHandoff', () => {
  it('summarizes operational counts without patient or clinical details', () => {
    const summary = generateFilaShiftHandoff({
      date: '14/10/2026',
      generatedAt: '17:30',
      waiting: 4,
      triage: 2,
      inConsultation: 1,
      blockedByPayment: 1,
      outsideToday: 3,
      urgent: 1,
      overdue: 2,
    });
    expect(summary).toContain('Passagem de turno — 14/10/2026');
    expect(summary).toContain('4 pessoas aguardando chamada');
    expect(summary).toContain('2 pessoas aguardando triagem');
    expect(summary).toContain('1 atendimento bloqueado por pagamento');
    expect(summary).toContain('3 itens para revisar fora da fila de hoje');
    expect(summary).not.toMatch(/Paciente|CPF|diagnóstico|prontuário/i);
  });

  it('exposes a preview and a copy action in the queue page', () => {
    const page = readFileSync('src/pages/Fila.tsx', 'utf8');
    expect(page).toMatch(/generateFilaShiftHandoff/);
    expect(page).toMatch(/navigator\.clipboard\.writeText/);
    expect(page).toMatch(/Passagem de turno/);
    expect(page).toMatch(/<Dialog open=\{isHandoffOpen\}/);
  });
});
