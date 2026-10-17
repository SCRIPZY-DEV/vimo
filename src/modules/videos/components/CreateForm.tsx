import { estimatedSceneCount } from '@/modules/videos/utilities/estimateCreateCost'
import { useFlowCapacity } from '@/modules/common/hooks/useFlowCapacity'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Sparkles, UserRound } from 'lucide-react'
import { usePromptModelBlocks } from '@/modules/common/hooks/usePromptModelBlocks'
import { usePromptModels } from '@/modules/common/hooks/usePromptModels'
import { apiKeysApi } from '@/modules/api-keys/api'
import { useRequiredApiKeys } from '@/modules/api-keys/hooks/useRequiredApiKeys'
import { useAvatars } from '@/modules/avatars/hooks/useAvatars'
import { Alert } from '@/modules/common/components/Alert'
import { InsufficientCreditsAlert } from '@/modules/common/components/InsufficientCreditsAlert'
import { Button } from '@/modules/common/ui/button'
import { Input } from '@/modules/common/ui/input'
import { Label } from '@/modules/common/ui/label'
import { cn } from '@/modules/common/utilities/cn'
import { CatalogStyleGallery } from '@/modules/videos/components/CatalogStyleGallery'
import { CharacterSection } from '@/modules/videos/components/CharacterSection'
import { CreateAnimationSection } from '@/modules/videos/components/CreateAnimationSection'
import { CreateAvatarSection } from '@/modules/videos/components/CreateAvatarSection'
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
  CREATE_AVATAR_LIBRARY_STALE_TIME_MS,
  CREATE_BLOCKERS_ID,
  MAX_SCENE_COUNT,
  PROJECT_NAME_LIMIT,
} from '@/modules/videos/constants'
import { allPromptModelsBlocked } from '@/modules/common/utilities/allPromptModelsBlocked'
import { useCreateCostCheck } from '@/modules/videos/hooks/useCreateCostCheck'
import { useDemoFormChoices } from '@/modules/videos/hooks/useDemoFormChoices'
import { useStyleCharacter } from '@/modules/videos/hooks/useStyleCharacter'
import { characterPatchForStyle } from '@/modules/videos/utilities/characterPatchForStyle'
import { clampSceneCount } from '@/modules/videos/utilities/clampSceneCount'
import {
  displayLaneOf,
  tabSwitchSelection,
} from '@/modules/videos/utilities/formLane'
import { formBlockers } from '@/modules/videos/utilities/formPayload'
import { selectedAvatarUnavailable } from '@/modules/videos/utilities/selectableAvatar'
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
  apiReady: boolean
  apiIssueKey?: string
  disabled: boolean
  submitting: boolean
  // Manifest del pack cuando se entra por la puerta de la demo (ADR-0027).
  demo: DemoManifest | null
  // El catálogo nuevo está activo: interruptor `newCatalog` encendido, o la
  // demo (spec demo v4 §2). Lo resuelve Create, que también lo usa para
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
  apiReady,
  apiIssueKey,
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

  const flowCapacity = useFlowCapacity(
    estimatedSceneCount(value, value.script.trim()) || 1,
    value.imageProvider === 'flow' && !demo,
    { executionPlan: value.executionPlan },
  )
  const [attempts, setAttempts] = useState(0)
  const blockersRef = useRef<HTMLDivElement>(null)
  // La copia de «Pasar a mi estilo» que Mi estilo abre en su modal apenas se
  // muestra; null = ninguna.
  const [arrivingStyleId, setArrivingStyleId] = useState<string | null>(null)
  // En la demo: lo que ofrece cada galería y cada formato, el avatar del pack
  // y los pedidos de estilo, pestaña, formato y switch con sus reglas. Fuera
  // de la demo, null.
  const demoChoices = useDemoFormChoices({ demo, value, onChange })
  // Con qué carril se arma la pantalla: la pestaña Catálogo nueva se ve como
  // Mi estilo aun antes de elegir tarjeta (plan E2, P4).
  const lane = displayLaneOf(value, newCatalog)
  // Con todos los modelos de prompts bloqueados (ADR-0028) solo quedan los
  // estilos de Vimo: la pestaña «Mi estilo» se apaga y el envío se frena. Los
  // del catálogo nuevo también escriben con un modelo: ahí el envío se frena
  // igual (formBlockers). En la demo no se escribe nada y no aplica.
  const { models } = usePromptModels()
  const { blockedIds } = usePromptModelBlocks()
  const promptModelsBlocked = allPromptModelsBlocked(models, blockedIds)
  // El fijo de la gema resuelto contra la biblioteca: la misma derivación que
  // dibuja el chip rojo en la sección de personaje nombra el paso faltante.
  const { fixedMissing } = useStyleCharacter(value)

  // Pre-check de saldo (ADR-0031): con saldo leído e insuficiente el envío
  // se frena como cualquier otro paso faltante; ilegible solo avisa. La demo
  // no gasta: sin estimación no consulta ni frena por saldo, y el aviso de
  // saldo nunca aparece (spec demo v4 §2).
  const costCheck = useCreateCostCheck({ form: value, demo: demo !== null })
  // La elección del avatar contra la biblioteca de hoy y el formato del video
  // (spec §6.2 y §16): un avatar borrado, un look que perdió Avatar III o uno
  // de otra orientación (la persona cambió el formato) frena el envío acá, en
  // vez de fallar al crear el proyecto. Sin clave de HeyGen `value` ya llega
  // con el avatar apagado (withAvatarKey), así que no se lee nada. La demo no
  // lee la biblioteca de la persona: su avatar es el de la historia.
  const avatarLibrary = useAvatars({
    enabled: value.useAvatar && demo === null,
    staleTime: CREATE_AVATAR_LIBRARY_STALE_TIME_MS,
  })
  const missingSteps = formBlockers(value, {
    promptModelsBlocked,
    fixedCharacterMissing: fixedMissing,
    animationKeyMissing: !configuredProviders.has('kie'),
    avatarUnavailable: selectedAvatarUnavailable(value, avatarLibrary),
    newCatalog,
    demo: demo !== null,
  })
  if (!apiReady) missingSteps.push(apiIssueKey ?? 'extension.apiKeysRequired')
  if (value.imageProvider === 'flow' && !demo && !flowCapacity.ready)
    missingSteps.push('extension.notReady')
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
    if (demoChoices) {
      // Con el switch de avatar encendido la pestaña no cambia: no hay
      // selección que guardar.
      if (demoChoices.requestStyle(styleSource, selection.customStyle))
        onOtherTabStyleChange(selection.otherTabStyle)
      return
    }

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
    if (demoChoices) {
      demoChoices.requestStyle(value.styleSource, customStyle)
      return
    }

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
        audioFileLabel={demoChoices?.audioFileLabel}
        onChange={onChange}
        onPickAudio={onPickAudio}
      />

      <div className="space-y-3">
        <StyleSourceTabs
          value={value.styleSource}
          disabled={disabled}
          catalogHintKey={
            demoChoices ? 'create.styleSource.catalogHintDemo' : undefined
          }
          catalogHintCount={demoChoices?.catalogIds.length}
          customDisabled={promptModelsBlocked && demo === null}
          onChange={changeStyleSource}
        />
        {/* Con el switch de avatar encendido, la demo no elige otro estilo:
            vuelve a la gema del avatar y lo dice acá, entre las pestañas y la
            galería, hasta el próximo cambio (pedido del dueño, 2026-10-14). */}
        {demoChoices?.avatarStyleNotice && (
          <Alert
            tone="info"
            icon={UserRound}
            title={t('create.avatar.demoUseThisStyle')}
          />
        )}
        {lane === 'legacy-catalog' && (
          <StyleGallery
            value={value.styleId}
            disabled={disabled}
            onChange={(styleId) => onChange({ styleId })}
          />
        )}
        {/* El catálogo nuevo (Entrega 2): sus estilos salen por el carril de
            Mi estilo, con el modelo de prompts debajo como allá. En la demo,
            cada galería ofrece solo lo que tiene historia en el formato. */}
        {lane === 'catalog-gem' && (
          <CatalogStyleGallery
            selected={value.customStyle}
            disabled={disabled}
            script={value.script}
            promptModel={value.promptModel}
            visibleIds={demoChoices?.catalogIds}
            demo={demo !== null}
            storyCharacterOf={demoChoices?.catalogCharacterOf}
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
            visibleIds={demoChoices?.gemStyleIds}
            demo={demo !== null}
            onSelect={selectStyle}
            onArrivalOpened={() => setArrivingStyleId(null)}
          />
        )}
        {lane !== 'legacy-catalog' && (
          <PromptModelSection
            value={value}
            disabled={disabled}
            demo={demo !== null}
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
        comingSoon={demoChoices?.comingSoonFormats}
        onChange={demoChoices?.changeFormat ?? onChange}
      />

      <ImageProviderSection
        value={value}

        disabled={disabled}
        demo={demo !== null}
        onChange={onChange}
      />

      <CreateAnimationSection
        value={value}
        disabled={disabled}
        demoAnimated={demoChoices?.animationAvailable}
        onChange={onChange}
      />

      <CreateAvatarSection
        value={value}
        disabled={disabled}
        demoAvatar={demoChoices?.avatar}
        onToggle={demoChoices?.toggleAvatar}
        onChange={onChange}
      />

      {value.narrationMode === 'tts' && (
        <VoiceSection value={value} disabled={disabled} onChange={onChange} />
      )}

      {/* En la demo, solo con la historia de un estilo con personaje fijo:
          su chip, sin cambiar el modo (spec demo v4 §2). */}
      {(demoChoices === null || demoChoices.showsCharacterSection) && (
        <CharacterSection
          value={value}
          lane={lane}
          disabled={disabled}
          demo={demo !== null}
          onChange={onChange}
        />
      )}

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

      {/* La demo no ofrece subtítulos: su video sale hecho del pack (spec
          demo v4 §2). */}
      {demo === null && (
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
      )}

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
