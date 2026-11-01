import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const portalPage = readFileSync('src/pages/PortalPaciente.tsx', 'utf8');
const portalFunction = readFileSync('supabase/functions/patient-portal/index.ts', 'utf8');

describe('histórico completo no portal do paciente', () => {
  it('pagina consultas, exames, pagamentos e prescrições com deslocamento explícito', () => {
    expect(portalPage).toContain('offset: currentItems.length');
    expect(portalPage).toContain('Carregar mais consultas');
    expect(portalPage).toContain('Carregar mais exames');
    expect(portalPage).toContain('Carregar mais prescricoes');
    expect(portalPage).toContain('Carregar mais pagamentos');
    expect(portalFunction).toMatch(/\.range\(offset, offset \+ 49\)/);
    expect(portalFunction).toMatch(/\.range\(offset, offset \+ 29\)/);
    expect(portalFunction).toMatch(/\.range\(offset, offset \+ 19\)/);
  });

  it('não expõe laudo HTTPS de origem externa sem compatibilidade com o validador da tela', () => {
    expect(portalFunction).toContain('extrairCaminhoAnexoClinico');
    expect(portalFunction).toContain('laudoPertenceAoPaciente(caminhoLaudo, pacienteId, pacienteClinicaId');
    expect(portalFunction).toMatch(/createSignedUrl\(caminhoLaudo, 300\)/);
    expect(portalFunction).not.toContain('fileUrl.hostname');
    expect(portalFunction).toMatch(/arquivo_resultado: null, arquivo_resultado_indisponivel: true/);
    expect(portalPage).toContain('Solicite o laudo');
  });
});
