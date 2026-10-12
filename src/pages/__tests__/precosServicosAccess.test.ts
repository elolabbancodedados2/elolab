import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const tipos = readFileSync('src/pages/TiposConsulta.tsx', 'utf8');
const exames = readFileSync('src/pages/PrecosExames.tsx', 'utf8');

describe('acessibilidade e permissões dos preços e serviços', () => {
  it('mostra ações de cadastro de tipos apenas para administradores', () => {
    expect(tipos).toMatch(/isAdmin\(\)\s*&&\s*<Button[^>]*onClick=\{openCreate\}/);
    expect(tipos).toMatch(/isAdmin\(\)\s*&&\s*<>[\s\S]*onClick=\{\(\) => openEdit\(tipo\)\}/);
    expect(tipos).toMatch(/isAdmin\(\)\s*&&\s*<>[\s\S]*onClick=\{\(\) => setDeleteTarget\(tipo\)\}/);
  });

  it('associa rótulos aos controles e nomeia paleta de cores', () => {
    expect(tipos).toMatch(/htmlFor="tipo-nome"/);
    expect(tipos).toMatch(/id="tipo-nome"/);
    expect(tipos).toMatch(/aria-label=\{`Cor \$\{c\}`\}/);
    expect(exames).toMatch(/aria-label="Nome do exame"/);
    expect(exames).toMatch(/aria-label="Buscar exame ou código TUSS"/);
    expect(exames).toMatch(/SelectTrigger aria-label="Filtrar por convênio"/);
    expect(exames).toMatch(/htmlFor="preco-exame-tuss"/);
    expect(exames).toMatch(/id="preco-exame-tuss"/);
    expect(tipos).toMatch(/aria-label=\{`Preço para \$\{convenio\.nome\}`\}/);
  });
});
