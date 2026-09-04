import { PromptModelSelector } from '@/modules/videos/components/PromptModelSelector'
import { usePromptModels } from '@/modules/videos/hooks/usePromptModels'
import { styleCharacterModeOf } from '@/modules/videos/utilities/formPayload'
import { storePromptModel } from '@/modules/videos/utilities/promptModelStorage'
import type { CreateFormValue } from '@/modules/videos/types/create'

interface PromptModelSectionProps {
  value: CreateFormValue
  disabled: boolean
  onChange: (patch: Partial<CreateFormValue>) => void
}

// Contenedor del selector de modelo (solo bajo «Mi estilo»): trae el
// catálogo, resuelve el default y recuerda la elección entre videos.
export function PromptModelSection({
  value,
  disabled,
  onChange,
}: PromptModelSectionProps) {
  const { models, defaultId, batchSize } = usePromptModels()

  if (!defaultId) return null

  // Un id recordado que ya no se ofrece (retirado/oculto) cae al default en
  // pantalla; el pipeline haría lo mismo con aviso.
  const offered = models.some((model) => model.id === value.promptModel)
  const chosen = offered && value.promptModel ? value.promptModel : defaultId
  const gemChars = value.customStyle?.systemPrompt.trim().length ?? 0
  // La fase del personaje solo corre cuando la gema lo diseña (genérico); con
  // personaje propio o sin personaje no hay llamada que cobrar.
  const withCharacterPhase = styleCharacterModeOf(value) === 'generic'

  return (
    <PromptModelSelector
      models={models}
      value={chosen}
      gemChars={gemChars}
      batchSize={batchSize}
      withCharacterPhase={withCharacterPhase}
      disabled={disabled}
      onChange={(promptModel) => {
        storePromptModel(promptModel)
        onChange({ promptModel })
      }}
    />
  )
}
