import type { GemSections, StyleCharacterMode } from '@pipeline/types/styles.ts'

export type GemRebuildOrigin = 'mi-estilo' | 'catalogo' | 'migracion'

export interface GemRebuildRequest {
  text: string
  origin: GemRebuildOrigin
  appVersion: string
  locale: 'es' | 'en' | 'pt'
}

export interface GemRebuildResponse {
  templateVersion: number
  sections: GemSections
  suggestions: {
    allowedModes?: StyleCharacterMode[]
    characterMode?: StyleCharacterMode
  }
  warnings: string[]
}
