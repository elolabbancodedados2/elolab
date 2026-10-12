import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const path = 'supabase/migrations/20261011170000_documentos_clinicos_integridade_tenant.sql';
const migration = existsSync(path) ? readFileSync(path, 'utf8') : '';

describe('integridade tenant dos documentos clínicos', () => {
  it('valida paciente e prescritor dos atestados na mesma clínica', () => {
    expect(/FUNCTION public\.validar_tenant_atestado[\s\S]*?FROM public\.pacientes[\s\S]*?paciente_id[\s\S]*?clinica_id[\s\S]*?FROM public\.medicos[\s\S]*?medico_id[\s\S]*?clinica_id/i.test(migration)).toBe(true);
    expect(/CREATE TRIGGER trg_validar_tenant_atestado[\s\S]*?BEFORE INSERT OR UPDATE ON public\.atestados/i.test(migration)).toBe(true);
  });

  it('valida paciente, médico de origem e prontuário dos encaminhamentos', () => {
    expect(/FUNCTION public\.validar_tenant_encaminhamento[\s\S]*?paciente_id[\s\S]*?medico_origem_id[\s\S]*?medico_destino_id[\s\S]*?prontuario_id[\s\S]*?IS DISTINCT FROM NEW\.clinica_id/i.test(migration)).toBe(true);
    expect(/CREATE TRIGGER trg_validar_tenant_encaminhamento[\s\S]*?BEFORE INSERT OR UPDATE ON public\.encaminhamentos/i.test(migration)).toBe(true);
  });

  it('permits optional references cleared by ON DELETE SET NULL', () => {
    expect(/TG_OP = 'INSERT'[\s\S]*?NEW\.paciente_id IS NULL[\s\S]*?NEW\.medico_id IS NULL/i.test(migration)).toBe(true);
    expect(/NEW\.paciente_id IS NOT NULL[\s\S]*?FROM public\.pacientes/i.test(migration)).toBe(true);
    expect(/NEW\.medico_destino_id IS NOT NULL[\s\S]*?FROM public\.medicos/i.test(migration)).toBe(true);
    expect(/LEFT JOIN public\.medicos destino ON destino\.id = e\.medico_destino_id/i.test(migration)).toBe(true);
  });

  it('interrompe a migration se encontrar vínculos entre clínicas já existentes', () => {
    expect(/DO \$\$[\s\S]*?atestados[\s\S]*?encaminhamentos[\s\S]*?RAISE EXCEPTION/i.test(migration)).toBe(true);
  });

  it('valida a clínica do paciente e do prescritor Memed e impede troca de autoria', () => {
    expect(/FUNCTION public\.validar_tenant_memed_prescricao[\s\S]*?NEW\.memed_prescription_uuid IS DISTINCT FROM OLD\.memed_prescription_uuid[\s\S]*?FOR SHARE/i.test(migration)).toBe(true);
    expect(/CREATE TRIGGER trg_validar_tenant_memed_prescricao[\s\S]*?BEFORE INSERT OR UPDATE ON public\.memed_prescricoes/i.test(migration)).toBe(true);
  });
});
