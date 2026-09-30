// Segundos de un hueco del timeline con un decimal, en el idioma activo
// («8,3 s» en español, «8.3 s» en inglés): lo que muestran el panel de
// animación y la tarjeta del clip.
export function formatSlotSeconds(seconds: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
    Math.round(seconds * 10) / 10,
  )
}
