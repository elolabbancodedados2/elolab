import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const path = 'supabase/migrations/20261014160000_historico_configuracoes_clinica.sql';

describe('histórico de versões das configurações da clínica', () => {
  it('restringe snapshots às chaves administrativas versionadas e permite apenas leitura por admin da clínica', () => {
    const migration = readFileSync(path, 'utf8');
    expect(migration).toMatch(/CREATE TABLE (?:IF NOT EXISTS )?public\.configuracoes_clinica_versoes/i);
    expect(migration).toMatch(/CHECK \(chave IN \('config_clinica', 'config_impressao', 'config_seguranca'\)\)/i);
    expect(migration).toMatch(/ALTER TABLE public\.configuracoes_clinica_versoes ENABLE ROW LEVEL SECURITY/i);
    expect(migration).toMatch(/FOR SELECT TO authenticated[\s\S]*get_my_clinica_id\(\)[\s\S]*is_admin\(auth\.uid\(\)\)/i);
    expect(migration).not.toMatch(/CREATE POLICY[^;]*ON public\.configuracoes_clinica_versoes[^;]*FOR (?:INSERT|UPDATE|DELETE)/i);
  });

  it('captura salvamentos e restaurações como novas versões com controle de concorrência', () => {
    const migration = readFileSync(path, 'utf8');
    expect(migration).toMatch(/CREATE TRIGGER trg_registrar_versao_configuracao_clinica[\s\S]*AFTER INSERT OR UPDATE OF valor ON public\.configuracoes_clinica/i);
    expect(migration).toMatch(/INSERT INTO public\.configuracoes_clinica_versoes[\s\S]*NEW\.valor[\s\S]*auth\.uid\(\)/i);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.restaurar_configuracao_clinica_versao\([\s\S]*p_versao_esperada timestamptz/i);
    expect(migration).toMatch(/v_versao_atual IS DISTINCT FROM p_versao_esperada/i);
    expect(migration).toMatch(/restaurada_de/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.restaurar_configuracao_clinica_versao/i);
  });
});
