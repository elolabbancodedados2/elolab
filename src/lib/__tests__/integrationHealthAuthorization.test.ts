import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('supabase/functions/integration-health/index.ts', 'utf8');

describe('diagnóstico de saúde da plataforma', () => {
  it('exige superadmin antes de criar o cliente service_role', () => {
    const authCheck = source.indexOf("userDb.rpc('is_platform_admin')");
    const serviceClient = source.indexOf('const service=createClient(url,serviceKey)');
    expect(authCheck).toBeGreaterThan(-1);
    expect(source.slice(authCheck, serviceClient)).toContain('isPlatformAdmin!==true');
    expect(source.slice(authCheck, serviceClient)).toContain('platformAdminError');
    expect(serviceClient).toBeGreaterThan(authCheck);
  });

  it('não permite acesso de administrador de clínica nem reduz os totais à clínica do perfil', () => {
    expect(source).not.toContain("userDb.rpc('is_admin'");
    expect(source).not.toContain("from('profiles')");
    expect(source).not.toContain("eq('clinica_id'");
  });
});
