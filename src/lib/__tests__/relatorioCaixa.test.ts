import { describe, expect, it } from 'vitest';
import { montarRelatorioCaixaHtml, textoDiferenca } from '@/lib/relatorioCaixa';

describe('relatorioCaixa', () => {
  it('inclui a coluna Paciente e escapa o HTML', () => {
    const html = montarRelatorioCaixaHtml({
      caixa: { data: '2026-11-01', aberto: false, valor_abertura: 100, valor_fechamento: 140, operador_abertura: 'Ana', operador_fechamento: 'Ana' },
      movimentos: [{ tipo: 'receita', valor: 50, forma_pagamento: 'dinheiro', descricao: '<b>Consulta</b>', created_at: '2026-11-01T13:00:00Z', paciente_nome: 'Maria' }],
      emitidoEm: new Date('2026-11-01T20:00:00Z'),
    });
    expect(html).toContain('<th>Paciente</th>');
    expect(html).toContain('Maria');
    expect(html).toContain('&lt;b&gt;Consulta&lt;/b&gt;');
    expect(html).toContain('Falta');
  });

  it('descreve a diferença em texto', () => {
    expect(textoDiferenca(0)).toBe('Bateu');
    expect(textoDiferenca(-10)).toMatch(/^Falta R\$\s10,00$/);
    expect(textoDiferenca(5)).toMatch(/^Sobra/);
    expect(textoDiferenca(null)).toBe('—');
  });
});
