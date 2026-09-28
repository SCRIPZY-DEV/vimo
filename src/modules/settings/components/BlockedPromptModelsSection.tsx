import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Ban, LockOpen } from 'lucide-react'
import { usePromptModelBlocks } from '@/modules/common/hooks/usePromptModelBlocks'
import { usePromptModels } from '@/modules/common/hooks/usePromptModels'
import { Button } from '@/modules/common/ui/button'
import { blockedMinutesLeft } from '@/modules/common/utilities/blockedMinutesLeft'
import { unblockPromptModel } from '@/modules/common/utilities/promptModelBlocks'

// Modelos de prompts bloqueados ahora mismo (ADR-0028), con su motivo y
// cuánto falta, y el desbloqueo manual: en producción no hay devtools y esta
// es la única forma de verlos y de soltarlos antes de la hora.
export function BlockedPromptModelsSection() {
  const { t } = useTranslation()
  const { blocks } = usePromptModelBlocks()
  const { models } = usePromptModels()
  const visibleBlocks = blocks.filter((block) =>
    models.some((model) => model.id === block.modelId),
  )

  const labelOf = (modelId: string) =>
    models.find((model) => model.id === modelId)?.label ?? modelId

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.22 }}
      className="space-y-4 rounded-2xl border-2 border-border bg-card p-6 shadow-card"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-bold text-foreground">
            {t('settings.blockedModelsTitle')}
          </h2>
          <p className="font-body text-sm text-muted-foreground">
            {t('settings.blockedModelsTagline')}
          </p>
        </div>
        {visibleBlocks.length > 1 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              visibleBlocks.forEach((block) =>
                unblockPromptModel(block.modelId),
              )
            }}
            className="shrink-0 rounded-lg font-display"
          >
            <LockOpen className="mr-1.5 h-4 w-4" />
            {t('settings.blockedModelsUnblockAll')}
          </Button>
        )}
      </div>

      {visibleBlocks.length === 0 && (
        <p className="font-body text-sm text-muted-foreground">
          {t('settings.blockedModelsEmpty')}
        </p>
      )}

      {visibleBlocks.length > 0 && (
        <ul className="space-y-2">
          {visibleBlocks.map((block) => (
            <li
              key={block.modelId}
              className="flex items-center gap-3 rounded-xl border-2 border-coral/40 bg-coral/5 px-4 py-3"
            >
              <Ban className="h-5 w-5 shrink-0 text-coral" />
              <div className="min-w-0 flex-1">
                <p className="font-display text-sm font-bold text-foreground">
                  {labelOf(block.modelId)}
                </p>
                <p className="font-body text-xs text-muted-foreground">
                  {t(`settings.blockedModelsReason.${block.reason}`)}
                  {' · '}
                  {t('settings.blockedModelsBackIn', {
                    minutes: blockedMinutesLeft(block.blockedUntil),
                  })}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => unblockPromptModel(block.modelId)}
                className="shrink-0 rounded-lg font-display"
              >
                <LockOpen className="mr-1.5 h-4 w-4" />
                {t('settings.blockedModelsUnblock')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </motion.section>
  )
}
