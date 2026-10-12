import { describe, expect, it } from 'vitest';
import { extractCid10Codes } from '@/components/clinical/Cid10Search';

describe('leitura de códigos CID-10 existentes', () => {
  it('recupera códigos completos com extensão e remove duplicados', () => {
    expect(extractCid10Codes('A09 - Gastroenterite; O99.891 - condição; A09 - repetido'))
      .toEqual(['A09', 'O99.891']);
  });

  it('não inventa códigos para texto clínico livre', () => {
    expect(extractCid10Codes('Dor abdominal há dois dias')).toEqual([]);
  });
});
