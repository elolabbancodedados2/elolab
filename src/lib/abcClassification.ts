export type AbcClass = 'A' | 'B' | 'C';

/** Classifies an item using the cumulative value before the item is included. */
export function classifyAbcItem(cumulativeBefore: number, total: number): AbcClass {
  if (!Number.isFinite(cumulativeBefore) || !Number.isFinite(total) || total <= 0) return 'C';
  const percentageBefore = (cumulativeBefore / total) * 100;
  if (percentageBefore < 80) return 'A';
  if (percentageBefore < 95) return 'B';
  return 'C';
}
