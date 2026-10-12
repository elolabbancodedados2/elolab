import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationPath = 'supabase/migrations/20261011290000_documentos_clinicos_autoria_transicoes.sql';
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : '';

describe('autoria e transicoes de documentos clinicos', () => {
  it('registra o usuario emissor e vincula documentos ao proprio medico quando nao admin', () => {
    expect(/ADD COLUMN IF NOT EXISTS criado_por uuid REFERENCES auth\.users/i.test(migration)).toBe(true);
    expect(/is_medico_responsavel_do_prontuario\(NEW\.medico_id\)/i.test(migration)).toBe(true);
    expect(/is_medico_responsavel_do_prontuario\(NEW\.medico_origem_id\)/i.test(migration)).toBe(true);
    expect(/NEW\.criado_por IS DISTINCT FROM OLD\.criado_por/i.test(migration)).toBe(true);
  });

  it('remove acesso de recepcao a documentos clinicos e bloqueia alteracao de prescricoes avulsas', () => {
    expect(/DROP POLICY IF EXISTS atestados_select/i.test(migration)).toBe(true);
    expect(/DROP POLICY IF EXISTS encaminhamentos_select/i.test(migration)).toBe(true);
    expect(/DROP POLICY IF EXISTS "Paciente pode ver seus encaminhamentos"/i.test(migration)).toBe(true);
    expect(/DROP POLICY IF EXISTS prescricoes_update_independentes/i.test(migration)).toBe(true);
    expect(/DROP POLICY IF EXISTS prescricoes_delete_independentes/i.test(migration)).toBe(true);
  });

  it('restringe transicoes e exige contra-referencia para concluir encaminhamento', () => {
    expect(/OLD\.status = 'pendente'[\s\S]*?NEW\.status = 'em_andamento'/i.test(migration)).toBe(true);
    expect(/NEW\.status = 'concluido'[\s\S]*?contra_referencia/i.test(migration)).toBe(true);
    expect(/CREATE TRIGGER trg_validar_transicao_encaminhamento/i.test(migration)).toBe(true);
  });
});
