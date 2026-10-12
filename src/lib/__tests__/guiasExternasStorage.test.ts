import { describe, expect, it } from 'vitest';
import { pathsLaudoExternoAoFechar, pathLaudoAnteriorAposSalvar } from '../guiasExternasStorage';

describe('limpeza de anexos dos laboratórios parceiros', () => {
  it('remove ao fechar somente uploads temporários ainda não salvos', () => {
    expect(pathsLaudoExternoAoFechar('clinica/retornos/novo.pdf', 'clinica/retornos/salvo.pdf'))
      .toEqual(['clinica/retornos/novo.pdf']);
    expect(pathsLaudoExternoAoFechar('clinica/retornos/salvo.pdf', 'clinica/retornos/salvo.pdf'))
      .toEqual([]);
    expect(pathsLaudoExternoAoFechar(null, 'clinica/retornos/salvo.pdf')).toEqual([]);
    expect(pathsLaudoExternoAoFechar(
      ['clinica/retornos/temporario.pdf', 'clinica/retornos/salvo.pdf'],
      'clinica/retornos/salvo.pdf',
    )).toEqual(['clinica/retornos/temporario.pdf']);
  });

  it('só remove o anexo salvo anteriormente depois que o novo foi persistido', () => {
    expect(pathLaudoAnteriorAposSalvar('clinica/retornos/antigo.pdf', 'clinica/retornos/novo.pdf'))
      .toBe('clinica/retornos/antigo.pdf');
    expect(pathLaudoAnteriorAposSalvar('clinica/retornos/mesmo.pdf', 'clinica/retornos/mesmo.pdf'))
      .toBeNull();
    expect(pathLaudoAnteriorAposSalvar(null, 'clinica/retornos/novo.pdf')).toBeNull();
  });
});
