import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Sparkles } from 'lucide-react'
import { ErrorMessage } from '@/modules/common/components/ErrorMessage'
import { LabeledProgress } from '@/modules/common/components/LabeledProgress'
import { Button } from '@/modules/common/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/modules/common/ui/dialog'
import { Input } from '@/modules/common/ui/input'
import { Label } from '@/modules/common/ui/label'
import { Textarea } from '@/modules/common/ui/textarea'
import { cn } from '@/modules/common/utilities/cn'
import { videosApi } from '@/modules/videos/api'
import { useStyleSampleGeneration } from '@/modules/videos/hooks/useStyleSampleGeneration'
import {
  CUSTOM_STYLE_NAME_LIMIT,
  CUSTOM_STYLE_PROMPT_LIMIT,
  IMAGE_PROVIDERS,
  RECOMMENDED_SHOTS,
} from '@/modules/videos/constants'
import type { ImageProviderId } from '@pipeline/types/image-provider.ts'
import type { StyleSample, StyleSavePayload } from '@pipeline/types/styles.ts'

interface CustomStyleModalProps {
  styleId: string
  initial: { name: string; systemPrompt: string; shots: string[] }
  // Muestras VIVAS del estilo (derivadas de la query de la galería): se ven
  // al abrir y aparecen solas al terminar de generar, como los previews de
  // personaje.
  samples: StyleSample[]
  saving: boolean
  onSave: (payload: StyleSavePayload) => Promise<void>
  onClose: () => void
}

// Crear/editar un estilo propio. El estilo se guarda ANTES de generar
// muestras (guard del origen: «muestras sin estilo, no»); «Listo» guarda y
// cierra. Regla de modales del origen: nunca dos abiertos a la vez — este es
// el único del flujo.
export function CustomStyleModal({
  styleId,
  initial,
  samples: storedSamples,
  saving,
  onSave,
  onClose,
}: CustomStyleModalProps) {
  const { t } = useTranslation()
  const samples = useStyleSampleGeneration()

  const [name, setName] = useState(initial.name)
  const [systemPrompt, setSystemPrompt] = useState(initial.systemPrompt)
  const [shots, setShots] = useState(initial.shots.join(', '))
  const [provider, setProvider] = useState<ImageProviderId>('evolink')

  const canSave = Boolean(name.trim() && systemPrompt.trim())
  const busy = saving || samples.running

  const payload = (): StyleSavePayload => {
    return {
      id: styleId,
      name: name.trim(),
      systemPrompt: systemPrompt.trim(),
      shots: shots
        .split(',')
        .map((shot) => shot.trim())
        .filter(Boolean),
    }
  }

  const saveAndClose = async () => {
    if (!canSave) return
    await onSave(payload())
    onClose()
  }

  const generateSamples = async () => {
    if (!canSave) return
    await onSave(payload())
    await samples.generate(styleId, provider)
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="flex max-h-[85vh] max-w-xl flex-col overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">
            {initial.name
              ? t('create.customStyles.editTitle')
              : t('create.customStyles.createTitle')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="custom-style-name" className="font-display">
            {t('create.customStyles.nameLabel')}
          </Label>
          <Input
            id="custom-style-name"
            value={name}
            maxLength={CUSTOM_STYLE_NAME_LIMIT}
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('create.customStyles.namePlaceholder')}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="custom-style-prompt" className="font-display">
            {t('create.customStyles.promptLabel')}
          </Label>
          <Textarea
            id="custom-style-prompt"
            value={systemPrompt}
            maxLength={CUSTOM_STYLE_PROMPT_LIMIT}
            disabled={busy}
            onChange={(event) => setSystemPrompt(event.target.value)}
            placeholder={t('create.customStyles.promptPlaceholder')}
            className="min-h-56 resize-y font-mono text-xs"
          />
          <p className="text-right font-mono text-[11px] text-muted-foreground">
            {systemPrompt.length.toLocaleString()} /{' '}
            {CUSTOM_STYLE_PROMPT_LIMIT.toLocaleString()}
          </p>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="custom-style-shots" className="font-display">
              {t('create.customStyles.shotsLabel')}
            </Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => setShots(RECOMMENDED_SHOTS.join(', '))}
              className="rounded-lg font-display text-muted-foreground"
            >
              {t('create.customStyles.recommendedShots')}
            </Button>
          </div>
          <Input
            id="custom-style-shots"
            value={shots}
            disabled={busy}
            onChange={(event) => setShots(event.target.value)}
            placeholder={t('create.customStyles.shotsPlaceholder')}
            className="font-body"
          />
        </div>

        <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-display text-sm font-semibold text-foreground">
              {t('create.customStyles.samplesTitle')}
            </p>
            <div className="inline-flex items-center rounded-full bg-muted p-0.5">
              {IMAGE_PROVIDERS.map((imageProvider) => (
                <button
                  key={imageProvider.id}
                  type="button"
                  disabled={busy}
                  onClick={() => setProvider(imageProvider.id)}
                  className={cn(
                    'rounded-full px-3 py-1 font-display text-xs font-bold transition-colors',
                    provider === imageProvider.id
                      ? 'bg-saffron text-charcoal shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {imageProvider.label}
                </button>
              ))}
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || !canSave}
            onClick={() => void generateSamples()}
            className="rounded-lg font-display"
          >
            {samples.running ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            )}
            {samples.running
              ? samples.phase === 'prompts'
                ? t('create.customStyles.writingPrompts')
                : t('create.customStyles.generatingImages')
              : t('create.customStyles.generateSamples')}
          </Button>

          {samples.phase === 'images' &&
            Object.entries(samples.samplePercents).map(
              ([sampleId, percent]) => (
                <LabeledProgress
                  key={sampleId}
                  label={t('create.customStyles.sampleLabel', { id: sampleId })}
                  percent={percent}
                />
              ),
            )}

          {!samples.running && storedSamples.length > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {storedSamples.map((sample) => (
                <img
                  key={sample.file}
                  src={videosApi.imageSource(sample.path, sample.mtimeMs)}
                  alt=""
                  loading="lazy"
                  className="aspect-video w-full rounded-lg border border-border object-cover"
                />
              ))}
            </div>
          )}

          {samples.errorKey && (
            <ErrorMessage>{t(samples.errorKey)}</ErrorMessage>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={onClose}
            className="rounded-xl font-display"
          >
            {t('create.form.cancel')}
          </Button>
          <Button
            disabled={busy || !canSave}
            onClick={() => void saveAndClose()}
            className="rounded-xl font-display font-bold"
          >
            {t('create.customStyles.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
