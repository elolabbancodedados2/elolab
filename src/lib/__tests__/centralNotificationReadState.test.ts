import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync('supabase/migrations/20260820020000_central_notificacoes_usuario.sql', 'utf8');

describe('estado de leitura da central de notificações', () => {
  it('separa a leitura por clínica, conta, origem e item', () => {
    expect(migration).toMatch(/PRIMARY KEY \(clinica_id, user_id, source_type, source_id\)/i);
    expect(migration).toMatch(/user_id = auth\.uid\(\) AND clinica_id = public\.current_clinica_id\(\)/i);
    expect(migration).toMatch(/WITH CHECK \(user_id = auth\.uid\(\) AND clinica_id = public\.current_clinica_id\(\)\)/i);
  });

  it('deriva a conta e clínica atuais para listar apenas as pendências autorizadas', () => {
    expect(migration).toMatch(/select auth\.uid\(\) as user_id, public\.current_clinica_id\(\) as clinica_id/i);
    expect(migration).toMatch(/s\.clinica_id = c\.clinica_id AND s\.user_id = c\.user_id/i);
    expect(migration).toMatch(/limit least\(greatest\(coalesce\(p_limit, 100\), 1\), 250\)/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.central_notificacoes_usuario\(integer\) TO authenticated/i);
  });
});
