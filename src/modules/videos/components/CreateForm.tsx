import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/modules/common/ui/button'
import { Input } from '@/modules/common/ui/input'
import { Label } from '@/modules/common/ui/label'
import { cn } from '@/modules/common/utilities/cn'
import { CharacterSection } from '@/modules/videos/components/CharacterSection'
import { CreateBlockersAlert } from '@/modules/videos/components/CreateBlockersAlert'
import { CustomStyleGallery } from '@/modules/videos/components/CustomStyleGallery'
import { ImageProviderSection } from '@/modules/videos/components/ImageProviderSection'
import { NarrationSection } from '@/modules/videos/components/NarrationSection'
import { PromptModelSection } from '@/modules/videos/components/PromptModelSection'
import { SoundtrackSection } from '@/modules/videos/components/SoundtrackSection'
import { StyleGallery } from '@/modules/videos/components/StyleGallery'
import { StyleSourceTabs } from '@/modules/videos/components/StyleSourceTabs'
import { VideoFormatSection } from '@/modules/videos/components/VideoFormatSection'
import { VoiceSection } from '@/modules/videos/components/VoiceSection'
import {
  CREATE_BLOCKERS_ID,
  DEMO_COMING_SOON_FORMATS,
  MAX_SCENE_COUNT,
  PROJECT_NAME_LIMIT,
} from '@/modules/videos/constants'
import { clampSceneCount } from '@/modules/videos/utilities/clampSceneCount'
import { demoStyleIds } from '@/modules/videos/utilities/demoForm'
import { formBlockers } from '@/modules/videos/utilities/formPayload'
import type { CreateFormValue } from '@/modules/videos/types/create'
import type { DemoManifest } from '@pipeline/types/demo.ts'

interface CreateFormProps {
  value: CreateFormValue
  disabled: boolean
  submitting: boolean
  // Manifest del pack cuando se entra por la puerta de la demo (ADR-0027).
  demo: DemoManifest | null
  onChange: (patch: Partial<CreateFormValue>) => void
  onPickAudio: () => void
  onSubmit: () => void
}

export function CreateForm({
  value,
  disabled,
  submitting,
  demo,
  onChange,
  onPickAudio,
  onSubmit,
}: CreateFormProps) {
  const { t } = useTranslation()

  const [attempts, setAttempts] = useState(0)
  const blockersRef = useRef<HTMLDivElement>(null)

  const blockers = formBlockers(value)

  // El botón no se deshabilita en silencio: al pulsarlo con pasos faltantes
  // lleva a la alerta y la sacude, en vez de no hacer nada.
  const handleSubmit = () => {
    if (blockers.length > 0) {
      setAttempts((current) => current + 1)
      blockersRef.current?.scrollIntoView({
        block: 'center',
        behavior: 'smooth',
      })
      return
    }

    onSubmit()
  }

  return (
    <div
      className={cn('space-y-6', disabled && 'pointer-events-none opacity-60')}
    >
      <div className="space-y-1.5">
        <Label htmlFor="create-name" className="font-display">
          {t('create.form.nameLabel')}
        </Label>
        <Input
          id="create-name"
          value={value.name}
          maxLength={PROJECT_NAME_LIMIT}
          disabled={disabled}
          onChange={(event) => onChange({ name: event.target.value })}
          placeholder={t('create.form.namePlaceholder')}
        />
        <p className="font-body text-xs text-muted-foreground">
          {t('create.form.nameHint')}
        </p>
      </div>

      <NarrationSection
        value={value}
        disabled={disabled}
        onChange={onChange}
        onPickAudio={onPickAudio}
      />

      <div className="space-y-3">
        <StyleSourceTabs
          value={value.styleSource}
          disabled={disabled}
          onChange={(styleSource) => onChange({ styleSource })}
        />
        {value.styleSource === 'catalog' ? (
          <StyleGallery
            value={value.styleId}
            disabled={disabled}
            visibleIds={demo ? demoStyleIds(demo) : undefined}
            onChange={(styleId) => onChange({ styleId })}
          />
        ) : (
          <>
            <CustomStyleGallery
              selected={value.customStyle}
              disabled={disabled}
              script={value.script}
              promptModel={value.promptModel}
              onSelect={(customStyle) => {
                // Si la gema escribe (o no lleva) el protagonista, los
                // personajes elegidos antes ya no aplican (ADR-0020).
                const mode = customStyle?.character?.mode ?? 'generic'
                onChange(
                  mode === 'own'
                    ? { customStyle }
                    : { customStyle, characters: [] },
                )
              }}
            />
            <PromptModelSection
              value={value}
              disabled={disabled}
              onChange={onChange}
            />
          </>
        )}
      </div>

      {/* Solo con estilo de catálogo: los videos de Mi estilo cortan por
          duración de escena y el pipeline ignora esta cantidad. */}
      {value.styleSource === 'catalog' && (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="create-scene-count" className="font-display">
              {t('create.scenes.countLabel')}
            </Label>
            <Input
              id="create-scene-count"
              type="number"
              min={0}
              max={MAX_SCENE_COUNT}
              value={value.sceneCount}
              disabled={disabled}
              onChange={(event) =>
                onChange({ sceneCount: clampSceneCount(event.target.value, 0) })
              }
            />
            <p className="font-body text-xs text-muted-foreground">
              {t('create.scenes.countHint')}
            </p>
          </div>
        </div>
      )}

      <VideoFormatSection
        value={value}
        disabled={disabled}
        comingSoon={demo ? DEMO_COMING_SOON_FORMATS : undefined}
        onChange={onChange}
      />

      <ImageProviderSection
        value={value}
        disabled={disabled}
        onChange={onChange}
      />

      {value.narrationMode === 'tts' && (
        <VoiceSection value={value} disabled={disabled} onChange={onChange} />
      )}

      <CharacterSection value={value} disabled={disabled} onChange={onChange} />

      <SoundtrackSection
        value={value}
        disabled={disabled}
        onChange={onChange}
      />

      <CreateBlockersAlert
        ref={blockersRef}
        id={CREATE_BLOCKERS_ID}
        blockers={blockers}
        attempts={attempts}
      />

      <label className="flex cursor-pointer items-start gap-3 rounded-xl border-2 border-border bg-card p-3 transition-colors hover:border-saffron/40">
        <input
          type="checkbox"
          checked={value.subtitles}
          disabled={disabled}
          onChange={(event) => onChange({ subtitles: event.target.checked })}
          className="mt-1 h-4 w-4 accent-saffron"
        />
        <span className="min-w-0 flex-1">
          <span className="block font-display text-sm font-semibold text-foreground">
            {t('create.subtitles.label')}
          </span>
          <span className="mt-0.5 block font-body text-xs text-muted-foreground">
            {t('create.subtitles.hint')}
          </span>
        </span>
      </label>

      <label className="flex cursor-pointer items-start gap-3 rounded-xl border-2 border-border bg-card p-3 transition-colors hover:border-saffron/40">
        <input
          type="checkbox"
          checked={value.autoRender}
          disabled={disabled}
          onChange={(event) => onChange({ autoRender: event.target.checked })}
          className="mt-1 h-4 w-4 accent-saffron"
        />
        <span className="min-w-0 flex-1">
          <span className="block font-display text-sm font-semibold text-foreground">
            {t('create.autoRender.label')}
          </span>
          <span className="mt-0.5 block font-body text-xs text-muted-foreground">
            {t('create.autoRender.hint')}
          </span>
        </span>
      </label>

      {/* Solo con estilo de catálogo: con Mi estilo la pausa (elegir cuánto
          dura cada escena) la gobierna la preferencia «No preguntarme al
          generar» de Ajustes, y acá no hay nada que marcar. */}
      {value.styleSource === 'catalog' && (
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border-2 border-border bg-card p-3 transition-colors hover:border-saffron/40">
          <input
            type="checkbox"
            checked={value.confirmScenes}
            disabled={disabled}
            onChange={(event) =>
              onChange({ confirmScenes: event.target.checked })
            }
            className="mt-1 h-4 w-4 accent-saffron"
          />
          <span className="min-w-0 flex-1">
            <span className="block font-display text-sm font-semibold text-foreground">
              {t('create.scenes.confirmLabel')}
            </span>
            <span className="mt-0.5 block font-body text-xs text-muted-foreground">
              {t('create.scenes.confirmHint')}
            </span>
          </span>
        </label>
      )}

      <Button
        size="lg"
        disabled={submitting}
        onClick={handleSubmit}
        aria-invalid={blockers.length > 0}
        aria-describedby={blockers.length > 0 ? CREATE_BLOCKERS_ID : undefined}
        className="w-full rounded-xl bg-saffron font-display font-bold text-charcoal hover:bg-saffron/90"
      >
        {submitting ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="mr-2 h-4 w-4" />
        )}
        {t('create.form.submit')}
      </Button>
    </div>
  )
}
