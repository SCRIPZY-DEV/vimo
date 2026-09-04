import type { CharacterSummary } from '@pipeline/types/characters.ts'

// Campos del formulario (la identidad va en `description`)
export interface CharacterFormValue {
  name: string
  age: string
  role: string
  description: string
}

// Preview en pantalla: el persistido es una ruta local y el nuevo un data URI;
// solo los nuevos viajan al guardar. `styleId` es un id del catálogo o el de
// galería de un estilo propio
export interface PreviewView {
  styleId: string
  url: string
  isNew: boolean
}

// Opción de un selector cuyo texto sale del catálogo i18n
export interface LabelledOption<TId extends string> {
  id: TId
  labelKey: string
}

// Estilo elegible para el preview, ya con su texto resuelto: los del catálogo
// vienen de i18n y los propios llevan el nombre que les puso el usuario
export interface PreviewStyleOption {
  id: string
  label: string
  custom: boolean
}

// El personaje en edición, o null al crear uno nuevo
export type CharacterDraft = CharacterSummary | null

// Contexto de «Mi estilo» cuando el modal se abre desde Create: con gema y
// guion, la ficha la diseña el estilo del usuario (design-style-character) y
// el preview arranca con ese estilo elegido (`styleId` es el id de galería).
export interface CharacterStyleContext {
  styleId: string
  gem: string
  script: string
  promptModel?: string
}
