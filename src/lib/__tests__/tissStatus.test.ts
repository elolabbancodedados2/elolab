import { describe, expect, it } from 'vitest';
import {
  descricaoMotivoGlosa, formatarCompetencia, formatarDataCurta, mascararRegistroAns, MOTIVOS_GLOSA_TISS,
  rotuloStatusGlosa, rotuloStatusLote, rotuloStatusRepasse, sugerirProximoNumeroLote, validarNumeroLote, validarRegistroAns,
} from '@/lib/tissStatus';

describe('tissStatus', () => {
  it('traduz os status do banco', () => {
    expect(rotuloStatusLote('pago_parcial')).toBe('Pago parcial');
    expect(rotuloStatusGlosa('recurso_enviado')).toBe('Recurso enviado');
    expect(rotuloStatusRepasse('cancelado')).toBe('Cancelado');
    expect(rotuloStatusLote('novo_status')).toBe('Novo status');
    expect(rotuloStatusLote(null)).toBe('—');
  });

  it('formata competência e data no padrão brasileiro', () => {
    expect(formatarCompetencia('2026-10-01')).toBe('10/2026');
    expect(formatarCompetencia('2026-10')).toBe('10/2026');
    expect(formatarCompetencia('')).toBe('—');
    expect(formatarDataCurta('2026-10-31')).toBe('31/10/2026');
  });

  it('valida o número do lote com até 12 caracteres', () => {
    expect(validarNumeroLote('')).toMatch(/Informe/);
    expect(validarNumeroLote('1234567890123')).toMatch(/12 caracteres/);
    expect(validarNumeroLote('LOTE 1')).toMatch(/letras/);
    expect(validarNumeroLote('000123')).toBeNull();
  });

  it('sugere o próximo lote sequencial preservando zeros à esquerda', () => {
    expect(sugerirProximoNumeroLote([])).toBe('1');
    expect(sugerirProximoNumeroLote(['000041', '000039', 'ABC'])).toBe('000042');
    expect(sugerirProximoNumeroLote(['9', '10'])).toBe('11');
    expect(sugerirProximoNumeroLote(['999999999999'])).toBe('');
  });

  it('aceita registro ANS vazio ou com 6 dígitos', () => {
    expect(validarRegistroAns('')).toBeNull();
    expect(validarRegistroAns('123456')).toBeNull();
    expect(validarRegistroAns('12345')).toMatch(/6 dígitos/);
    expect(mascararRegistroAns('12.345-678')).toBe('123456');
  });

  it('mantém a lista de motivos de glosa sem códigos repetidos', () => {
    const codigos = MOTIVOS_GLOSA_TISS.map(item => item.codigo);
    expect(new Set(codigos).size).toBe(codigos.length);
    expect(descricaoMotivoGlosa('1308')).toBe('Guia já apresentada');
    expect(descricaoMotivoGlosa('0000')).toBeNull();
  });
});
