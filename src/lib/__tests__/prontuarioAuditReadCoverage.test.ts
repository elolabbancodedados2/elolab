import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('leituras de prontuario protegido', () => {
  it('autoriza a trilha antes de cada consulta clínica conhecida', () => {
    expect(read('src/pages/Prontuarios.tsx')).toMatch(/autorizarLeituraHistoricoPaciente\(selectedPacienteId\)[\s\S]*?buscarTodasAsPaginas/);
    expect(read('src/pages/Pacientes.tsx')).toMatch(/autorizarLeituraHistoricoPaciente\(pacienteId\)[\s\S]*?from\('prontuarios'\)/);
    expect(read('src/pages/Medicos.tsx')).toMatch(/autorizarLeituraHistoricoMedico\(medico\.id\)[\s\S]*?from\('prontuarios'\)/);
    expect(read('src/components/clinical/ClinicalSafetyPanel.tsx')).toMatch(/autorizarLeituraHistoricoPaciente\(pacienteId\)[\s\S]*?from\('prontuarios'\)/);
    expect(read('src/components/clinical/PatientTimeline.tsx')).toMatch(/autorizarLeituraHistoricoPaciente\(pacienteId\)[\s\S]*?from\('prontuarios'\)/);
    expect(read('src/lib/workflowAutomation.ts')).toMatch(/autorizarLeituraHistoricoPaciente\(params\.pacienteId\)[\s\S]*?from\('prontuarios'\)/);
    expect(read('src/components/relatorios/RelatorioCustomizado.tsx')).toMatch(/autorizarLeituraHistoricoClinica\(\)[\s\S]*?from\(cfg\.table\)/);
  });
});
