import type { CatalogLocale, LocalizedText } from '@pipeline/types/catalog.ts'

// Los textos de una gema del catálogo (nombre y etiquetas) viajan
// dentro de la gema en los tres idiomas de la app (plan E2, P8 y P12): no hay
// claves de i18n para ellos. Módulo puro, sin imports de runtime: lo corre
// scripts/test/check-app-catalog-style.mjs con Node, sin bundler.

const CATALOG_LOCALES: readonly CatalogLocale[] = ['es', 'en', 'pt']
const FALLBACK_LOCALE: CatalogLocale = 'es'

// Una lista cerrada y no `text[language]` a secas: con `toString` o
// `constructor` el objeto devolvería lo que hereda de Object.
function isCatalogLocale(language: string): language is CatalogLocale {
  return CATALOG_LOCALES.some((locale) => locale === language)
}

// El texto en el idioma activo de la app (`i18n.resolvedLanguage`). Fuera de
// los tres idiomas, o si la traducción quedó vacía, sale en español.
export function localizedText(text: LocalizedText, language: string): string {
  if (!isCatalogLocale(language)) return text[FALLBACK_LOCALE]

  const translated = text[language]
  if (!translated.trim()) return text[FALLBACK_LOCALE]
  return translated
}
