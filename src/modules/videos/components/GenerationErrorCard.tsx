import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Mic, Pencil, RefreshCw, Shuffle } from 'lucide-react'
import DoodleSadFace from '@/modules/common/doodles/DoodleSadFace'
import { Button } from '@/modules/common/ui/button'
import { EDITOR_RESCUE_ERROR_CODES } from '@/modules/videos/constants'
import type { StageId } from '@pipeline/runner/stage-id.ts'

interface GenerationErrorCardProps {
  message: string
  // La fase en la que se cayó el job (la primera sin completar): cambia la
  // etiqueta del reintento y habilita el rescate por el editor.
  failedStage: StageId | null
  // Código crudo del fallo: con imágenes faltantes el render NO está listo
  // (el reintento vuelve a pasar por prompts e imágenes), así que valen los
  // textos genéricos del checkpoint y no los de «solo se rehace el armado».
  errorCode: string | null
  // Reintentar desde el último checkpoint: lo ya hecho se conserva.
  onRetry: () => void
  // Rescate del origen (v1.32.0): con los prompts persistidos, el fallo de
  // imágenes no bloquea — se sigue en el editor y se regenera desde ahí.
  onContinueInEditor?: () => void
  // El modelo de prompts falló (carril verbatim, ADR-0028): relanzar el
  // mismo proyecto con otro en vez de insistir con el que se cayó.
  onSwitchPromptModel?: () => void
  // La narración falló (ADR-0053): elegir otro proveedor y otra voz en vez
  // de reintentar con la misma.
  onSwitchVoice?: () => void
}

// Bloque de error dentro de la pantalla de progreso (port del origen): las
// fases siguen a la vista y acá va el doodle triste con las dos salidas.
export function GenerationErrorCard({
  message,
  failedStage,
  errorCode,
  onRetry,
  onContinueInEditor,
  onSwitchPromptModel,
  onSwitchVoice,
}: GenerationErrorCardProps) {
  const { t } = useTranslation()
  const missingImages =
    errorCode !== null && EDITOR_RESCUE_ERROR_CODES.has(errorCode)
  const renderFailed = failedStage === 'render' && !missingImages

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

      {onSwitchPromptModel && (
        <div className="space-y-2">
          <Button
            size="lg"
            variant="outline"
            onClick={onSwitchPromptModel}
            className="w-full rounded-xl font-display font-bold"
          >
            <Shuffle className="mr-2 h-4 w-4" />
            {t('create.progress.error.switchModel')}
          </Button>
          <p className="text-center font-body text-xs text-muted-foreground">
            {t('create.progress.error.switchModelHint')}
          </p>
        </div>
      )}

      {onSwitchVoice && (
        <div className="space-y-2">
          <Button
            size="lg"
            variant="outline"
            onClick={onSwitchVoice}
            className="w-full rounded-xl font-display font-bold"
          >
            <Mic className="mr-2 h-4 w-4" />
            {t('create.progress.error.switchVoice')}
          </Button>
          <p className="text-center font-body text-xs text-muted-foreground">
            {t('create.progress.error.switchVoiceHint')}
          </p>
        </div>
      )}

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
