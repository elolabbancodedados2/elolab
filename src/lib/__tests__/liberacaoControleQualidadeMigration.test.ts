import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync('supabase/migrations/20261024120000_liberacao_exige_controle_qualidade.sql', 'utf8');

describe('liberação exige controle de qualidade aprovado', () => {
  it('bloqueia no banco a passagem de liberado para true, inclusive no lote atômico', () => {
    expect(migration).toMatch(/BEFORE INSERT OR UPDATE OF liberado ON public\.resultados_laboratorio/);
    expect(migration).toMatch(/NEW\.liberado IS NOT TRUE OR \(TG_OP = 'UPDATE' AND OLD\.liberado IS TRUE\)/);
    expect(migration).toMatch(/RAISE EXCEPTION 'Liberação bloqueada: controle de qualidade fora da faixa aprovada/);
  });

  it('considera só a corrida mais recente por analito, nível e equipamento do setor', () => {
    expect(migration).toMatch(/DISTINCT ON \(q\.analito, COALESCE\(q\.nivel, ''\), q\.equipamento_id\)/);
    expect(migration).toMatch(/q\.setor_id IS NULL OR q\.setor_id IS NOT DISTINCT FROM v_setor_id/);
    expect(migration).toMatch(/ORDER BY[^;]*q\.realizado_em DESC/);
    expect(migration).toMatch(/WHERE ultimo\.aprovado IS NOT TRUE/);
  });

  it('é idempotente e não expõe a função ao cliente', () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.laboratorio_liberacao_exige_controle_qualidade/);
    expect(migration).toMatch(/DROP TRIGGER IF EXISTS trg_lab_liberacao_exige_controle_qualidade/);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.laboratorio_liberacao_exige_controle_qualidade\(\) FROM PUBLIC, anon, authenticated/);
  });

  it('a gestão do laboratório explica o bloqueio ao lançar controles', () => {
    const painel = readFileSync('src/pages/laboratorio/GestaoLaboratorioPanel.tsx', 'utf8');
    expect(painel).toMatch(/bloqueia a liberação de resultados do setor/);
  });
});
