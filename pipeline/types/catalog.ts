import type {
  ColorFilterId,
  CustomStyleSummary,
  GemSections,
  StyleCharacter,
  StyleCharacterMode,
  StyleSample,
} from './styles.ts'

// Catálogo de estilos de Vimo (Entrega 2 del catálogo sobre el carril de Mi
// estilo, spec §8; Entrega 3, el catálogo remoto administrado, ADR-0049).
// Browser-safe: la UI consume estos contratos solo con `import type`.

/** Idiomas de la app: los mismos de public/locales. */
export type CatalogLocale = 'es' | 'en' | 'pt'
export type LocalizedText = Record<CatalogLocale, string>

/**
 * Una gema del catálogo de Vimo. Es una gema de plantilla con nombre en tres
 * idiomas, las etiquetas que el admin le pone, los modos de personaje que
 * permite y el modo con el que salieron sus muestras. Sin descripción: la
 * tarjeta y «Ver» no la muestran (pedido del dueño, 2026-10-05). Las muestras
 * de las gemas empaquetadas viven en la app (`/style-references/<id>_<n>.jpg`,
 * n = 1..sampleCount); las de una gema sincronizada del catálogo remoto, en
 * `_catalog/<id>/s<revision>/` (`samples`).
 */
export interface CatalogGem {
  /** Uno de los 5 ids heredados o un id que cumple STYLE_ID_PATTERN. */
  id: string
  name: LocalizedText
  /**
   * Etiquetas que ve la persona en la tarjeta (0 a CATALOG_TAG_LIMIT): qué es
   * el estilo y qué hace. «Dinamismo» va si y solo si la gema tiene sección
   * `dynamism`; «Personaje fijo», si y solo si tiene `character`. Viajan
   * dentro de la gema, como el nombre, y en el catálogo remoto salen de la
   * fila del estilo.
   */
  tags: LocalizedText[]
  sections: GemSections
  templateVersion: number
  /** Nunca vacío. El primero no es el defecto: lo es `sampleMode`. */
  allowedModes: StyleCharacterMode[]
  /** Con qué modo se generaron las muestras; también el modo por defecto en «Ver». */
  sampleMode: StyleCharacterMode
  colorFilter: ColorFilterId
  /** Cuántas muestras empaquetadas trae la app para este estilo (0 a 4). */
  sampleCount: number
  /**
   * Muestras sincronizadas en `_catalog/` (tanda de revisión ≥ 1). Ausente =
   * las empaquetadas de la app.
   */
  samples?: StyleSample[]
}

export interface CatalogListPayload {
  /**
   * Con `true`, el catálogo sincronizado en `_catalog/` si existe y es válido.
   * Ausente o `false`: las gemas empaquetadas, aunque haya un catálogo
   * sincronizado (el interruptor `remoteCatalog` apagado no cambia nada).
   */
  remote?: boolean
}

export interface CatalogListResult {
  entries: CatalogGem[]
  /** Versión del catálogo sincronizado; null = el empaquetado. */
  version: string | null
}

// ─── Catálogo remoto administrado (Entrega 3, ADR-0049) ───

/** Modo con el que salen las muestras de un estilo del catálogo (P17). */
export type CatalogSampleMode = Extract<StyleCharacterMode, 'generic' | 'none'>

/** La tanda de muestras: revisión 0 = las que trae la app; ≥ 1 = `<id>/s<revision>/`. */
export interface CatalogSamplesBatch {
  revision: number
  /** Cuántos `sample-<n>.jpg` tiene la tanda (0 a 4). */
  count: number
}

/**
 * Lo que guarda la fila `catalog_styles` en `draft` y en `published`: una
 * `CatalogGem` sin el `id` ni las rutas, con su tanda de muestras. Lo valida
 * el servidor con zod y lo repite el sidecar al sincronizar.
 */
export interface CatalogStyleContent {
  name: LocalizedText
  tags: LocalizedText[]
  sections: GemSections
  templateVersion: number
  /** Nunca vacío; incluye `sampleMode`. */
  allowedModes: StyleCharacterMode[]
  sampleMode: CatalogSampleMode
  colorFilter: ColorFilterId
  samples: CatalogSamplesBatch
}

/** Lo que ve cualquier usuario de un estilo del catálogo remoto: solo lo publicado. */
export interface PublishedCatalogStyle {
  id: string
  position: number
  /** `published_version` de la fila. */
  version: number
  content: CatalogStyleContent
}

/** Lo que responde `GET /api/catalogo` cuando hay cambios. */
export interface CatalogManifest {
  version: string
  /** URL pública del bucket: `<samplesBaseUrl>/<id>/s<revision>/sample-<n>.jpg`. */
  samplesBaseUrl: string
  styles: PublishedCatalogStyle[]
}

export interface CatalogSyncPayload {
  manifest: CatalogManifest
  /** Único origen (`https://host`) del que el sidecar acepta bajar muestras. */
  samplesOrigin: string
}

export interface CatalogSyncResult extends CatalogListResult {
  /** Archivos bajados en esta corrida. */
  downloaded: number
}

/** Una subida firmada que pidió la app: el archivo del borrador y su URL. */
export interface CatalogSampleUploadTarget {
  /** `sample-<n>.jpg`, n = 1..4, en `_catalog/_drafts/<id>/`. */
  file: string
  url: string
}

export interface CatalogDraftSamplesUploadPayload {
  catalogStyleId: string
  uploads: CatalogSampleUploadTarget[]
  /** Único origen (`https://host`) al que el sidecar acepta subir. */
  uploadOrigin: string
}

export interface CatalogDraftSamplesUploadResult {
  uploaded: number
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
