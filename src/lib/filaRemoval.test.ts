import { describe, expect, it } from 'vitest';
import { FILA_REMOVAL_REASONS, isFilaRemovalReason } from './filaRemoval';
import { readFileSync } from 'node:fs';

describe('fila removal reason', () => {
  it('accepts only structured administrative reasons', () => {
    expect(FILA_REMOVAL_REASONS.map((item) => item.value)).toEqual([
      'paciente_desistiu', 'encaminhado_outro_setor', 'duplicidade_atendimento', 'ajuste_operacional', 'outro',
    ]);
    expect(isFilaRemovalReason('paciente_desistiu')).toBe(true);
    expect(isFilaRemovalReason('')).toBe(false);
    expect(isFilaRemovalReason('detalhe clínico livre')).toBe(false);
  });

  it('uses the atomic reason-aware endpoint and clinic-scoped history', () => {
    const page = readFileSync('src/pages/Fila.tsx', 'utf8');
    const migration = readFileSync('supabase/migrations/20261014120500_historico_saida_fila.sql', 'utf8');
    expect(page).toMatch(/rpc\('remover_item_fila_com_motivo'/);
    expect(page).toMatch(/p_motivo:\s*motivoSaida/);
    expect(page).toMatch(/from\('fila_atendimento_eventos'\)[\s\S]*?\.eq\('clinica_id', profile\.clinica_id\)/);
    expect(migration).toMatch(/public\.is_same_clinica\(v_clinica_id\)/);
    expect(migration).toMatch(/FOR UPDATE/);
    expect(migration).toMatch(/motivo NOT IN/);
    expect(migration).toMatch(/atendimento_reaberto/);
  });
});
