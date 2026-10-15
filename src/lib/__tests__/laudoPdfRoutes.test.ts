import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('QR code de laudo PDF', () => {
  it('não aponta para uma rota pública de validação que não existe', () => {
    const source = readFileSync('src/lib/pdfGenerator.ts', 'utf8');

    expect(source).not.toContain('app.elolab.com.br/validar/');
    expect(source).toContain('REGISTRO DE CONFERÊNCIA E LIBERAÇÃO');
  });
});
