import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CATALOGO_EXAMES, exameDoTipoGravado, tipoCategorizadoDaCategoria } from '../catalogoExames';

describe('catálogo de exames', () => {
  it('não repete código TUSS entre exames diferentes', () => {
    const codigos = CATALOGO_EXAMES.map(exame => exame.tuss).filter(Boolean);
    const repetidos = codigos.filter((codigo, indice) => codigos.indexOf(codigo) !== indice);
    expect(repetidos).toEqual([]);
  });

  it('não repete nomes', () => {
    const nomes = CATALOGO_EXAMES.map(exame => exame.nome.toLowerCase());
    expect(new Set(nomes).size).toBe(nomes.length);
  });

  it('marcadores tumorais sem código confirmado ficam sem TUSS', () => {
    expect(CATALOGO_EXAMES.find(exame => exame.nome === 'CA 19-9')?.tuss).toBe('');
    expect(CATALOGO_EXAMES.find(exame => exame.nome === 'CA 15-3')?.tuss).toBe('');
  });
});

describe('tipo de cada exame pela categoria', () => {
  it('separa laboratório, imagem, ultrassom, cardiologia e endoscopia', () => {
    expect(tipoCategorizadoDaCategoria('Hematologia')).toBe('laboratorial');
    expect(tipoCategorizadoDaCategoria('Bioquímica')).toBe('laboratorial');
    expect(tipoCategorizadoDaCategoria('Imagem - RX')).toBe('imagem');
    expect(tipoCategorizadoDaCategoria('Imagem - TC')).toBe('imagem');
    expect(tipoCategorizadoDaCategoria('Mamografia')).toBe('imagem');
    expect(tipoCategorizadoDaCategoria('Imagem - US')).toBe('ultrassom');
    expect(tipoCategorizadoDaCategoria('Cardiologia')).toBe('cardiologia');
    expect(tipoCategorizadoDaCategoria('Endoscopia')).toBe('endoscopia');
    expect(tipoCategorizadoDaCategoria('Oftalmologia')).toBe('outro');
  });

  it('mantém laboratorial para categoria desconhecida ou personalizada', () => {
    expect(tipoCategorizadoDaCategoria('Personalizado')).toBe('laboratorial');
    expect(tipoCategorizadoDaCategoria(undefined)).toBe('laboratorial');
  });

  it('todas as categorias do catálogo têm tipo definido', () => {
    for (const exame of CATALOGO_EXAMES) expect(tipoCategorizadoDaCategoria(exame.categoria)).toBeTruthy();
  });
});

describe('reconstrução do exame gravado', () => {
  it('encontra o exame do catálogo pelo texto "TUSS - nome"', () => {
    expect(exameDoTipoGravado('40304361 - Hemograma Completo')).toEqual({ nome: 'Hemograma Completo', tuss: '40304361', categoria: 'Hematologia' });
    expect(exameDoTipoGravado('Raio-X Tórax PA')).toMatchObject({ categoria: 'Imagem - RX' });
  });

  it('preserva exame personalizado com código livre', () => {
    expect(exameDoTipoGravado('INT1234567 - Teste especial')).toEqual({ nome: 'Teste especial', tuss: 'INT1234567', categoria: 'Personalizado' });
  });
});

describe('PDF do laudo', () => {
  it('lê resultado com vírgula decimal ao marcar alterado', () => {
    const pdf = readFileSync('src/lib/pdfGenerator.ts', 'utf8');
    expect(pdf).toMatch(/parseResultadoNumerico\(resultado\.resultado\)/);
    expect(pdf).not.toMatch(/parseFloat\(resultado\.resultado\)/);
  });
});
