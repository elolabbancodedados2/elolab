import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20261013170000_auditoria_exportacao_lgpd_prontuarios.sql',
  'utf8',
);

describe('auditoria de exportação clínica LGPD', () => {
  it('registra exportação apenas para paciente da clínica e perfil clínico autorizado', () => {
    expect(migration).toMatch(/is_admin\(auth\.uid\(\)\) OR public\.is_medico\(auth\.uid\(\)\)/);
    expect(migration).toMatch(/is_paciente_da_clinica\(p_paciente_id, v_clinica_id\)/);
    expect(migration).toMatch(/'exportacao', 'Exportacao solicitada no modulo LGPD'/);
    expect(migration).toMatch(/p\.assinado IS TRUE OR public\.is_medico_responsavel_do_prontuario/);
  });

  it('autoriza leitura do prontuário assinado somente após evento recente do mesmo usuário', () => {
    expect(migration).toMatch(/pa\.user_id = auth\.uid\(\)/);
    expect(migration).toMatch(/pa\.acao IN \('visualizacao', 'exportacao'\)/);
    expect(migration).toMatch(/pa\.created_at >= now\(\) - interval '2 minutes'/);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.registrar_exportacao_lgpd_paciente\(uuid\) FROM PUBLIC, anon/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.registrar_exportacao_lgpd_paciente\(uuid\) TO authenticated/);
  });
});
