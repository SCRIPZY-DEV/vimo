import { PromptRow } from '@/modules/videos/components/PromptRow'
import { PromptsProgressCard } from '@/modules/videos/components/PromptsProgressCard'
import { hasPrompt } from '@/modules/videos/utilities/hasPrompt'
import type { SceneSummary } from '@pipeline/types/scenes.ts'

// Los prompts, mientras se escriben y cuando están (port de GrillaPrompts,
// origen v1.0.0). La lista aparece COMPLETA desde el primer segundo: las
// escenas ya existen (se cortaron en la fase anterior) con su texto y sus
// tiempos; lo único que falta es el prompt.

interface PromptsGridProps {
  scenes: SceneSummary[]
}

export function PromptsGrid({ scenes }: PromptsGridProps) {
  if (scenes.length === 0) return null

  const done = scenes.filter(hasPrompt).length

  return (
    <div className="space-y-3">
      <PromptsProgressCard done={done} total={scenes.length} />

      {scenes.map((scene) => (
        <PromptRow key={scene.id} scene={scene} />
      ))}
    </div>
  )
}
