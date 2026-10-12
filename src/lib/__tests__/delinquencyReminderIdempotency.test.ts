import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationPath = 'supabase/migrations/20261011250000_cobranca_inadimplente_claim_atomico.sql';
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : '';
const edgeFunction = readFileSync('supabase/functions/delinquency-whatsapp-reminder/index.ts', 'utf8');

describe('deduplicação da régua de inadimplência', () => {
  it('usa uma reserva única com lease e conclusão por clínica, conta e etapa', () => {
    expect(migration).toMatch(/PRIMARY KEY\s*\(clinica_id, lancamento_id, dias_atraso\)/i);
    expect(migration).toMatch(/ON CONFLICT\s*\(clinica_id, lancamento_id, dias_atraso\)[\s\S]*?claimed_until/i);
    expect(migration).toMatch(/FUNCTION public\.claim_cobranca_inadimplente/i);
    expect(migration).toMatch(/FUNCTION public\.concluir_cobranca_inadimplente/i);
  });

  it('reserva antes de enviar e conclui após o envio ou enfileiramento', () => {
    expect(edgeFunction).toMatch(/claim_cobranca_inadimplente/);
    expect(edgeFunction).toMatch(/concluir_cobranca_inadimplente/);
    expect(edgeFunction.indexOf('claim_cobranca_inadimplente')).toBeLessThan(edgeFunction.indexOf('fetch(`${evolutionApiUrl}/message/sendText/'));
  });

  it('checks the patient clinic before using contact details', () => {
    expect(edgeFunction).toMatch(/pac\.clinica_id\s*!==\s*clinicaId/);
    expect(edgeFunction.indexOf('pac.clinica_id !== clinicaId')).toBeLessThan(edgeFunction.indexOf('const valorFmt'));
  });

  it('paginates cron records with stable ordering', () => {
    expect(edgeFunction).toMatch(/\.order\("data_vencimento",\s*\{\s*ascending:\s*true\s*\}\)\s*\.order\("id",\s*\{\s*ascending:\s*true\s*\}\)/);
    expect(edgeFunction).toMatch(/\.or\(`data_vencimento\.gt\.\$\{cursor\.data_vencimento\},and\(data_vencimento\.eq\.\$\{cursor\.data_vencimento\},id\.gt\.\$\{cursor\.id\}\)`\)/);
    expect(edgeFunction).toMatch(/\.range\(0,\s*batchSize\s*-\s*1\)/);
  });

  it('reabre e-mail de cobrança em erro sem criar outro item na fila', () => {
    expect(edgeFunction).toMatch(/\.eq\("id",\s*emailComErro\.id\)[\s\S]*?\.eq\("clinica_id",\s*clinicaId\)[\s\S]*?\.eq\("status",\s*"erro"\)/);
    expect(edgeFunction).toMatch(/status:\s*"pendente"[\s\S]*?tentativas:\s*0[\s\S]*?iniciado_em:\s*null/);
  });

  it('não troca automaticamente de canal quando a resposta WhatsApp é ambígua', () => {
    expect(edgeFunction).toMatch(/resultado_whatsapp_indeterminado/);
    expect(edgeFunction).toMatch(/status:\s*"erro"[\s\S]*?requer_revisao_manual:\s*true/);
    expect(edgeFunction).toMatch(/const whatsappIndeterminado[\s\S]*?resultado_whatsapp_indeterminado/);
    expect(edgeFunction).toMatch(/registrarWhatsAppIndeterminado[\s\S]*?concluir_cobranca_inadimplente/);
    expect(edgeFunction).toMatch(/catch\s*\(err\)[\s\S]*?registrarWhatsAppIndeterminado/);
    const catchBlock = edgeFunction.slice(edgeFunction.lastIndexOf('} catch (err)'));
    expect(catchBlock).not.toMatch(/enfileirarEmail\(\)/);
  });
});
