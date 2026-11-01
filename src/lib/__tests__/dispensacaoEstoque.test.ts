import { describe, expect, it } from 'vitest';
import {
  escolherItemDispensacao, lerQuantidadeDispensacao, normalizarNomeItem, ordenarFefo, termoBuscaAmpla,
} from '@/lib/dispensacaoEstoque';

const HOJE = '2026-11-01';

describe('dispensação: quantidade', () => {
  it('aceita só inteiros positivos', () => {
    expect(lerQuantidadeDispensacao(' 2 ')).toBe(2);
    expect(lerQuantidadeDispensacao('½')).toBeNull();
    expect(lerQuantidadeDispensacao('meia caixa')).toBeNull();
    expect(lerQuantidadeDispensacao('1,5')).toBeNull();
    expect(lerQuantidadeDispensacao('0')).toBeNull();
    expect(lerQuantidadeDispensacao('2 cx')).toBeNull();
  });
});

describe('dispensação: escolha do item', () => {
  it('compara o nome inteiro sem acento nem caixa', () => {
    expect(normalizarNomeItem('  Dipirona   SÓDICA ')).toBe('dipirona sodica');
    const escolha = escolherItemDispensacao('dipirona sódica', 1, [
      { id: 'a', nome: 'Dipirona Sódica', quantidade: 5 },
      { id: 'b', nome: 'Dipirona sódica gotas', quantidade: 5 },
    ], HOJE);
    expect(escolha).toMatchObject({ tipo: 'ok', item: { id: 'a' } });
  });

  it('marca ambiguidade quando só há correspondências parciais de produtos diferentes', () => {
    const escolha = escolherItemDispensacao('Dipirona', 1, [
      { id: 'a', nome: 'Dipirona 500mg', quantidade: 5 },
      { id: 'b', nome: 'Dipirona gotas', quantidade: 5 },
    ], HOJE);
    expect(escolha.tipo).toBe('ambiguo');
  });

  it('usa FEFO entre lotes válidos e ignora o vencido', () => {
    const escolha = escolherItemDispensacao('Soro', 2, [
      { id: 'vencido', nome: 'Soro', quantidade: 9, validade: '2026-10-31' },
      { id: 'depois', nome: 'Soro', quantidade: 9, validade: '2027-05-01' },
      { id: 'antes', nome: 'Soro', quantidade: 9, validade: '2026-12-01' },
    ], HOJE);
    expect(escolha).toMatchObject({ tipo: 'ok', item: { id: 'antes' } });
  });

  it('avisa quando só existe lote vencido', () => {
    expect(escolherItemDispensacao('Soro', 1, [{ id: 'v', nome: 'Soro', quantidade: 9, validade: '2026-01-01' }], HOJE).tipo).toBe('vencido');
  });

  it('informa saldo insuficiente', () => {
    expect(escolherItemDispensacao('Soro', 10, [{ id: 's', nome: 'Soro', quantidade: 3 }], HOJE)).toMatchObject({ tipo: 'insuficiente', disponivel: 3 });
  });

  it('ordena sem validade por último e escapa curingas do ilike', () => {
    expect(ordenarFefo([{ nome: 'b', validade: null }, { nome: 'a', validade: '2027-01-01' }]).map(i => i.nome)).toEqual(['a', 'b']);
    expect(termoBuscaAmpla('100%_puro x')).toBe('100\\%\\_puro');
  });
});
