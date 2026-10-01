import { useState } from 'react'
import {
  cleanGemSections,
  GEM_TEMPLATE_VERSION,
  sameGemSections,
} from '@/modules/videos/utilities/gemTemplate'
import type { GemRebuildResponse } from '@/modules/videos/types/gemRebuild'
import type { CustomStyleDraft } from '@/modules/videos/types/styles'
import type { GemSectionKey, GemSections } from '@pipeline/types/styles.ts'

// Borrador de una gema de plantilla en el modal (ADR-0048): el paso «Pegá tu
// gema», las secciones que se editan y lo que devolvió el agente. Todo queda
// en memoria: el modal lo guarda al cerrar (o antes de generar muestras) con
// style-save, sin volver a pasar por el agente.
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
  // Viaja SIEMPRE con las secciones en style-save: la que devolvió el agente
  // al preparar la gema, o la guardada al editarla.
  const [templateVersion, setTemplateVersion] = useState(
    initial.templateVersion ?? GEM_TEMPLATE_VERSION,
  )
  const [colorFilter, setColorFilter] = useState(initial.colorFilter ?? 'none')
  // El texto que se mandó al agente en esta apertura; null = conservar el
  // guardado.
  const [sourcePrompt, setSourcePrompt] = useState<string | null>(null)
  // Avisos de la última reconstrucción: se muestran, no se guardan.
  const [warnings, setWarnings] = useState<string[]>([])

  return {
    pasting,
    pasteText,
    sections,
    templateVersion,
    colorFilter,
    sourcePrompt,
    warnings,
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
    applyRebuild(response: GemRebuildResponse, sourceText: string) {
      setSections(cleanGemSections(response.sections))
      setTemplateVersion(response.templateVersion)
      setSourcePrompt(sourceText)
      setWarnings(response.warnings)
      setPasteText('')
      setPasting(false)
    },
    markSaved(saved: GemSections) {
      setSavedSections(saved)
    },
  }
}
