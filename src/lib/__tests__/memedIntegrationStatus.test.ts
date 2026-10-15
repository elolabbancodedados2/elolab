import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const catalogoSource = readFileSync('supabase/functions/_shared/catalogoIntegracoes.ts', 'utf8');
const prescriptionSource = readFileSync('supabase/functions/memed-prescription/index.ts', 'utf8');
const clinicIntegrationsSource = readFileSync('supabase/functions/clinic-integrations/index.ts', 'utf8');

describe('status automático da Memed na tela de integrações', () => {
  it('cadastra a Memed no catálogo como integração por profissional e somente status', () => {
    expect(catalogoSource).toMatch(/id: 'memed'/);
    expect(catalogoSource).toMatch(/id: 'memed'[\s\S]{0,400}escopo: 'profissional'/);
    expect(catalogoSource).toMatch(/id: 'memed'[\s\S]{0,400}somenteStatus: true/);
  });

  it('recusa conectar ou desconectar manualmente uma integração somenteStatus', () => {
    const check = clinicIntegrationsSource.indexOf('integracao.somenteStatus');
    expect(check).toBeGreaterThan(-1);
    expect(clinicIntegrationsSource.indexOf("action === 'connect'")).toBeLessThan(
      clinicIntegrationsSource.lastIndexOf("if (action === 'connect') {"),
    );
  });

  it('grava o status conectado/erro automaticamente ao preparar a prescrição', () => {
    const helperDef = prescriptionSource.indexOf('async function registrarStatusMemed(');
    const successCall = prescriptionSource.indexOf("registrarStatusMemed(service, clinicaId, medicoId, 'conectado', null)");
    const tokenReturn = prescriptionSource.indexOf('return json({ token,');
    const incompleteDataCall = prescriptionSource.indexOf("registrarStatusMemed(service, clinicaId, medicoId, 'erro'");

    expect(helperDef).toBeGreaterThan(-1);
    expect(incompleteDataCall).toBeGreaterThan(helperDef);
    expect(successCall).toBeGreaterThan(helperDef);
    expect(successCall).toBeLessThan(tokenReturn);
  });

  it('nunca grava o status usando a tabela errada ou campos sensíveis', () => {
    const helperBody = prescriptionSource.slice(
      prescriptionSource.indexOf('async function registrarStatusMemed('),
      prescriptionSource.indexOf('async function tokenPrescritorMemed('),
    );
    expect(helperBody).toContain("from('integracoes_clinica')");
    expect(helperBody).not.toContain('segredo_cifrado');
    expect(helperBody).not.toContain('token');
  });
});
