import { useTranslation } from 'react-i18next'
import { Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/modules/common/ui/button'
import { Input } from '@/modules/common/ui/input'
import { Label } from '@/modules/common/ui/label'
import { cn } from '@/modules/common/utilities/cn'
import { CharacterSection } from '@/modules/videos/components/CharacterSection'
import { CustomStyleGallery } from '@/modules/videos/components/CustomStyleGallery'
import { ImageProviderSection } from '@/modules/videos/components/ImageProviderSection'
import { NarrationSection } from '@/modules/videos/components/NarrationSection'
import { PromptModelSection } from '@/modules/videos/components/PromptModelSection'
import { SoundtrackSection } from '@/modules/videos/components/SoundtrackSection'
import { StyleGallery } from '@/modules/videos/components/StyleGallery'
import { StyleSourceTabs } from '@/modules/videos/components/StyleSourceTabs'
import { VideoFormatSection } from '@/modules/videos/components/VideoFormatSection'
import { VoiceSection } from '@/modules/videos/components/VoiceSection'
import { MAX_SCENE_COUNT, PROJECT_NAME_LIMIT } from '@/modules/videos/constants'
import { clampSceneCount } from '@/modules/videos/utilities/clampSceneCount'
import { formBlockers } from '@/modules/videos/utilities/formPayload'
import type { CreateFormValue } from '@/modules/videos/types/create'

interface CreateFormProps {
  value: CreateFormValue
  disabled: boolean
  submitting: boolean
  onChange: (patch: Partial<CreateFormValue>) => void
  onPickAudio: () => void
  onSubmit: () => void
}

export function CreateForm({
  value,
  disabled,
  submitting,
  onChange,
  onPickAudio,
  onSubmit,
}: CreateFormProps) {
  const { t } = useTranslation()

  const blockers = formBlockers(value)
  const canSubmit = blockers.length === 0 && !submitting

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
            onChange={(styleId) => onChange({ styleId })}
          />
        ) : (
          <>
            <CustomStyleGallery
              selected={value.customStyle}
              disabled={disabled}
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

      {blockers.length > 0 && (
        <ul className="space-y-1 rounded-xl border-2 border-saffron/60 bg-saffron/5 px-4 py-3">
          {blockers.map((blocker) => (
            <li
              key={blocker}
              className="font-body text-xs text-muted-foreground"
            >
              {t(blocker)}
            </li>
          ))}
        </ul>
      )}

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

      <Button
        size="lg"
        disabled={!canSubmit}
        onClick={onSubmit}
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
