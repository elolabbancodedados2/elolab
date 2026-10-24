import { describe, expect, it } from 'vitest';
import { timelineEventAction } from '../patientTimelineActions';

const P = 'pac-1';

describe('timelineEventAction', () => {
  it('opens clinical sources only for admin and doctors', () => {
    expect(timelineEventAction({ type: 'prontuario', id: 'p1' }, ['medico'], P)?.href).toBe('/prontuarios?paciente=pac-1');
    expect(timelineEventAction({ type: 'prescricao', id: 'x' }, ['admin'], P)?.href).toBe('/documentos-clinicos?paciente=pac-1');
    expect(timelineEventAction({ type: 'atestado', id: 'x' }, ['medico'], P)?.href).toBe('/documentos-clinicos?tab=atestados&paciente=pac-1');
    expect(timelineEventAction({ type: 'encaminhamento', id: 'x' }, ['medico'], P)?.href).toBe('/documentos-clinicos?tab=encaminhamentos');
    expect(timelineEventAction({ type: 'anexo', id: 'anx-1' }, ['medico'], P)?.href).toBe('/documentos-clinicos?tab=anexos');
    for (const type of ['prontuario', 'prescricao', 'atestado', 'encaminhamento', 'anexo'] as const) {
      expect(timelineEventAction({ type, id: 'x' }, ['enfermagem', 'recepcao', 'financeiro'], P)).toBeNull();
    }
  });

  it('opens the clinic receivables only for finance, never the EloLab plan billing', () => {
    const receita = timelineEventAction({ type: 'pagamento', id: 'lan-1', financeTipo: 'receita' }, ['financeiro'], P);
    expect(receita?.href).toBe('/contas?tab=receber');
    expect(timelineEventAction({ type: 'pagamento', id: 'lan-2', financeTipo: 'despesa' }, ['admin'], P)?.href).toBe('/contas?tab=pagar');
    expect(timelineEventAction({ type: 'pagamento', id: 'lan-1', financeTipo: 'receita' }, ['medico', 'recepcao'], P)).toBeNull();
    expect(receita?.href).not.toMatch(/plano|assinatura|cobrancas/);
  });

  it('keeps the existing appointment, exam, triage and return actions', () => {
    expect(timelineEventAction({ type: 'agendamento', id: 'ag-a1' }, ['medico'], P)?.href).toBe('/prontuarios?paciente=pac-1&agendamento=a1');
    expect(timelineEventAction({ type: 'agendamento', id: 'ag-a1' }, ['recepcao'], P)).toBeNull();
    expect(timelineEventAction({ type: 'exame', id: 'e1' }, ['enfermagem'], P)?.href).toBe('/exames?paciente=pac-1');
    expect(timelineEventAction({ type: 'triagem', id: 'tr-1' }, ['enfermagem'], P)?.href).toBe('/triagem?buscarPaciente=pac-1');
    expect(timelineEventAction({ type: 'retorno', id: 'ret-1' }, ['recepcao'], P)?.href).toBe('/retornos');
    expect(timelineEventAction({ type: 'retorno', id: 'ret-1' }, ['enfermagem'], P)).toBeNull();
    expect(timelineEventAction({ type: 'comorbidade', id: 'co-1' }, ['admin'], P)).toBeNull();
  });
});
