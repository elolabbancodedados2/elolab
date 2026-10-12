import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const path = 'supabase/migrations/20261011160000_prontuario_integridade_assinado.sql';
const migration = existsSync(path) ? readFileSync(path, 'utf8') : '';

describe('imutabilidade das dependências do prontuário assinado', () => {
  it('bloqueia insert, update e delete de prescrições vinculadas a prontuário assinado', () => {
    expect(/CREATE TRIGGER trg_prontuario_prescricao_imutavel[\s\S]*?BEFORE INSERT OR UPDATE OR DELETE ON public\.prescricoes/i.test(migration)).toBe(true);
    expect(/FROM public\.prontuarios[\s\S]*?FOR UPDATE[\s\S]*?assinado IS TRUE[\s\S]*?RAISE EXCEPTION/i.test(migration)).toBe(true);
  });

  it('bloqueia insert, update e delete de anexos vinculados a prontuário assinado', () => {
    expect(/CREATE TRIGGER trg_prontuario_anexo_imutavel[\s\S]*?BEFORE INSERT OR UPDATE OR DELETE ON public\.anexos_prontuario/i.test(migration)).toBe(true);
    expect(/TG_OP = 'UPDATE'[\s\S]*?OLD\.prontuario_id IS DISTINCT FROM NEW\.prontuario_id[\s\S]*?assinado IS TRUE[\s\S]*?RAISE EXCEPTION/i.test(migration)).toBe(true);
  });

  it('serializa a substituição transacional de prescrições com a assinatura', () => {
    expect(/CREATE OR REPLACE FUNCTION public\.substituir_prescricoes_do_prontuario[\s\S]*?SECURITY DEFINER[\s\S]*?FROM public\.prontuarios[\s\S]*?FOR UPDATE/i.test(migration)).toBe(true);
    expect(/CREATE POLICY prescricoes_insert_independentes[\s\S]*?prontuario_id IS NULL/i.test(migration)).toBe(true);
    expect(/CREATE POLICY prescricoes_update_independentes[\s\S]*?prontuario_id IS NULL/i.test(migration)).toBe(true);
    expect(/CREATE POLICY prescricoes_delete_independentes[\s\S]*?prontuario_id IS NULL/i.test(migration)).toBe(true);
    expect(/public\.is_admin\(auth\.uid\(\)\)[\s\S]*?public\.is_medico_responsavel_do_prontuario/i.test(migration)).toBe(true);
  });

  it('blocks moving a prescription away from a signed chart', () => {
    expect(/TG_OP = 'UPDATE'[\s\S]*?OLD\.prontuario_id[\s\S]*?IS DISTINCT FROM NEW\.prontuario_id[\s\S]*?FOR UPDATE[\s\S]*?assinado IS TRUE/i.test(migration)).toBe(true);
    expect(/WHERE id IN \(OLD\.prontuario_id, NEW\.prontuario_id\)[\s\S]*?ORDER BY id[\s\S]*?FOR UPDATE/i.test(migration)).toBe(true);
  });

  it('records each authorized history read atomically', () => {
    expect(/FOR UPDATE[\s\S]*?INSERT INTO public\.prontuario_acessos[\s\S]*?v_registrados[\s\S]*?IF v_registrados <> v_solicitados/i.test(migration)).toBe(true);
  });

  it('remove dados clínicos dos logs genéricos também para prescrições e anexos', () => {
    expect(/NEW\.collection IN \('prontuarios', 'prescricoes', 'anexos_prontuario', 'atestados', 'encaminhamentos'\)[\s\S]*?NEW\.record_name := NULL[\s\S]*?NEW\.changes := NULL/i.test(migration)).toBe(true);
  });
});
