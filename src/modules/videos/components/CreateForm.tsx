import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Sparkles } from 'lucide-react'
import { usePromptModelBlocks } from '@/modules/common/hooks/usePromptModelBlocks'
import { usePromptModels } from '@/modules/common/hooks/usePromptModels'
import { apiKeysApi } from '@/modules/api-keys/api'
import { useRequiredApiKeys } from '@/modules/api-keys/hooks/useRequiredApiKeys'
import { InsufficientCreditsAlert } from '@/modules/common/components/InsufficientCreditsAlert'
import { Button } from '@/modules/common/ui/button'
import { Input } from '@/modules/common/ui/input'
import { Label } from '@/modules/common/ui/label'
import { cn } from '@/modules/common/utilities/cn'
import { CatalogStyleGallery } from '@/modules/videos/components/CatalogStyleGallery'
import { CharacterSection } from '@/modules/videos/components/CharacterSection'
import { CreateAnimationSection } from '@/modules/videos/components/CreateAnimationSection'
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
  MAX_SCENE_COUNT,
  PROJECT_NAME_LIMIT,
} from '@/modules/videos/constants'
import { allPromptModelsBlocked } from '@/modules/common/utilities/allPromptModelsBlocked'
import { useCreateCostCheck } from '@/modules/videos/hooks/useCreateCostCheck'
import { useStyleCharacter } from '@/modules/videos/hooks/useStyleCharacter'
import { characterPatchForStyle } from '@/modules/videos/utilities/characterPatchForStyle'
import { clampSceneCount } from '@/modules/videos/utilities/clampSceneCount'
import {
  demoAudioFileLabel,
  demoComingSoonFormats,
  demoStyleIds,
} from '@/modules/videos/utilities/demoForm'
import {
  displayLaneOf,
  tabSwitchSelection,
} from '@/modules/videos/utilities/formLane'
import { formBlockers } from '@/modules/videos/utilities/formPayload'
import { selectedCustomStyleFrom } from '@/modules/videos/utilities/selectedCustomStyle'
import type { CreateFormValue } from '@/modules/videos/types/create'
import type {
  SelectedCustomStyle,
  StyleSource,
} from '@/modules/videos/types/styles'
import type { DemoManifest } from '@pipeline/types/demo.ts'
import type { CustomStyleSummary } from '@pipeline/types/styles.ts'

interface CreateFormProps {
  value: CreateFormValue
  disabled: boolean
  submitting: boolean
  // Manifest del pack cuando se entra por la puerta de la demo (ADR-0027).
  demo: DemoManifest | null
  // El catálogo nuevo está activo: interruptor `newCatalog` encendido y fuera
  // de la demo (plan E2, P5). Lo resuelve Create, que también lo usa para
  // decidir qué estilo elegido vale.
  newCatalog: boolean
  // Con el catálogo nuevo, una selección por pestaña: la de la pestaña que no
  // está a la vista. La guarda Create, que sobrevive a la pantalla de progreso
  // (este formulario se desmonta al generar).
  otherTabStyle: SelectedCustomStyle | null
  onOtherTabStyleChange: (style: SelectedCustomStyle | null) => void
  onChange: (patch: Partial<CreateFormValue>) => void
  onPickAudio: () => void
  onSubmit: () => void
}

export function CreateForm({
  value,
  disabled,
  submitting,
  demo,
  newCatalog,
  otherTabStyle,
  onOtherTabStyleChange,
  onChange,
  onPickAudio,
  onSubmit,
}: CreateFormProps) {
  const { t } = useTranslation()
  const { configuredProviders } = useRequiredApiKeys()

  const [attempts, setAttempts] = useState(0)
  const blockersRef = useRef<HTMLDivElement>(null)
  // La copia de «Pasar a mi estilo» que Mi estilo abre en su modal apenas se
  // muestra; null = ninguna.
  const [arrivingStyleId, setArrivingStyleId] = useState<string | null>(null)
  // Con qué carril se arma la pantalla: la pestaña Catálogo nueva se ve como
  // Mi estilo aun antes de elegir tarjeta (plan E2, P4).
  const lane = displayLaneOf(value, newCatalog)
  // Con todos los modelos de prompts bloqueados (ADR-0028) solo quedan los
  // estilos de Vimo: la pestaña «Mi estilo» se apaga y el envío se frena. Los
  // del catálogo nuevo también escriben con un modelo: ahí el envío se frena
  // igual (formBlockers).
  const { models } = usePromptModels()
  const { blockedIds } = usePromptModelBlocks()
  const promptModelsBlocked = allPromptModelsBlocked(models, blockedIds)
  // El fijo de la gema resuelto contra la biblioteca: la misma derivación que
  // dibuja el chip rojo en la sección de personaje nombra el paso faltante.
  const { fixedMissing } = useStyleCharacter(value)

  // Pre-check de saldo (ADR-0031): con saldo leído e insuficiente el envío
  // se frena como cualquier otro paso faltante; ilegible solo avisa.
  const costCheck = useCreateCostCheck({ form: value })
  const missingSteps = formBlockers(value, {
    promptModelsBlocked,
    fixedCharacterMissing: fixedMissing,
    animationKeyMissing: !configuredProviders.has('kie'),
    newCatalog,
  })
  const blockers = costCheck.result.blocking
    ? [...missingSteps, 'create.validation.insufficientCredits']
    : missingSteps

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

  // Cambiar de fuente también retira o devuelve los personajes según lo que
  // decida el estilo que queda activo (ADR-0020). Sin el catálogo nuevo la
  // selección de Mi estilo sigue guardada en el formulario como siempre (el
  // catálogo viejo elige por `styleId`); con él, cada pestaña recupera la suya
  // y nunca una de la otra (tabSwitchSelection).
  const changeStyleSource = (styleSource: StyleSource) => {
    if (!newCatalog || styleSource === value.styleSource) {
      onChange({
        styleSource,
        ...characterPatchForStyle(value, {
          styleSource,
          customStyle: value.customStyle,
        }),
      })
      return
    }

    const selection = tabSwitchSelection(
      value.customStyle,
      otherTabStyle,
      styleSource,
    )
    onOtherTabStyleChange(selection.otherTabStyle)
    onChange({
      styleSource,
      customStyle: selection.customStyle,
      ...characterPatchForStyle(value, {
        styleSource,
        customStyle: selection.customStyle,
      }),
    })
  }

  // Elegir un estilo (de cualquier galería): si escribe (o no lleva) el
  // protagonista, los personajes elegidos se RETIRAN (no se pierden) y vuelven
  // solos con un estilo que los acepte (ADR-0020, v1.31.2).
  const selectStyle = (customStyle: SelectedCustomStyle | null) => {
    onChange({
      customStyle,
      ...characterPatchForStyle(value, {
        styleSource: value.styleSource,
        customStyle,
      }),
    })
  }

  // «Pasar a mi estilo» terminó: el formulario pasa a Mi estilo con el modal
  // de la copia abierto, sin un paso de por medio. La copia queda EN USO, como
  // una gema recién creada, y lo elegido en el catálogo queda guardado para
  // cuando se vuelva.
  const goToCopiedStyle = (copy: CustomStyleSummary) => {
    const customStyle = selectedCustomStyleFrom(copy)
    setArrivingStyleId(copy.id)
    onOtherTabStyleChange(
      tabSwitchSelection(value.customStyle, otherTabStyle, 'custom')
        .otherTabStyle,
    )
    onChange({
      styleSource: 'custom',
      customStyle,
      ...characterPatchForStyle(value, { styleSource: 'custom', customStyle }),
    })
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
        audioLocked={demo !== null}
        audioFileLabel={demo ? demoAudioFileLabel(demo, value) : undefined}
        onChange={onChange}
        onPickAudio={onPickAudio}
      />

      <div className="space-y-3">
        <StyleSourceTabs
          value={value.styleSource}
          disabled={disabled}
          catalogHintKey={
            demo ? 'create.styleSource.catalogHintDemo' : undefined
          }
          customDisabled={promptModelsBlocked}
          onChange={changeStyleSource}
        />
        {lane === 'legacy-catalog' && (
          <StyleGallery
            value={value.styleId}
            disabled={disabled}
            visibleIds={demo ? demoStyleIds(demo) : undefined}
            onChange={(styleId) => onChange({ styleId })}
          />
        )}
        {/* El catálogo nuevo (Entrega 2): sus estilos salen por el carril de
            Mi estilo, con el modelo de prompts debajo como allá. */}
        {lane === 'catalog-gem' && (
          <CatalogStyleGallery
            selected={value.customStyle}
            disabled={disabled}
            script={value.script}
            promptModel={value.promptModel}
            onSelect={selectStyle}
            onCopied={goToCopiedStyle}
          />
        )}
        {lane === 'custom' && (
          <CustomStyleGallery
            selected={value.customStyle}
            disabled={disabled}
            script={value.script}
            promptModel={value.promptModel}
            arrivingStyleId={arrivingStyleId}
            onSelect={selectStyle}
            onArrivalOpened={() => setArrivingStyleId(null)}
          />
        )}
        {lane !== 'legacy-catalog' && (
          <PromptModelSection
            value={value}
            disabled={disabled}
            onChange={onChange}
          />
        )}
      </div>

      {/* Solo con el catálogo viejo: los videos de Mi estilo y del catálogo
          nuevo cortan por duración de escena y el pipeline ignora esta
          cantidad. */}
      {lane === 'legacy-catalog' && (
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
        comingSoon={demo ? demoComingSoonFormats(demo) : undefined}
        onChange={onChange}
      />

      <ImageProviderSection
        value={value}
        disabled={disabled}
        onChange={onChange}
      />

      <CreateAnimationSection
        value={value}
        disabled={disabled || demo !== null}
        onChange={onChange}
      />

      {value.narrationMode === 'tts' && (
        <VoiceSection value={value} disabled={disabled} onChange={onChange} />
      )}

      <CharacterSection
        value={value}
        lane={lane}
        disabled={disabled}
        onChange={onChange}
      />

      <SoundtrackSection
        value={value}
        disabled={disabled}
        onChange={onChange}
      />

      {costCheck.result.blocking && (
        <InsufficientCreditsAlert
          lines={costCheck.result.lines}
          blocking
          onReload={(providerId) => void apiKeysApi.openBillingPage(providerId)}
          onRefresh={costCheck.refresh}
          refreshing={costCheck.refreshing}
        />
      )}

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

      {/* Solo con el catálogo viejo: con Mi estilo y el catálogo nuevo la
          pausa (elegir cuánto dura cada escena) la gobierna la preferencia «No
          preguntarme al generar» de Ajustes, y acá no hay nada que marcar. */}
      {lane === 'legacy-catalog' && (
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
