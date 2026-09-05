import { PromptModelSelector } from '@/modules/common/components/PromptModelSelector'
import { usePromptModels } from '@/modules/common/hooks/usePromptModels'
import { resolvePromptModel } from '@/modules/common/utilities/resolvePromptModel'
import { styleCharacterModeOf } from '@/modules/videos/utilities/formPayload'
import type { CreateFormValue } from '@/modules/videos/types/create'

interface PromptModelSectionProps {
  value: CreateFormValue
  disabled: boolean
  onChange: (patch: Partial<CreateFormValue>) => void
}

// Contenedor del selector de modelo (solo bajo «Mi estilo»): trae el catálogo
// y resuelve el elegido. El cambio vale SOLO para este video; el modelo
// predeterminado se fija en Ajustes.
export function PromptModelSection({
  value,
  disabled,
  onChange,
}: PromptModelSectionProps) {
  const { models, defaultId, batchSize } = usePromptModels()

  // Sin catálogo (web, o el sidecar no respondió) no hay nada que elegir.
  const chosen = resolvePromptModel(value.promptModel, models, defaultId)
  if (!chosen) return null

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
      onChange={(promptModel) => onChange({ promptModel })}
    />
  )
}
