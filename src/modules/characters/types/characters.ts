import type { CharacterSummary } from '@pipeline/types/characters.ts'
import type {
  DesignStyleCharacterPayload,
  GemSections,
} from '@pipeline/types/styles.ts'

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

// Con qué se fija la identidad al crear un personaje (ADR-0033): con la foto
// que sube la persona (cara idéntica, referencia en todos los estilos) o sin
// foto (la descripción es la identidad; más barato). Se decide al crear y no
// cambia después.
export type CharacterIdentitySource = 'photo' | 'text'

// Contexto de «Mi estilo» cuando el modal se abre desde Create: con gema y
// guion, la ficha la diseña el estilo del usuario (design-style-character) y
// el preview arranca con ese estilo elegido (`styleId` es el id de galería).
// La gema viaja como texto (`gem`, una vieja) o por secciones (`sections`,
// una de plantilla, ADR-0048), nunca las dos.
export interface CharacterStyleContext {
  styleId: string
  gem?: string
  sections?: GemSections
  script: string
  promptModel?: string
}

// La gema como la pide design-style-character: exactamente una de las dos.
export type StyleDesignGem = Pick<
  DesignStyleCharacterPayload,
  'gem' | 'sections'
>
