import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationPath = 'supabase/migrations/20261011220000_indicadores_produtividade_fuso.sql';

describe('limites de data dos indicadores de produtividade', () => {
  it('inclui o dia inteiro no fuso de São Paulo e mantém o fim exclusivo', () => {
    expect(existsSync(migrationPath)).toBe(true);
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toMatch(/v_current_range_start timestamptz/i);
    expect(migration).toMatch(/v_current_range_end_exclusive timestamptz/i);
    expect(migration).toMatch(/v_current_date_start::timestamp AT TIME ZONE 'America\/Sao_Paulo'/i);
    expect(migration).toMatch(/p\.data_pagamento >= v_current_range_start[\s\S]*?p\.data_pagamento < v_current_range_end_exclusive/i);
    expect(migration).not.toMatch(/p\.data_pagamento <= v_today/i);
  });

  it('usa a mesma janela civil para tarefas, coletas e agendamentos registrados', () => {
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toMatch(/t\.data_conclusao >= v_current_range_start[\s\S]*?t\.data_conclusao < v_current_range_end_exclusive/i);
    expect(migration).toMatch(/c\.data_coleta >= v_current_range_start[\s\S]*?c\.data_coleta < v_current_range_end_exclusive/i);
    expect(migration).toMatch(/al\.timestamp >= v_current_range_start[\s\S]*?al\.timestamp < v_current_range_end_exclusive/i);
    expect(migration).not.toMatch(/v_start := now\(\) - make_interval/i);
  });
});
