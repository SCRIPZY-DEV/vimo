import type { FalImageModelId, ImageProviderId } from './image-provider.ts'

// Dominio de personajes: biblioteca de identidades reutilizables entre videos.
// La "identidad" es una descripción NEUTRA DE ESTILO (quién es el personaje,
// nunca cómo se dibuja): el estilo visual se aplica aparte al generar cada
// imagen, así la misma identidad sirve para los 5 estilos.

export type CharacterStyleId =
  'normal' | 'pov_stickman' | 'cartoon' | 'fantasia' | 'terror'

export interface CharacterPreview {
  styleId: CharacterStyleId
  // Ruta absoluta para que la UI la muestre vía convertFileSrc(); se deriva
  // al listar, NO se persiste en metadata.json.
  imagePath: string
}

// Tipo del Character que es consumida en la UI y en los endpoints de la API.
export interface CharacterSummary {
  id: string
  name: string
  description: string
  age?: string
  role?: string
  createdAt: string
  previews: CharacterPreview[]
}

// ─── Contratos de los subcomandos de personajes ───
export interface NewCharacterPreview {
  styleId: CharacterStyleId
  // data:image/<png|jpeg|webp>;base64,… tal como lo devuelve el preview.
  dataUri: string
}

export interface CharactersListResult {
  entries: CharacterSummary[]
}

export interface CharacterCreatePayload {
  name: string
  description: string
  age?: string
  role?: string
  previews?: NewCharacterPreview[]
}

export interface CharacterCreateResult {
  entry: CharacterSummary
}

export interface CharacterUpdatePayload {
  id: string
  name?: string
  description?: string
  age?: string
  role?: string
  previews?: NewCharacterPreview[]
}

export interface CharacterUpdateResult {
  entry: CharacterSummary
}

export interface CharacterDeletePayload {
  id: string
}

export interface SuggestCharacterProfilePayload {
  name?: string
  age?: string
  role?: string
  description?: string
  // Guion del video: lo mandará Create (paso 6) para inferir un personaje.
  script?: string
  // Personajes ya diseñados en este video: el experto devuelve uno distinto.
  avoid?: { name?: string; description?: string }[]
}

export interface SuggestCharacterProfileResult {
  // Identidad en inglés, neutra de estilo.
  prompt: string
  // Campos que el LLM usó o infirió, para autocompletar el formulario.
  name?: string
  age?: string
  role?: string
}

export interface GenerateCharacterPreviewPayload {
  identityPrompt: string
  styleId: CharacterStyleId
  provider: ImageProviderId
  // Solo se respeta con provider 'fal'.
  falModel?: FalImageModelId
}

export interface GenerateCharacterPreviewResult {
  dataUri: string
  // Prompt ensamblado (identidad + encuadre + estilo), para diagnóstico.
  finalPrompt: string
}

// Detalle que viaja en los eventos `progress` de generate-character-preview.
export interface CharacterPreviewProgressDetail {
  status?: string
  elapsedSeconds?: number
}
