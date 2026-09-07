import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Pencil, RefreshCw } from 'lucide-react'
import DoodleSadFace from '@/modules/common/doodles/DoodleSadFace'
import { Button } from '@/modules/common/ui/button'
import type { StageId } from '@pipeline/runner/stage-id.ts'

interface GenerationErrorCardProps {
  message: string
  // La fase en la que se cayó el job (la primera sin completar): cambia la
  // etiqueta del reintento y habilita el rescate por el editor.
  failedStage: StageId | null
  // Reintentar desde el último checkpoint: lo ya hecho se conserva.
  onRetry: () => void
  // Rescate del origen (v1.32.0): con los prompts persistidos, el fallo de
  // imágenes no bloquea — se sigue en el editor y se regenera desde ahí.
  onContinueInEditor?: () => void
}

// Bloque de error dentro de la pantalla de progreso (port del origen): las
// fases siguen a la vista y acá va el doodle triste con las dos salidas.
export function GenerationErrorCard({
  message,
  failedStage,
  onRetry,
  onContinueInEditor,
}: GenerationErrorCardProps) {
  const { t } = useTranslation()
  const renderFailed = failedStage === 'render'

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4 rounded-xl border-2 border-destructive/40 bg-destructive/5 p-6"
    >
      <div className="flex items-start gap-4">
        <DoodleSadFace size={48} delay={100} />
        <div className="flex-1">
          <p className="font-display text-base font-bold text-destructive">
            {t('create.progress.error.title')}
          </p>
          <p className="mt-1 font-body text-sm text-destructive/80">
            {message}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Button
          size="lg"
          onClick={onRetry}
          className="btn-squish w-full rounded-xl bg-saffron font-display font-bold text-charcoal hover:bg-saffron/90"
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          {renderFailed
            ? t('create.progress.error.retryRender')
            : t('create.progress.error.retryFromCheckpoint')}
        </Button>
        <p className="text-center font-body text-xs text-muted-foreground">
          {renderFailed
            ? t('create.progress.error.retryRenderHint')
            : t('create.progress.error.retryHint')}
        </p>
      </div>

      {onContinueInEditor && (
        <div className="space-y-2">
          <Button
            size="lg"
            variant="outline"
            onClick={onContinueInEditor}
            className="w-full rounded-xl font-display font-bold"
          >
            <Pencil className="mr-2 h-4 w-4" />
            {t('create.errors.continueInEditor')}
          </Button>
          <p className="text-center font-body text-xs text-muted-foreground">
            {t('create.progress.error.continueHint')}
          </p>
        </div>
      )}
    </motion.div>
  )
}
