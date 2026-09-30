import { PromptRow } from '@/modules/videos/components/PromptRow'
import { PromptsProgressCard } from '@/modules/videos/components/PromptsProgressCard'
import { hasPrompt } from '@/modules/videos/utilities/hasPrompt'
import type { SceneSummary } from '@pipeline/types/scenes.ts'
import type {
  ImagesRecoveryView,
  PromptsWrittenView,
} from '@/modules/videos/types/create'

// Los prompts, mientras se escriben y cuando están (port de GrillaPrompts,
// origen v1.0.0). La lista aparece COMPLETA desde el primer segundo: las
// escenas ya existen (se cortaron en la fase anterior) con su texto y sus
// tiempos; lo único que falta es el prompt.

interface PromptsGridProps {
  scenes: SceneSummary[]
  // Avance del stream del redactor (carril verbatim); null si el carril no
  // lo informa y solo cuentan los prompts persistidos.
  written: PromptsWrittenView | null
  // Pasada de reescritura desde la fase de imágenes: la cabecera lo dice.
  recovery?: ImagesRecoveryView | null
  complete?: boolean
}

export function PromptsGrid({
  scenes,
  written,
  recovery = null,
  complete = false,
}: PromptsGridProps) {
  if (scenes.length === 0) return null

  // La barra cuenta escritura recibida; las filas solo muestran prompts ya
  // persistidos. La fase sigue cargando al 100% mientras termina la validación.
  const done = scenes.filter(hasPrompt).length
  const drafted = Math.min(scenes.length, Math.max(done, written?.ready ?? 0))

  return (
    <div className="space-y-3">
      <PromptsProgressCard
        done={done}
        total={scenes.length}
        drafted={drafted}
        complete={complete}
        rewrite={
          recovery
            ? { pass: recovery.pass, maxPasses: recovery.maxPasses }
            : null
        }
      />

      {scenes.map((scene) => (
        <PromptRow key={scene.id} scene={scene} />
      ))}
    </div>
  )
}
