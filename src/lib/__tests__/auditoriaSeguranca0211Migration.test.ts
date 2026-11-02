import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(resolve(process.cwd(), 'supabase/migrations', file), 'utf8');
const code = (sql: string) => sql.replace(/--.*$/gm, '');

describe('auditoria de segurança de 02/11 — migrations', () => {
  it('a view de coletas esquecidas respeita o RLS de quem consulta e fecha anon', () => {
    const sql = read('20261102100000_view_coletas_esquecidas_security_invoker.sql');
    expect(sql).toMatch(/ALTER VIEW IF EXISTS public\.fila_alertas_lab_esquecido SET \(security_invoker = on\)/i);
    expect(sql).toMatch(/REVOKE ALL ON public\.fila_alertas_lab_esquecido FROM anon/i);
  });

  it('logs de webhook: sem INSERT por clínica e leitura só da plataforma', () => {
    const sql = read('20261102101000_webhook_logs_so_plataforma.sql');
    expect(sql).toMatch(/DROP POLICY IF EXISTS "webhook_logs_insert_restricted" ON public\.mercadopago_webhook_logs/i);
    expect(sql).not.toMatch(/CREATE POLICY[^;]*FOR INSERT/i);
    expect(sql).toMatch(/CREATE POLICY "webhook_logs_select"[\s\S]*?USING \(public\.is_platform_admin\(\)\)/i);
    expect(code(sql)).not.toMatch(/is_admin\(/i);
  });

  it('assinatura do plano: dono ou plataforma, nunca admin de outra clínica', () => {
    const sql = read('20261102102000_assinatura_plano_select_propria.sql');
    expect(sql).toMatch(/CREATE POLICY "assinatura_select"[\s\S]*?USING \(user_id = auth\.uid\(\) OR public\.is_platform_admin\(\)\)/i);
    expect(code(sql)).not.toMatch(/is_admin\(/i);
  });

  it('remove as políticas antigas de storage com os nomes exatos da criação', () => {
    const sql = read('20261102103000_remove_politicas_antigas_storage.sql');
    const created = read('20260205172117_264ce3f9-f57c-42f0-8047-e9dda0053f48.sql')
      + read('20260206034018_96bd559d-c915-4cc3-a04d-7154dd0296f8.sql');
    for (const name of [
      'Usuários clínicos podem fazer upload',
      'Médicos e admins podem deletar anexos',
      'Permitir leitura pública de mídias do painel',
      'Admins podem fazer upload de mídias do painel',
      'Admins podem deletar mídias do painel',
    ]) {
      expect(created).toContain(`CREATE POLICY "${name}"`);
      expect(sql).toContain(`DROP POLICY IF EXISTS "${name}" ON storage.objects;`);
    }
  });

  it('prontuário não pode ser inserido já assinado', () => {
    const sql = read('20261102104000_prontuario_nasce_sem_assinatura.sql');
    const policy = sql.match(/CREATE POLICY prontuarios_insert_autor_ou_admin[\s\S]*?\);/i)?.[0] ?? '';
    expect(policy).toMatch(/FOR INSERT TO authenticated/i);
    expect(policy).toMatch(/is_same_clinica\(clinica_id\)/i);
    expect(policy).toMatch(/is_medico_responsavel_do_prontuario\(medico_id\)/i);
    expect(policy).toMatch(/assinado IS NOT TRUE/i);
    expect(policy).toMatch(/assinado_em IS NULL/i);
    expect(policy).toMatch(/hash_conteudo IS NULL/i);
    expect(policy).toMatch(/crm_assinante IS NULL/i);
  });

  it('cid10_codigos tem RLS, leitura autenticada e nenhuma escrita pela API', () => {
    const sql = read('20261102105000_cid10_codigos_rls.sql');
    expect(sql).toMatch(/ALTER TABLE IF EXISTS public\.cid10_codigos ENABLE ROW LEVEL SECURITY/i);
    expect(sql).toMatch(/REVOKE ALL ON public\.cid10_codigos FROM anon/i);
    expect(sql).toMatch(/CREATE POLICY cid10_codigos_select_autenticado[\s\S]*?FOR SELECT TO authenticated/i);
    expect(sql).not.toMatch(/FOR (INSERT|UPDATE|DELETE|ALL)/i);
  });

  it('traz a revogação de anon já aplicada em produção', () => {
    const sql = read('20261028090000_revogar_anon_e_privilegios_padrao.sql');
    expect(sql).toMatch(/ALTER DEFAULT PRIVILEGES/i);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.link_portal_paciente/i);
  });
});
