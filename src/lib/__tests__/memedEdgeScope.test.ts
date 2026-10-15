import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const path = 'supabase/functions/memed-prescription/index.ts';
const source = existsSync(path) ? readFileSync(path, 'utf8') : '';

describe('escopo da Edge Function Memed', () => {
  it('carrega os papéis do usuário e valida o médico vinculado à sessão', () => {
    expect(/from\('user_roles'\)\.select\('role'\)\.eq\('user_id', user\.id\)/.test(source)).toBe(true);
    expect(/autorizarAcaoMemed\(action, user\.id,/.test(source)).toBe(true);
    expect(/select\('id, user_id, clinica_id,[^']*'\)/.test(source)).toBe(true);
  });

  it('limita leitura e baixa de eventos Memed ao mesmo paciente e prescritor', () => {
    expect(/\.eq\('clinica_id', clinicaId\)\.eq\('medico_id', medicoId\)\.eq\('paciente_id', pacienteId\)[\s\S]*?\.eq\('memed_prescription_id', idExcluido\)/.test(source)).toBe(true);
    expect(/existente\.medico_id !== medicoId \|\| existente\.paciente_id !== pacienteId/.test(source)).toBe(true);
  });

  it('registra callbacks repetidos por RPC idempotente e atomico', () => {
    expect(/service\.rpc\('registrar_prescricao_memed_local'/i.test(source)).toBe(true);
    expect(/from\('prescricoes'\)\.select\('id'\)[\s\S]*?maybeSingle\(\)/i.test(source)).toBe(false);
  });

  it('requires step-up MFA before preparing or recording a prescription', () => {
    const authCheck = source.indexOf("if (!user) return json({ error: 'Não autenticado.' }, 401);");
    const mfaCheck = source.indexOf('mfaRequiredResponse(req, user, corsHeaders)');
    const clinicLookup = source.indexOf("from('profiles').select('clinica_id')");
    expect(authCheck).toBeGreaterThan(-1);
    expect(mfaCheck).toBeGreaterThan(authCheck);
    expect(mfaCheck).toBeLessThan(clinicLookup);
  });
});
