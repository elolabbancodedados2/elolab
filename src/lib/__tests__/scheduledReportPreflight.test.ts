import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const runner = readFileSync('supabase/functions/scheduled-reports-runner/index.ts', 'utf8');
const form = readFileSync('src/pages/SalvarRelatorioPage.tsx', 'utf8');

describe('preflight de relatórios agendados', () => {
  it('oferece preflight autenticado para canal e membros ativos com papel permitido', () => {
    expect(runner).toMatch(/action\s*===\s*["']preflight["']/);
    expect(runner).toMatch(/BREVO_API_KEY/);
    expect(runner).toMatch(/profiles[\s\S]{0,240}clinica_id[\s\S]{0,240}ativo/);
    expect(runner).toMatch(/datasetPreflight\.allowedRoles[\s\S]{0,120}callerRoles/);
    expect(runner).toMatch(/https:\/\/api\.brevo\.com\/v3\/account[\s\S]{0,180}method:\s*"GET"/);
    expect(runner).toMatch(/timeout = setTimeout\([\s\S]{0,100}6_000/);
  });

  it('exige confirmação do fuso e escolhe destinatários da lista validada', () => {
    expect(form).toContain('America/Sao_Paulo');
    expect(form).toMatch(/Confirmo[^\n]{0,140}Brasília|Confirmo[^\n]{0,140}horário/);
    expect(form).toMatch(/preflight\?\.recipients/);
    expect(form).not.toContain('E-mails destinatarios do relatorio');
  });

  it('revalida cada endereço na clínica e papel corretos antes do envio', () => {
    expect(runner).toMatch(/const destinatariosAutorizados = emailsSalvos\.filter[\s\S]{0,700}sendBrevoEmail/);
    expect(runner).toMatch(/\.eq\("clinica_id", r\.clinica_id\)[\s\S]{0,80}\.eq\("ativo", true\)/);
    expect(runner).toMatch(/ds\.allowedRoles\.some\(\(role\) => papeis\.has\(role\)\)/);
  });
});
