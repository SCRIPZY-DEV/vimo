// Fecha y hora cortas de un ISO en el idioma activo: «26 ago, 14:05».
// Compartido por videos, music y voices.
export function formatDateTime(
  iso: string,
  locale: string | undefined,
): string {
  return new Date(iso).toLocaleString(locale, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
