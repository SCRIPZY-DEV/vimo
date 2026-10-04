import type { CharacterSummary } from './characters.ts'
import type { ImageProviderId } from './image-provider.ts'
import type {
  CustomStyleSummary,
  GemSections,
  StyleCharacterMode,
} from './styles.ts'

// Dominio del creador de estilo con IA (ADR-0050): clonar un estilo visual
// desde un video de YouTube o desde imágenes del usuario. Browser-safe: la UI
// consume estos contratos solo con `import type`.
//
// El sidecar junta el material, dibuja las pruebas con las claves del usuario
// y guarda el estilo; el análisis lo hace vimo.click, y con él habla la app.
// Todo lo de una clonación vive en `<projectsRoot>/_style-clones/<sesión>/`
// hasta que se guarda o se descarta.

export type StyleCloneSource =
  { kind: 'youtube'; url: string } | { kind: 'images'; paths: string[] }

// Qué es cada imagen del material. La miniatura sirve para ver el trazo, pero
// su texto y su composición son de portada: nunca es el original de una
// prueba.
export type StyleCloneMaterialKind = 'mosaic' | 'frame' | 'thumbnail' | 'image'

export interface StyleCloneMaterialItem {
  kind: StyleCloneMaterialKind
  file: string
  // Ruta absoluta derivada al devolver (jamás persistida): la UI la muestra
  // con convertFileSrc() y la lee para mandarla al servidor.
  path: string
  mimeType: 'image/jpeg'
  // Solo en un mosaico: su cuadrícula real y el tiempo de sus celdas.
  rows?: number
  columns?: number
  startSeconds?: number
  secondsPerCell?: number
}

export interface StyleClonePreparePayload {
  sessionId: string
  source: StyleCloneSource
}

export interface StyleClonePrepareResult {
  material: StyleCloneMaterialItem[]
  // El título del video ('' con imágenes o si YouTube no lo entregó).
  title: string
  // Posiciones (desde 1) de las imágenes del usuario que no son una imagen
  // válida. Con alguna, el material vuelve vacío: hay que quitarlas.
  rejectedImages: number[]
}

// Qué imagen del material recrea una prueba; los números empiezan en 1 y
// cuentan dentro de cada tipo, en el orden del material.
export type StyleCloneOrigin =
  | { kind: 'mosaic'; mosaic: number; row: number; column: number }
  | { kind: 'frame'; number: number }
  | { kind: 'image'; number: number }
  | { kind: 'new' }

export type StyleCloneDrawKind = 'designs' | 'scenes'

export interface StyleCloneDrawItem {
  // Posición de la prueba en su ronda (desde 1).
  index: number
  prompt: string
  origin?: StyleCloneOrigin
}

// Cómo viaja el personaje clonado: como texto tejido en el prompt (identidad
// de prompt) o con la imagen del diseño elegido como referencia (con foto).
export type StyleCloneCharacterTravel = 'text' | 'photo'

export interface StyleCloneCharacter {
  travel: StyleCloneCharacterTravel
  name: string
  description: string
  // El diseño elegido, dentro de la carpeta de la sesión.
  designFile: string
}

export interface StyleCloneDrawPayload {
  sessionId: string
  // Cada ronda escribe archivos nuevos: una imagen rehecha con el mismo
  // nombre seguiría mostrándose desde la caché del webview.
  round: number
  kind: StyleCloneDrawKind
  items: StyleCloneDrawItem[]
  imageProvider: ImageProviderId
  // Solo en las escenas de un estilo que replica al personaje.
  character?: StyleCloneCharacter
}

export interface StyleCloneDrawnItem {
  index: number
  // La prueba dibujada. Ausente = falló (ver `errorCode`).
  file?: string
  path?: string
  // Cache-buster para la UI: reintentar una prueba conserva su nombre.
  mtimeMs?: number
  // El «Original» que recrea, si lo hay.
  originalPath?: string
  errorCode?: string
}

export interface StyleCloneDrawResult {
  items: StyleCloneDrawnItem[]
}

// Detalle de los eventos `progress` de style-clone-draw: una tarjeta por
// prueba, como las muestras de Mi estilo.
export interface StyleCloneDrawProgressDetail {
  index: number
  status: string
  file?: string
  path?: string
  mtimeMs?: number
  originalPath?: string
  errorCode?: string
}

// Cómo queda un estilo clonado que no replicó a un personaje: en «Personaje
// genérico», o en «Sin personaje» si el original no muestra ninguno (un canal
// de diagramas). «Mi personaje» no es una opción acá: es lo que pasa cuando la
// clonación sí replicó uno.
export type StyleCloneCharacterMode = Exclude<StyleCharacterMode, 'own'>

export interface StyleCloneSavePayload {
  sessionId: string
  name: string
  sections: GemSections
  templateVersion: number
  // Las clonaciones aprobadas, en orden: pasan a ser las muestras del estilo.
  samples: string[]
  // El personaje clonado: el estilo lo trae por defecto en «Mi personaje».
  character?: StyleCloneCharacter
  // Solo cuenta sin `character`: el modo que sugirió el servidor para este
  // estilo. Ausente = «Personaje genérico».
  characterMode?: StyleCloneCharacterMode
}

export interface StyleCloneSaveResult {
  entry: CustomStyleSummary
  // El personaje creado en la biblioteca, si la clonación lo replicó.
  character?: CharacterSummary
}

export interface StyleCloneDiscardPayload {
  sessionId: string
}
