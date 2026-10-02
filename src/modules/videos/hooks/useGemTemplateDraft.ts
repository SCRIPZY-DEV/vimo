import { useState } from 'react'
import {
  GEM_TEMPLATE_VERSION,
  sameGemSections,
} from '@/modules/videos/utilities/gemTemplate'
import type { CustomStyleDraft } from '@/modules/videos/types/styles'
import type { GemSectionKey, GemSections } from '@pipeline/types/styles.ts'

// Borrador de una gema de plantilla en el modal (ADR-0048): el paso «Pegá tu
// gema» y las secciones que se editan. Las secciones llegan guardadas: «Preparar
// con IA» guarda la gema pegada y la adapta en segundo plano, y el modal vuelve
// a sembrarse con lo que guardó la adaptación. Editar una sección queda en
// memoria hasta que el modal la guarda al cerrar (o antes de generar muestras)
// con style-save, sin volver a pasar por el agente.
export function useGemTemplateDraft(initial: CustomStyleDraft) {
  // Una gema sin secciones (un estilo nuevo) arranca pegando su texto.
  const [pasting, setPasting] = useState(initial.sections === undefined)
  const [pasteText, setPasteText] = useState('')
  const [sections, setSections] = useState(
    initial.sections ?? { visualStyle: '' },
  )
  // Lo último guardado: contra esto se mide si «Pegar gema nueva» haría perder
  // algo que todavía no se guardó.
  const [savedSections, setSavedSections] = useState(
    initial.sections ?? { visualStyle: '' },
  )
  // Viaja SIEMPRE con las secciones en style-save: la de las secciones
  // guardadas.
  const templateVersion = initial.templateVersion ?? GEM_TEMPLATE_VERSION
  const [colorFilter, setColorFilter] = useState(initial.colorFilter ?? 'none')

  return {
    pasting,
    pasteText,
    sections,
    templateVersion,
    colorFilter,
    // De qué texto salieron las secciones: el respaldo guardado (spec §4.4).
    // null = la gema no tiene respaldo.
    originalText: initial.sourcePrompt ?? null,
    unsavedSections: !sameGemSections(sections, savedSections),
    setPasteText,
    setColorFilter,
    editSection(key: GemSectionKey, value: string) {
      setSections((current) => ({ ...current, [key]: value }))
    },
    startPasting() {
      setPasteText('')
      setPasting(true)
    },
    stopPasting() {
      setPasting(false)
    },
    markSaved(saved: GemSections) {
      setSavedSections(saved)
    },
  }
}
