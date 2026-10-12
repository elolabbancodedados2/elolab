import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const path = 'supabase/migrations/20261011280000_prontuario_referencias_e_anexos_assinados.sql';
const migration = existsSync(path) ? readFileSync(path, 'utf8') : '';

describe('referencias e arquivos do prontuario', () => {
  it('valida medico e agendamento no mesmo contexto paciente e clinica', () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.validar_referencias_prontuario/i);
    expect(migration).toMatch(/NEW\.medico_id[\s\S]*medicos[\s\S]*clinica_id = NEW\.clinica_id/i);
    expect(migration).toMatch(/NEW\.agendamento_id[\s\S]*agendamentos[\s\S]*paciente_id = NEW\.paciente_id/i);
  });

  it('serializa novos registros por agendamento para evitar duplicidade concorrente', () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.impedir_prontuario_duplicado_por_agendamento/i);
    expect(migration).toMatch(/pg_advisory_xact_lock[\s\S]*NEW\.agendamento_id/i);
    expect(migration).toMatch(/CREATE TRIGGER trg_prontuario_unico_por_agendamento/i);
  });

  it('impede apagar objetos de anexos ligados a prontuario assinado', () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.storage_med_attach_delete_allowed/i);
    expect(migration).toMatch(/assinado IS NOT TRUE/i);
    expect(migration).toMatch(/prescricoes[\s\S]*NOT EXISTS \([\s\S]*public\.prescricoes pr[\s\S]*pr\.arquivo_pdf = _name/i);
    expect(migration).toMatch(/CREATE POLICY "med_attach_delete_scoped"[\s\S]*storage_med_attach_delete_allowed\(name\)/i);
  });

  it('exige evento recente de auditoria para ler prontuarios assinados', () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.prontuario_leitura_auditada/i);
    expect(migration).toMatch(/CREATE POLICY prontuarios_select_com_leitura_auditada[\s\S]*assinado IS TRUE[\s\S]*prontuario_leitura_auditada\(id\)/i);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.registrar_visualizacao_historico_paciente/i);
    expect(migration).toMatch(/INSERT INTO public\.prontuario_acessos[\s\S]*SELECT p\.id[\s\S]*p_paciente_id/i);
  });
});
