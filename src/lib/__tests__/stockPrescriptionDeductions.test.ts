import { describe, expect, it } from 'vitest';
import { agruparBaixasEstoque } from '../stockPrescriptionDeductions';

describe('agruparBaixasEstoque', () => {
  it('combina prescrições que correspondem ao mesmo item', () => {
    expect(agruparBaixasEstoque([
      { itemId: 'item-a', itemName: 'Dipirona 500mg', quantity: 2 },
      { itemId: 'item-a', itemName: 'Dipirona 500mg', quantity: 3 },
      { itemId: 'item-b', itemName: 'Soro', quantity: 1 },
    ])).toEqual([
      { itemId: 'item-a', itemName: 'Dipirona 500mg', quantity: 5 },
      { itemId: 'item-b', itemName: 'Soro', quantity: 1 },
    ]);
  });

  it('não retorna entradas sem identificador ou quantidade válida', () => {
    expect(agruparBaixasEstoque([
      { itemId: '', itemName: 'Produto', quantity: 2 },
      { itemId: 'item-a', itemName: 'Produto', quantity: 0 },
      { itemId: 'item-b', itemName: 'Produto', quantity: 1 },
    ])).toEqual([{ itemId: 'item-b', itemName: 'Produto', quantity: 1 }]);
  });

  it('recusa uma soma acima do limite inteiro aceito pelo banco', () => {
    expect(() => agruparBaixasEstoque([
      { itemId: 'item-a', itemName: 'Produto', quantity: 2_147_483_647 },
      { itemId: 'item-a', itemName: 'Produto', quantity: 1 },
    ])).toThrow(RangeError);
    expect(() => agruparBaixasEstoque([
      { itemId: 'item-a', itemName: 'Produto', quantity: 2_147_483_648 },
    ])).toThrow(RangeError);
  });
});
