type ItemOrdenavel = {
  prioridade?: string | null;
  posicao: number;
};

const PESO_PRIORIDADE: Record<string, number> = {
  urgente: 0,
  preferencial: 1,
  normal: 2,
};

/** Mantém urgentes e preferenciais à frente; preserva FIFO dentro da prioridade. */
export function ordenarFilaPorPrioridade<T extends ItemOrdenavel>(itens: T[]): T[] {
  return [...itens].sort((a, b) => {
    const prioridadeA = PESO_PRIORIDADE[a.prioridade || 'normal'] ?? PESO_PRIORIDADE.normal;
    const prioridadeB = PESO_PRIORIDADE[b.prioridade || 'normal'] ?? PESO_PRIORIDADE.normal;
    return prioridadeA - prioridadeB || a.posicao - b.posicao;
  });
}
