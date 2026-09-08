import { useTranslation } from 'react-i18next'
import { PromptModelCard } from '@/modules/common/components/PromptModelCard'
import { PromptModelSelector } from '@/modules/common/components/PromptModelSelector'
import { usePromptModels } from '@/modules/common/hooks/usePromptModels'
import { resolvePromptModel } from '@/modules/common/utilities/resolvePromptModel'
import { usePromptModelPreference } from '@/modules/settings/hooks/usePromptModelPreference'
import { PROMPT_MODEL_COMPACT_DEFAULT } from '@/modules/settings/constants'
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
  const { t } = useTranslation()
  const { models, defaultId, batchSize } = usePromptModels()
  // Preferencia global de presentación: se lee acá y no viaja por props.
  const { promptModelDefaults } = usePromptModelPreference()

  // Sin catálogo (web, o el sidecar no respondió) no hay nada que elegir.
  const chosen = resolvePromptModel(value.promptModel, models, defaultId)
  if (!chosen) return null

  // Con el modo compacto solo se muestra el modelo en uso: quien ya eligió no
  // necesita las bandas de precio ni el simulador en cada video.
  const compact = promptModelDefaults?.compact ?? PROMPT_MODEL_COMPACT_DEFAULT
  if (compact) {
    const model = models.find((candidate) => candidate.id === chosen)
    if (!model) return null

    return (
      <div className="space-y-2">
        <h3 className="font-display text-sm font-bold text-foreground">
          {t('create.promptModel.title')}
        </h3>
        <PromptModelCard model={model} active />
      </div>
    )
  }

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
