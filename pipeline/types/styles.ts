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

export interface CustomStyleSummary {
  id: string
  name: string
  // El estilo ES este system prompt: se manda al LLM que escribe los prompts.
  systemPrompt: string
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
  systemPrompt: string
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

export interface GenerateStyleSamplesPayload {
  styleId: string
  imageProvider: ImageProviderId
}

export interface GenerateStyleSamplesResult {
  samples: StyleSample[]
}

// ─── design-style-character: la ficha del protagonista, diseñada con la gema
// del usuario como contexto (port de POST /estilos/personaje del origen) ───

export interface DesignStyleCharacterPayload {
  gem: string
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
