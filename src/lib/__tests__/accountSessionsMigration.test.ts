import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationPath = 'supabase/migrations/20261014100500_sessoes_proprias_por_conta.sql';
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : '';

describe('RPCs de sessões da própria conta', () => {
  it('mantém os metadados privados e não expõe leitura direta da tabela', () => {
    expect(migration).toMatch(/CREATE TABLE (?:IF NOT EXISTS )?public\.account_session_activity/i);
    expect(migration).toMatch(/ALTER TABLE public\.account_session_activity ENABLE ROW LEVEL SECURITY/i);
    expect(migration).toMatch(/REVOKE ALL ON TABLE public\.account_session_activity FROM anon, authenticated/i);
    expect(migration).not.toMatch(/CREATE POLICY[\s\S]*?ON public\.account_session_activity/i);
  });

  it('deriva a conta e a sessão dos claims e só retorna sessões próprias ainda válidas', () => {
    expect(migration).toMatch(/CREATE(?: OR REPLACE)? FUNCTION public\.list_my_account_sessions\(\)/i);
    expect(migration).toMatch(/auth\.uid\(\)/i);
    expect(migration).toMatch(/auth\.jwt\(\)[\s\S]*?session_id/i);
    expect(migration).toMatch(/FROM auth\.sessions AS auth_session[\s\S]*?LEFT JOIN public\.account_session_activity AS activity[\s\S]*?activity\.user_id\s*=\s*auth_session\.user_id/i);
    expect(migration).toMatch(/WHERE auth_session\.user_id\s*=\s*auth\.uid\(\)/i);
    expect(migration).toMatch(/not_after IS NULL[\s\S]*?not_after > statement_timestamp\(\)/i);
    expect(migration).not.toMatch(/list_my_account_sessions\([^)]/i);
  });

  it('remove os metadados quando o Auth apaga a sessão proprietária', () => {
    expect(migration).toMatch(/session_id uuid NOT NULL REFERENCES auth\.sessions\(id\) ON DELETE CASCADE/i);
  });

  it('inclui sessões Auth próprias ainda sem heartbeat do EloLab', () => {
    const listFunction = migration.split('CREATE OR REPLACE FUNCTION public.list_my_account_sessions()')[1] ?? '';
    expect(listFunction).toMatch(/FROM auth\.sessions AS auth_session[\s\S]*?LEFT JOIN public\.account_session_activity AS activity/i);
    expect(listFunction).toMatch(/WHERE auth_session\.user_id = auth\.uid\(\)/i);
    expect(listFunction).toMatch(/COALESCE\(activity\.user_agent, auth_session\.user_agent, ''\)/i);
    expect(listFunction).toMatch(/COALESCE\(activity\.last_activity_at, auth_session\.refreshed_at, auth_session\.updated_at, auth_session\.created_at\)/i);
  });

  it('sanitiza o agente, limita seu tamanho e atualiza uma linha por conta/sessão', () => {
    expect(migration).toMatch(/regexp_replace\(COALESCE\(p_user_agent, ''\), '\[\[:cntrl:\]\]', '', 'g'\)/i);
    expect(migration).toMatch(/LEFT\([\s\S]*?,\s*500\s*\)/i);
    expect(migration).toMatch(/ON CONFLICT\s*\(user_id, session_id\)\s*DO UPDATE/i);
    expect(migration).toMatch(/last_activity_at\s*=\s*statement_timestamp\(\)/i);
    expect(migration).not.toMatch(/\b(ip_address|user_agent_ip|ip\s+inet)\b/i);
  });

  it('restringe as RPCs a authenticated e nunca concede execução a anon', () => {
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.touch_my_account_session\(text\) FROM PUBLIC, anon/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.touch_my_account_session\(text\) TO authenticated/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.list_my_account_sessions\(\) FROM PUBLIC, anon/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.list_my_account_sessions\(\) TO authenticated/i);
    expect(migration).toMatch(/SECURITY DEFINER[\s\S]*?SET search_path = ''/i);
  });
});
