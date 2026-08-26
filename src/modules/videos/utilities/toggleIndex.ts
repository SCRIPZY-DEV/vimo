// Agrega o quita un índice de una lista, devolviéndola ordenada.
export function toggleIndex(indexes: number[], index: number): number[] {
  const next = new Set(indexes)
  if (next.has(index)) next.delete(index)
  else next.add(index)
  return [...next].sort((first, second) => first - second)
}
