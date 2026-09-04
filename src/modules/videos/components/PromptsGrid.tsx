import { PromptRow } from '@/modules/videos/components/PromptRow'
import { PromptsProgressCard } from '@/modules/videos/components/PromptsProgressCard'
import { hasPrompt } from '@/modules/videos/utilities/hasPrompt'
import type { SceneSummary } from '@pipeline/types/scenes.ts'
import type { PromptsWrittenView } from '@/modules/videos/types/create'

// Los prompts, mientras se escriben y cuando están (port de GrillaPrompts,
// origen v1.0.0). La lista aparece COMPLETA desde el primer segundo: las
// escenas ya existen (se cortaron en la fase anterior) con su texto y sus
// tiempos; lo único que falta es el prompt.

interface PromptsGridProps {
  scenes: SceneSummary[]
  // Avance del stream del redactor (carril verbatim); null si el carril no
  // lo informa y solo cuentan los prompts persistidos.
  written: PromptsWrittenView | null
}

export function PromptsGrid({ scenes, written }: PromptsGridProps) {
  if (scenes.length === 0) return null

  // max(persistidos, escritos) — origen: la barra avanza mientras el modelo
  // escribe y nunca retrocede cuando la persistencia alcanza al stream.
  const done = Math.max(scenes.filter(hasPrompt).length, written?.ready ?? 0)

  return (
    <div className="space-y-3">
      <PromptsProgressCard done={done} total={scenes.length} />

      {scenes.map((scene) => (
        <PromptRow key={scene.id} scene={scene} />
      ))}
    </div>
  )
}
