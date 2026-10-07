import { useState } from 'react'
import { GEM_TEMPLATE_VERSION } from '@/modules/videos/utilities/gemTemplate'
import type { CustomStyleDraft } from '@/modules/videos/types/styles'
import type { GemSectionKey } from '@pipeline/types/styles.ts'

// Borrador de una gema de plantilla en el modal (ADR-0048): el paso «Pegá tu
// gema» de un estilo nuevo y las secciones que se editan. Las secciones llegan
// guardadas: «Preparar con IA» guarda la gema pegada y la adapta en segundo
// plano, y el modal vuelve a sembrarse con lo que guardó la adaptación. Editar
// una sección queda en memoria hasta que el modal la guarda al cerrar (o antes
// de generar muestras) con style-save, sin volver a pasar por el agente. Una
// gema con secciones no se reemplaza por otra pegada: se edita sección por
// sección, y otra gema es otro estilo.
export function useGemTemplateDraft(initial: CustomStyleDraft) {
  // Una gema sin secciones (un estilo nuevo) arranca pegando su texto, y así
  // sigue hasta que el modal pasa a la gema guardada.
  const [pasting] = useState(initial.sections === undefined)
  const [pasteText, setPasteText] = useState('')
  const [sections, setSections] = useState(
    initial.sections ?? { visualStyle: '' },
  )
  // Viaja SIEMPRE con las secciones en style-save: la de las secciones
  // guardadas.
  const templateVersion = initial.templateVersion ?? GEM_TEMPLATE_VERSION
  // El preset de color (spec §5.5) se conserva como está guardado: el modal
  // no lo ofrece (se quitó el 2026-10-02), pero una gema que lo trae no lo
  // pierde al guardar.
  const colorFilter = initial.colorFilter ?? 'none'

  return {
    pasting,
    pasteText,
    sections,
    templateVersion,
    colorFilter,
    // De qué texto salieron las secciones: el respaldo guardado (spec §4.4).
    // null = la gema no tiene respaldo.
    originalText: initial.sourcePrompt ?? null,
    setPasteText,
    editSection(key: GemSectionKey, value: string) {
      setSections((current) => ({ ...current, [key]: value }))
    },
  }
}
