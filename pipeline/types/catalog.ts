import type {
  ColorFilterId,
  CustomStyleSummary,
  GemSections,
  StyleCharacter,
  StyleCharacterMode,
} from './styles.ts'

// Catálogo de estilos de Vimo (Entrega 2 del catálogo sobre el carril de Mi
// estilo, spec §8). Browser-safe: la UI consume estos contratos solo con
// `import type`.

/** Idiomas de la app: los mismos de public/locales. */
export type CatalogLocale = 'es' | 'en' | 'pt'
export type LocalizedText = Record<CatalogLocale, string>

/**
 * Una gema del catálogo de Vimo. Es una gema de plantilla con nombre y
 * descripción en tres idiomas, las etiquetas que el admin le pone, los modos
 * de personaje que permite y el modo con el que salieron sus muestras. Las
 * muestras viven en la app (`/style-references/<id>_<n>.jpg`,
 * n = 1..sampleCount) hasta la Entrega 3.
 */
export interface CatalogGem {
  /** Uno de los 5 ids heredados o un id que cumple STYLE_ID_PATTERN. */
  id: string
  name: LocalizedText
  description: LocalizedText
  /**
   * Etiquetas que ve la persona en la tarjeta (0 a CATALOG_TAG_LIMIT): qué es
   * el estilo y qué hace. «Dinamismo» va si y solo si la gema tiene sección
   * `dynamism`; «Personaje fijo», si y solo si tiene `character`. Viajan
   * dentro de la gema, como el nombre, para que en la Entrega 3 salgan de la
   * fila del catálogo remoto.
   */
  tags: LocalizedText[]
  sections: GemSections
  templateVersion: number
  /** Nunca vacío. El primero no es el defecto: lo es `sampleMode`. */
  allowedModes: StyleCharacterMode[]
  /** Con qué modo se generaron las muestras; también el modo por defecto en «Ver». */
  sampleMode: StyleCharacterMode
  colorFilter: ColorFilterId
  /** Cuántas muestras trae la app para este estilo (0 a 4). */
  sampleCount: number
}

export interface CatalogListResult {
  entries: CatalogGem[]
}

/** Una muestra que la app le manda al sidecar para la copia: JPEG en base64. */
export interface CatalogSampleUpload {
  /** `sample-<n>.jpg`, n = 1..4. */
  file: string
  base64: string
}

export interface CatalogCopyToCustomPayload {
  catalogStyleId: string
  /** El nombre que vio la persona (en su idioma): nombre de la copia y de `origin`. */
  name: string
  /** El modo elegido en «Ver» (con `defaultCharacterId` si es «Mi personaje»). */
  character: StyleCharacter
  samples: CatalogSampleUpload[]
}

export interface CatalogCopyToCustomResult {
  entry: CustomStyleSummary
}
