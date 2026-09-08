import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { PromptModelSelector } from '@/modules/common/components/PromptModelSelector'
import { usePromptModels } from '@/modules/common/hooks/usePromptModels'
import { Switch } from '@/modules/common/ui/switch'
import { resolvePromptModel } from '@/modules/common/utilities/resolvePromptModel'
import { cn } from '@/modules/common/utilities/cn'
import { usePromptModelPreference } from '@/modules/settings/hooks/usePromptModelPreference'
import { PROMPT_MODEL_COMPACT_DEFAULT } from '../constants'

// Preferencia «modelo con el que escribo»: el que redacta los prompts de
// imagen en los videos de estilo propio. Siembra el selector de Crear, que lo
// puede pisar por video.
//
// El simulador va sin gema (gemChars 0, sin fase de personaje): acá no hay
// video, así que compara modelos entre sí sobre una base común.

export function PromptModelSection() {
  const { t } = useTranslation()
  const { models, defaultId, batchSize } = usePromptModels()
  const {
    isNative,
    promptModelDefaults,
    isLoading,
    savePromptModelDefaults,
    saving,
  } = usePromptModelPreference()

  const modelId = promptModelDefaults?.modelId ?? null
  const compact = promptModelDefaults?.compact ?? PROMPT_MODEL_COMPACT_DEFAULT
  const disabled = !isNative || isLoading || saving
  const chosen = resolvePromptModel(modelId, models, defaultId)

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="space-y-4 rounded-2xl border-2 border-border bg-card p-6 shadow-card"
    >
      <div>
        <h2 className="font-display text-lg font-bold text-foreground">
          {t('settings.promptModelTitle')}
        </h2>
        <p className="font-body text-sm text-muted-foreground">
          {t('settings.promptModelTagline')}
        </p>
      </div>

      {!isNative && (
        <p className="font-body text-sm text-saffron">
          {t('settings.soloEscritorio')}
        </p>
      )}

      {chosen && (
        <div
          className={cn(
            'space-y-3',
            !isNative && 'pointer-events-none opacity-60',
          )}
        >
          <PromptModelSelector
            models={models}
            value={chosen}
            gemChars={0}
            batchSize={batchSize}
            withCharacterPhase={false}
            disabled={disabled}
            onChange={(picked) =>
              savePromptModelDefaults({ modelId: picked, compact })
            }
          />
          <p className="font-body text-xs text-muted-foreground">
            {t('settings.promptModelEstimateNote')}
          </p>

          <label className="flex items-center gap-4 rounded-xl border-2 border-border p-4">
            <span className="min-w-0 flex-1">
              <span className="block font-display text-sm font-bold text-foreground">
                {t('settings.promptModelCompactLabel')}
              </span>
              <span className="mt-0.5 block font-body text-xs text-muted-foreground">
                {t('settings.promptModelCompactHint')}
              </span>
            </span>
            <Switch
              checked={compact}
              disabled={disabled}
              onCheckedChange={(next) =>
                savePromptModelDefaults({ modelId, compact: next })
              }
            />
          </label>
        </div>
      )}
    </motion.section>
  )
}
