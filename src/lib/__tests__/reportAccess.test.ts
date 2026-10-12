import { describe, expect, it } from 'vitest';
import { existeMaisResultadoQueLimite, podeAcessarRelatorioCompletoDePacientes, podeExportarFontesCompletas } from '../reportAccess';

describe('acesso ao relatório completo de pacientes', () => {
  it('permite o relatório completo para administradores', () => {
    expect(podeAcessarRelatorioCompletoDePacientes(['admin'])).toBe(true);
  });

  it('não oferece o relatório completo ao perfil financeiro', () => {
    expect(podeAcessarRelatorioCompletoDePacientes(['financeiro'])).toBe(false);
  });

  it('nega acesso sem perfil identificado', () => {
    expect(podeAcessarRelatorioCompletoDePacientes(null)).toBe(false);
  });

  it('bloqueia exportação se uma fonte necessária atingiu o limite', () => {
    expect(podeExportarFontesCompletas(['agendamentos', 'médicos'], ['médicos'])).toBe(false);
    expect(podeExportarFontesCompletas(['estoque'], ['pacientes'])).toBe(true);
  });

  it('só marca o relatório customizado como truncado quando existe ao menos uma linha extra', () => {
    expect(existeMaisResultadoQueLimite(500, 500)).toBe(false);
    expect(existeMaisResultadoQueLimite(501, 500)).toBe(true);
  });
});
