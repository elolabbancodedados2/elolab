export interface BaixaEstoqueSolicitada {
  itemId: string;
  itemName: string;
  quantity: number;
}

export function agruparBaixasEstoque(
  solicitadas: BaixaEstoqueSolicitada[],
): BaixaEstoqueSolicitada[] {
  const porItem = new Map<string, BaixaEstoqueSolicitada>();

  for (const solicitada of solicitadas) {
    if (!solicitada.itemId || !Number.isSafeInteger(solicitada.quantity) || solicitada.quantity <= 0) continue;
    if (solicitada.quantity > 2_147_483_647) {
      throw new RangeError(`A quantidade total de ${solicitada.itemName} ultrapassa o limite do sistema.`);
    }
    const existente = porItem.get(solicitada.itemId);
    if (!existente) {
      porItem.set(solicitada.itemId, { ...solicitada });
      continue;
    }

    const total = existente.quantity + solicitada.quantity;
    if (!Number.isSafeInteger(total) || total > 2_147_483_647) {
      throw new RangeError(`A quantidade total de ${solicitada.itemName} ultrapassa o limite do sistema.`);
    }
    existente.quantity = total;
  }

  return [...porItem.values()];
}
