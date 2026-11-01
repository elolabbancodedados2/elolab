import { describe, expect, it } from 'vitest';
import { barcode39Svg, sampleLabelHtml } from '@/lib/sampleLabel';

describe('sample labels', () => {
  it('encodes hexadecimal sample IDs as uppercase Code 39 SVG', () => {
    const svg = barcode39Svg('a4b82f19');
    expect(svg).toContain('<svg');
    expect(svg).toContain('aria-label="Código de barras da amostra A4B82F19"');
    expect(svg).toContain('A4B82F19');
    expect(svg.match(/<rect /g)?.length).toBeGreaterThan(10);
  });

  it('rejects values outside the scanner-safe Code 39 alphabet', () => {
    expect(barcode39Svg('id_123')).toBeNull();
  });

  it('prints the sample identifier and tube only, with no patient or exam details', () => {
    const html = sampleLabelHtml({ codigoAmostra: 'a4b82f19', tubo: 'EDTA (Roxo)' });
    expect(html).toContain('A4B82F19');
    expect(html).toContain('EDTA (Roxo)');
    expect(html).toContain('<svg');
    expect(html).not.toMatch(/João|Nascimento|Idade|Sexo|Hemograma|Paciente/i);
  });

  it('adds patient name, birth date, collection date and exams when provided', () => {
    const html = sampleLabelHtml({ codigoAmostra: 'a4b82f19', tubo: 'EDTA (Roxo)', paciente: 'Maria <Souza>', nascimento: '1980-03-15', dataColeta: '01/11/2026 09:30', exames: ['Hemograma', 'Glicemia'] });
    expect(html).toContain('Maria &lt;Souza&gt; · Nasc. 15/03/1980');
    expect(html).toContain('Coleta: 01/11/2026 09:30');
    expect(html).toContain('Hemograma, Glicemia');
  });

  it('escapes tube labels before inserting them in the print document', () => {
    expect(sampleLabelHtml({ codigoAmostra: 'a4b82f19', tubo: '<script>alert(1)</script>' }))
      .not.toContain('<script>');
  });
});
