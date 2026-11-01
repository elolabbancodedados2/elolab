import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CATEGORIAS_DESPESA_CAIXA, ehMovimentoDoCaixa, origemExternaDoMovimento } from './origemMovimentoCaixa';

describe('origem dos movimentos do caixa', () => {
  it('libera sangria, suprimento e despesas lançadas pelo próprio caixa', () => {
    expect(ehMovimentoDoCaixa({ tipo: 'sangria', categoria: 'sangria' })).toBe(true);
    expect(ehMovimentoDoCaixa({ tipo: 'suprimento', categoria: 'suprimento' })).toBe(true);
    expect(ehMovimentoDoCaixa({ tipo: 'despesa', categoria: 'Limpeza', origem_pagamento: false })).toBe(true);
    expect(origemExternaDoMovimento({ tipo: 'despesa', categoria: 'Outros' })).toBeNull();
  });

  it('bloqueia repasse médico e aponta para a tela de repasses', () => {
    const repasse = { tipo: 'despesa', categoria: 'honorario_medico', origem_pagamento: false };
    expect(ehMovimentoDoCaixa(repasse)).toBe(false);
    expect(origemExternaDoMovimento(repasse)).toMatchObject({ rotulo: 'Repasse', rota: '/repasses-medicos' });
  });

  it('bloqueia ajuste e recebimento de convênio TISS', () => {
    const ajuste = { tipo: 'despesa', categoria: 'ajuste_convenio', origem_pagamento: false };
    expect(ehMovimentoDoCaixa(ajuste)).toBe(false);
    expect(origemExternaDoMovimento(ajuste)).toMatchObject({ rotulo: 'Convênio', rota: '/faturamento-convenios' });
    expect(origemExternaDoMovimento({ tipo: 'receita', categoria: 'convenio_repasse' })?.rotulo).toBe('Convênio');
  });

  it('bloqueia baixas vindas de pagamentos e categorias desconhecidas', () => {
    expect(ehMovimentoDoCaixa({ tipo: 'despesa', categoria: 'Limpeza', origem_pagamento: true })).toBe(false);
    expect(origemExternaDoMovimento({ tipo: 'despesa', categoria: 'aluguel', origem_pagamento: true })?.rotulo).toBe('Contas a pagar');
    expect(ehMovimentoDoCaixa({ tipo: 'despesa', categoria: 'categoria_nova' })).toBe(false);
    expect(origemExternaDoMovimento({ tipo: 'despesa', categoria: null })?.rotulo).toBe('Financeiro');
    expect(ehMovimentoDoCaixa({ tipo: 'receita', categoria: 'consulta' })).toBe(false);
  });

  it('mantém a lista igual à da tela que registra a despesa do caixa', () => {
    const fonte = readFileSync(resolve(__dirname, '../pages/CashOperationPage.tsx'), 'utf8');
    const trecho = fonte.match(/const CATEGORIAS_DESPESA = \[([^\]]+)\]/)?.[1] ?? '';
    const categorias = [...trecho.matchAll(/'([^']+)'/g)].map(m => m[1]);
    expect(categorias).toEqual([...CATEGORIAS_DESPESA_CAIXA]);
  });
});
