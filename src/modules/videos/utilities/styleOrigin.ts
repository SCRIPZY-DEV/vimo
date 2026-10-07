import type { GemOrigin } from '@pipeline/types/styles.ts'

// La línea de origen de la tarjeta de un estilo: la clave de traducción y sus
// datos. Módulo puro (lo corre el guard check-app-style-clone con Node pelado).
export interface StyleOriginLabel {
  key: string
  values?: Record<string, string>
}

// Una copia de «Pasar a mi estilo» dice de qué estilo de Vimo salió; un estilo
// clonado con IA (ADR-0050), si vino de un video o de imágenes. Un estilo que
// escribió el usuario no dice nada.
export function styleOriginLabelOf(
  origin: GemOrigin | undefined,
): StyleOriginLabel | null {
  if (!origin) return null
  if (origin.kind === 'catalog')
    return { key: 'create.customStyles.basedOn', values: { name: origin.name } }
  if (origin.source === 'youtube')
    return { key: 'create.customStyles.clonedFromVideo' }

  return { key: 'create.customStyles.clonedFromImages' }
}
