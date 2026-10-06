import type { ImageProviderId } from './image-provider.ts'

// Dominio de los estilos visuales propios («Mi estilo»). Browser-safe: la UI
// consume estos contratos solo con `import type`.

export interface StyleSample {
  file: string
  // Ruta absoluta derivada al listar (jamás persistida): la galería puede
  // moverse de carpeta sin romper nada.
  path: string
  // Cache-buster para la UI (la muestra regenerada conserva el nombre).
  mtimeMs: number
}

// Qué declara la gema sobre su protagonista (v1.19.0 del origen):
//  - own      — lo pone el usuario (de la biblioteca). El formulario se lo
//               pide al elegir este estilo, salvo que la gema traiga uno fijo.
//  - generic  — Vimo lo diseña con la Fase 1 de la gema. Es el default de
//               toda gema que no declare nada (las guardadas antes de esto
//               siguen generando igual).
//  - none     — video narrativo sin protagonista fijo.
export type StyleCharacterMode = 'own' | 'generic' | 'none'

export interface StyleCharacter {
  mode: StyleCharacterMode
  // Solo con `own`: id del personaje de la biblioteca que esta gema trae
  // fijado. Es un PUNTERO a propósito: editar el personaje en la biblioteca
  // se propaga a todas las gemas que lo usen; si se borra, el formulario
  // avisa y pide elegir otro — nunca se genera con un personaje fantasma.
  defaultCharacterId?: string
}

/** Secciones de una gema de plantilla (ADR-0048). */
export interface GemSections {
  visualStyle: string
  character?: string
  dynamism?: string
  camera?: string
  rules?: string
  promptStart?: string
  promptEnd?: string
}

export type GemSectionKey = keyof GemSections

/**
 * Orden canónico de las secciones: el mismo en el modal y en el agente; el
 * marco usa el orden del spec §5.1.
 */
export const GEM_SECTION_KEYS = [
  'visualStyle',
  'character',
  'dynamism',
  'camera',
  'rules',
  'promptStart',
  'promptEnd',
] as const satisfies readonly GemSectionKey[]

/** Versión de la estructura de secciones que entienden este sidecar y esta app. */
export const GEM_TEMPLATE_VERSION = 1

export const COLOR_FILTER_IDS = ['none', 'fantasy', 'horror-bw'] as const
export type ColorFilterId = (typeof COLOR_FILTER_IDS)[number]

/** Copia de «Pasar a mi estilo» (Entrega 2 del catálogo). */
export interface CatalogGemOrigin {
  kind: 'catalog'
  catalogStyleId: string
  name: string
}

/** Estilo clonado con IA desde un video o desde imágenes (ADR-0050). */
export interface AiCloneGemOrigin {
  kind: 'ai-clone'
  source: 'youtube' | 'images'
  // Solo con un video: el link del que se clonó.
  videoUrl?: string
}

/** De dónde salió un estilo que no escribió el usuario. */
export type GemOrigin = CatalogGemOrigin | AiCloneGemOrigin

export interface CustomStyleSummary {
  id: string
  name: string
  /** Solo gemas viejas (sin secciones). */
  systemPrompt?: string
  sections?: GemSections
  templateVersion?: number
  sourcePrompt?: string
  colorFilter?: ColorFilterId
  origin?: GemOrigin
  updatedAt?: string
  // Planos permitidos (vacío = sin restricción declarada).
  shots: string[]
  // Ausente = { mode: 'generic' }.
  character?: StyleCharacter
  createdAt: string
  samples: StyleSample[]
}

export interface StylesListResult {
  entries: CustomStyleSummary[]
}

export interface StyleSavePayload {
  id: string
  name: string
  /** Gema vieja. Excluyente con `sections`. */
  systemPrompt?: string
  /** Gema de plantilla. Excluyente con `systemPrompt`. */
  sections?: GemSections
  templateVersion?: number
  /** Ausente = conservar el guardado. */
  sourcePrompt?: string
  /** Ausente = conservar el guardado. */
  colorFilter?: ColorFilterId
  /** Ausente = conservar el guardado. */
  origin?: GemOrigin
  shots?: string[]
  // Ausente = CONSERVAR el bloque guardado (guard v1.19.2 del origen); quien
  // quiera cambiarlo manda el bloque nuevo.
  character?: StyleCharacter
}

export interface StyleSaveResult {
  entry: CustomStyleSummary
}

export interface StyleDeletePayload {
  id: string
}

/**
 * Un borrador del catálogo remoto del que el admin genera muestras (ADR-0049):
 * salen en `_catalog/_drafts/<id>/`, con el marco y el modo `sampleMode`.
 */
export interface CatalogDraftSamplesSource {
  id: string
  name: string
  sections: GemSections
  sampleMode: Extract<StyleCharacterMode, 'generic' | 'none'>
}

export interface GenerateStyleSamplesPayload {
  /** Un estilo propio de Mi estilo. Excluyente con `catalogDraft`. */
  styleId?: string
  /** Un borrador del catálogo (ADR-0049). Excluyente con `styleId`. */
  catalogDraft?: CatalogDraftSamplesSource
  imageProvider: ImageProviderId
  /** Modelo de Ajustes para las gemas de plantilla. Ausente = el de la casa. */
  promptModel?: string
}

export interface GenerateStyleSamplesResult {
  samples: StyleSample[]
}

// ─── design-style-character: la ficha del protagonista, diseñada con la gema
// del usuario como contexto (port de POST /estilos/personaje del origen) ───

export interface DesignStyleCharacterPayload {
  /** Gema vieja como texto. Excluyente con `sections`. */
  gem?: string
  /** Gema de plantilla (ADR-0048): el sidecar la pasa a texto. Excluyente
   *  con `gem`. */
  sections?: GemSections
  script: string
  // Modelo del carril verbatim; ausente = el de la casa.
  promptModel?: string
  // Lo que el usuario ya tipeó: los campos se respetan tal cual y la
  // descripción se MEJORA conservando sus decisiones.
  name?: string
  age?: string
  role?: string
  description?: string
}

// Misma forma que SuggestCharacterProfileResult: la UI los trata igual.
export interface DesignStyleCharacterResult {
  // Identidad física en inglés, NEUTRA de estilo (ya podada).
  prompt: string
  name: string
  age: string
  role: string
}
