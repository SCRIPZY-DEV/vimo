import type {
  CharacterStyleId,
  CharacterSummary,
} from '@pipeline/types/characters.ts'

// Campos del formulario (la identidad va en `description`)
export interface CharacterFormValue {
  name: string
  age: string
  role: string
  description: string
}

// Preview en pantalla: el persistido es una ruta local y el nuevo un data URI;
// solo los nuevos viajan al guardar
export interface PreviewView {
  styleId: CharacterStyleId
  url: string
  isNew: boolean
}

// Opción de un selector cuyo texto sale del catálogo i18n
export interface LabelledOption<TId extends string> {
  id: TId
  labelKey: string
}

// El personaje en edición, o null al crear uno nuevo
export type CharacterDraft = CharacterSummary | null

// Contexto de «Mi estilo» cuando el modal se abre desde Create: con gema y
// guion, la ficha la diseña el estilo del usuario (design-style-character).
export interface CharacterStyleContext {
  gem: string
  script: string
  promptModel?: string
}
