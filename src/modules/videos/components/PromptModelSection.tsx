import { useTranslation } from 'react-i18next'
import { Alert } from '@/modules/common/components/Alert'
import { PromptModelCard } from '@/modules/common/components/PromptModelCard'
import { PromptModelSelector } from '@/modules/common/components/PromptModelSelector'
import { usePromptModelBlocks } from '@/modules/common/hooks/usePromptModelBlocks'
import { usePromptModels } from '@/modules/common/hooks/usePromptModels'
import { allPromptModelsBlocked } from '@/modules/common/utilities/allPromptModelsBlocked'
import { blockedMinutesLeft } from '@/modules/common/utilities/blockedMinutesLeft'
import { resolvePromptModel } from '@/modules/common/utilities/resolvePromptModel'
import { usePromptModelPreference } from '@/modules/settings/hooks/usePromptModelPreference'
import { PROMPT_MODEL_COMPACT_DEFAULT } from '@/modules/settings/constants'
import { PromptModelSettingsLink } from '@/modules/videos/components/PromptModelSettingsLink'
import { styleCharacterModeOf } from '@/modules/videos/utilities/formPayload'
import { gemCharCount } from '@/modules/videos/utilities/gemTemplate'
import type { CreateFormValue } from '@/modules/videos/types/create'

interface PromptModelSectionProps {
  value: CreateFormValue
  disabled: boolean
  onChange: (patch: Partial<CreateFormValue>) => void
}

// Contenedor del selector de modelo (bajo «Mi estilo» y el catálogo nuevo, las
// pestañas cuyas gemas escriben los prompts): trae el catálogo y resuelve el
// elegido. El cambio vale SOLO para este video; el modelo
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
  // Bloqueos temporales (ADR-0028): el elegido bloqueado cae a otro, y sin
  // ninguno libre solo queda avisar (el envío lo frena formBlockers).
  const { blockedIds, blockedUntil } = usePromptModelBlocks()

  if (allPromptModelsBlocked(models, blockedIds))
    return <Alert tone="warning">{t('create.promptModel.allBlocked')}</Alert>

  // Sin catálogo (web, o el sidecar no respondió) no hay nada que elegir.
  const chosen = resolvePromptModel(
    value.promptModel,
    models,
    defaultId,
    blockedIds,
  )
  if (!chosen) return null

  // El que la persona quería (o su default) está bloqueado: se dice cuál
  // escribe en su lugar y hasta cuándo.
  const wanted = value.promptModel ?? defaultId
  const wantedModel = models.find((model) => model.id === wanted)
  const wantedBlockedUntil = wantedModel ? blockedUntil(wantedModel.id) : null
  const fallbackNotice =
    wanted && wantedBlockedUntil !== null && wanted !== chosen ? (
      <Alert tone="info">
        {t('create.promptModel.blockedFallback', {
          model: wantedModel?.label ?? wanted,
          minutes: blockedMinutesLeft(wantedBlockedUntil),
          fallback:
            models.find((model) => model.id === chosen)?.label ?? chosen,
        })}
      </Alert>
    ) : null

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
        {fallbackNotice}
        <PromptModelCard model={model} active />
        <PromptModelSettingsLink />
      </div>
    )
  }

  const gemChars = value.customStyle ? gemCharCount(value.customStyle) : 0
  // La fase del personaje solo corre cuando la gema lo diseña (genérico) y no
  // trae su personaje escrito en la sección `character` (ADR-0048); con
  // personaje propio o sin personaje tampoco hay llamada que cobrar.
  const withCharacterPhase =
    styleCharacterModeOf(value) === 'generic' &&
    !value.customStyle?.sections?.character

  return (
    <div className="space-y-2">
      {fallbackNotice}
      <PromptModelSelector
        models={models}
        value={chosen}
        gemChars={gemChars}
        batchSize={batchSize}
        withCharacterPhase={withCharacterPhase}
        disabled={disabled}
        onChange={(promptModel) => onChange({ promptModel })}
      />
      <PromptModelSettingsLink />
    </div>
  )
}
