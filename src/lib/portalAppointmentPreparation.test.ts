import { describe, expect, it } from 'vitest';
import { attachPortalPreparationInstructions } from '../../supabase/functions/_shared/portalAppointmentPreparation';
import { readFileSync } from 'node:fs';

describe('portal appointment preparation instructions', () => {
  it('adds clinic-configured instructions only to active appointments today or later', () => {
    const appointments = [
      { id: 'future', data: '2026-10-15', tipo: 'Consulta Inicial', status: 'confirmado' },
      { id: 'today', data: '2026-10-14', tipo: 'retorno', status: 'agendado' },
      { id: 'cancelled', data: '2026-10-15', tipo: 'Consulta Inicial', status: 'cancelado' },
      { id: 'past', data: '2026-10-13', tipo: 'Consulta Inicial', status: 'finalizado' },
    ];
    const configuredTypes = [
      { nome: 'consulta inicial', instrucoes_preparo: 'Traga seus exames anteriores.' },
      { nome: 'retorno', instrucoes_preparo: '  ' },
    ];

    expect(attachPortalPreparationInstructions(appointments, configuredTypes, '2026-10-14')).toEqual([
      { ...appointments[0], instrucoes_preparo: 'Traga seus exames anteriores.' },
      { ...appointments[1], instrucoes_preparo: null },
      { ...appointments[2], instrucoes_preparo: null },
      { ...appointments[3], instrucoes_preparo: null },
    ]);
  });

  it('keeps the portal query clinic-scoped and never sends these notes through a communication channel', () => {
    const edge = readFileSync('supabase/functions/patient-portal/index.ts', 'utf8');
    expect(edge).toMatch(/case "get_agendamentos"[\s\S]*?\.eq\("paciente_id", pacienteId\)[\s\S]*?\.eq\("clinica_id", pacienteClinicaId\)/);
    expect(edge).toMatch(/\.from\("tipos_consulta"\)[\s\S]*?\.eq\("clinica_id", pacienteClinicaId\)/);
    expect(edge).toMatch(/attachPortalPreparationInstructions\(appointments, configuredTypes, todayISO\(\)\)/);
    const portal = readFileSync('src/pages/PortalPaciente.tsx', 'utf8');
    expect(portal).toMatch(/a\.instrucoes_preparo[\s\S]*?aria-label="Instruções de preparo"/);
    const settings = readFileSync('src/pages/TiposConsulta.tsx', 'utf8');
    expect(settings).toMatch(/instrucoes_preparo: form\.instrucoes_preparo\.trim\(\) \|\| null/);
    expect(settings).toMatch(/maxLength=\{2000\}/);
  });
});
