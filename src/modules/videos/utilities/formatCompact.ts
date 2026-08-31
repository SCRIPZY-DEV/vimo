// Saldos de Evolink pueden ser grandes: 1.2M / 3.4k / 120 / 7.5.
export function formatCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`
  if (value >= 100) return Math.round(value).toString()

  return value.toFixed(1)
}
