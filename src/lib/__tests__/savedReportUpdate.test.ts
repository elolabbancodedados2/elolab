import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const reportPage = readFileSync('src/components/relatorios/RelatorioCustomizado.tsx', 'utf8');
const savedReportsPage = readFileSync('src/pages/RelatoriosSalvos.tsx', 'utf8');

describe('atualização segura de relatório salvo', () => {
  it('restaura propriedade e versão do registro para permitir somente edição própria', () => {
    expect(savedReportsPage).toMatch(/user_id: it\.user_id, updated_at: it\.updated_at/);
    expect(reportPage).toMatch(/savedReport\.userId === user\?\.id/);
  });

  it('faz compare-and-set dentro do escopo de dono e clínica', () => {
    const updateFlow = reportPage.split(".from('relatorios_salvos')")[1] ?? '';
    expect(updateFlow).toMatch(/\.update\(payload\)[\s\S]*?\.eq\('id', savedReport\.id\)[\s\S]*?\.eq\('user_id', user\.id\)[\s\S]*?\.eq\('clinica_id', clinicaId\)[\s\S]*?\.eq\('updated_at', savedReport\.updatedAt\)/);
    expect(updateFlow).toMatch(/\.select\('id'\)\s*\.maybeSingle\(\)/);
  });

  it('remove configurações antigas de agendamento ao salvar apenas como favorito', () => {
    expect(reportPage).toMatch(/frequencia: null,[\s\S]*?dia_semana: null,[\s\S]*?dia_mes: null,[\s\S]*?hora: null,[\s\S]*?proxima_execucao: null/);
    expect(reportPage).toMatch(/canUpdateSavedReport && savedReport \? savedReport\.ativo : true/);
  });
});
