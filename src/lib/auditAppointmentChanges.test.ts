import { describe, expect, it } from 'vitest';
import { formatAuditAppointmentChange } from './auditAppointmentChanges';
import { readFileSync } from 'node:fs';

describe('formatAuditAppointmentChange', () => {
  const references = {
    medicos: new Map([['medico-1', 'Dra. Ana']]),
    salas: new Map([['sala-1', 'Sala Azul']]),
  };

  it('translates provider and room ids to names without exposing raw ids', () => {
    expect(formatAuditAppointmentChange({ field: 'medico_id', oldValue: 'medico-1', newValue: 'medico-removido' }, references))
      .toEqual({ label: 'Profissional', oldValue: 'Dra. Ana', newValue: 'Profissional indisponível' });
    expect(formatAuditAppointmentChange({ field: 'sala_id', oldValue: null, newValue: 'sala-1' }, references))
      .toEqual({ label: 'Sala', oldValue: 'Sem sala', newValue: 'Sala Azul' });
  });

  it('formats appointment date, times, statuses and cancellation categories', () => {
    expect(formatAuditAppointmentChange({ field: 'data', oldValue: '2026-10-14', newValue: '2026-10-15' }, references))
      .toEqual({ label: 'Data', oldValue: '14/10/2026', newValue: '15/10/2026' });
    expect(formatAuditAppointmentChange({ field: 'hora_inicio', oldValue: '09:30:00', newValue: '10:00' }, references))
      .toEqual({ label: 'Horário', oldValue: '09:30', newValue: '10:00' });
    expect(formatAuditAppointmentChange({ field: 'status', oldValue: 'confirmado', newValue: 'cancelado' }, references))
      .toEqual({ label: 'Status', oldValue: 'Confirmado', newValue: 'Cancelado' });
    expect(formatAuditAppointmentChange({ field: 'motivo_cancelamento', oldValue: null, newValue: 'conflito_horario' }, references))
      .toEqual({ label: 'Motivo do cancelamento', oldValue: '—', newValue: 'Conflito de horário' });
  });

  it('leaves unrelated audit fields unchanged', () => {
    expect(formatAuditAppointmentChange({ field: 'tipo', oldValue: 'consulta', newValue: 'retorno' }, references))
      .toEqual({ label: 'tipo', oldValue: 'consulta', newValue: 'retorno' });
  });

  it('loads reference labels only from the active clinic and formats appointment diffs', () => {
    const source = readFileSync('src/components/AuditLog.tsx', 'utf8');
    expect(source).toMatch(/\.from\('medicos'\)[\s\S]*?\.eq\('clinica_id', clinicId\)/);
    expect(source).toMatch(/\.from\('salas'\)[\s\S]*?\.eq\('clinica_id', clinicId\)/);
    expect(source).toMatch(/entry\.collection === 'agendamentos'[\s\S]*?formatAuditAppointmentChange/);
  });
});
