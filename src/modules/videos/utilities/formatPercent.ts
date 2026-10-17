// Un porcentaje entero (0–100) en el formato del idioma activo: «37 %» en
// español (con espacio duro), «37%» en inglés y portugués.
export function formatPercent(
  percent: number,
  locale: string | undefined,
): string {
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(percent / 100)
}
