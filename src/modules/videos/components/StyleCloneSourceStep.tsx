import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ImagePlus, Loader2, Sparkles, TriangleAlert, X } from 'lucide-react'
import { apiKeysApi } from '@/modules/api-keys/api'
import { useRequiredApiKeys } from '@/modules/api-keys/hooks/useRequiredApiKeys'
import { providerLabel } from '@/modules/api-keys/utilities/providerLabel'
import { FLOW_TOOLS_EXECUTION_PLAN } from '@/modules/common/constants'
import { useFlowCapacity } from '@/modules/common/hooks/useFlowCapacity'
import { ImageCreditsBadges } from '@/modules/common/components/ImageCreditsBadges'
import { InsufficientCreditsAlert } from '@/modules/common/components/InsufficientCreditsAlert'
import { SegmentedTabs } from '@/modules/common/components/SegmentedTabs'
import { useImageCredits } from '@/modules/common/hooks/useImageCredits'
import { Button } from '@/modules/common/ui/button'
import { cn } from '@/modules/common/utilities/cn'
import { compareCostLines } from '@/modules/common/utilities/compareCostLines'
import { videosApi } from '@/modules/videos/api'
import {
  CUSTOM_STYLE_FIELD_CLASS,
  IMAGE_PROVIDERS,
  STYLE_CLONE_IMAGE_LIMIT,
} from '@/modules/videos/constants'
import { imageCostEstimate } from '@/modules/videos/utilities/imageCostEstimate'
import { defaultQualityFor } from '@/modules/videos/utilities/imageQuality'
import { preferredImageProvider } from '@/modules/videos/utilities/preferredImageProvider'
import {
  addStyleCloneImages,
  isYouTubeVideoLink,
} from '@/modules/videos/utilities/styleCloneView'
import type {
  StyleCloneSession,
  StyleCloneStartInput,
  StyleCloneTarget,
} from '@/modules/videos/types/styleClone'
import type { ImageProviderId } from '@pipeline/types/image-provider.ts'

interface StyleCloneSourceStepProps {
  // Adónde va el estilo. Con destino catálogo el personaje replicado queda
  // como el personaje fijo de la gema (identidad de prompt): se dice bajo la
  // pregunta.
  target: StyleCloneTarget
  // Una sesión que volvió con imágenes inválidas: el paso arranca con lo que
  // la persona ya había elegido y marca las que hay que quitar.
  rejected: StyleCloneSession | null
  onStart: (input: Omit<StyleCloneStartInput, 'target'>) => void
}

type SourceKind = 'youtube' | 'images'

// Cuántas pruebas se dibujan hasta la primera aprobación: 4 escenas y, si se
// replica al personaje, 3 diseños antes.
const SCENE_TESTS = 4
const DESIGN_TESTS = 3

// El primer paso del creador de estilo con IA (ADR-0050): de dónde se clona
// (el link de un video o hasta 10 imágenes), si se replica al personaje y con
// qué proveedor se dibujan las pruebas. El análisis conserva su servicio;
// las imágenes validan saldo pago o capacidad Multimagen antes de empezar.
export function StyleCloneSourceStep({
  target,
  rejected,
  onStart,
}: StyleCloneSourceStepProps) {
  const { t } = useTranslation()
  const { configuredProviders } = useRequiredApiKeys()

  const [kind, setKind] = useState<SourceKind>(
    rejected?.source.kind ?? 'youtube',
  )
  const [url, setUrl] = useState(
    rejected?.source.kind === 'youtube' ? rejected.source.url : '',
  )
  const [paths, setPaths] = useState<string[]>(
    rejected?.source.kind === 'images' ? rejected.source.paths : [],
  )
  // Las rutas que el sidecar rechazó: se marcan hasta que se quitan.
  const [rejectedPaths, setRejectedPaths] = useState<string[]>(() => {
    if (rejected?.source.kind !== 'images') return []
    const source = rejected.source
    return rejected.rejectedImages.flatMap((position) =>
      source.paths[position - 1] ? [source.paths[position - 1]] : [],
    )
  })
  const [dropped, setDropped] = useState(0)
  // La pregunta del personaje se responde: no hay opción elegida de entrada.
  const [replicate, setReplicate] = useState<boolean | null>(
    rejected ? rejected.replicateCharacter : null,
  )
  const [chosenProvider, setChosenProvider] = useState<ImageProviderId | null>(
    rejected?.imageProvider ?? null,
  )
  const provider = chosenProvider ?? preferredImageProvider(configuredProviders)
  const credits = useImageCredits({ enabled: provider !== 'flow' })
  const [starting, setStarting] = useState(false)
  const submission = useRef(false)
  const flowCapacity = useFlowCapacity(
    replicate ? DESIGN_TESTS : SCENE_TESTS,
    provider === 'flow',
    { executionPlan: FLOW_TOOLS_EXECUTION_PLAN },
  )

  const linkTyped = url.trim().length > 0
  const linkValid = isYouTubeVideoLink(url)
  const hasRejected = paths.some((path) => rejectedPaths.includes(path))
  const sourceReady =
    kind === 'youtube' ? linkValid : paths.length > 0 && !hasRejected

  const tests = SCENE_TESTS + (replicate ? DESIGN_TESTS : 0)
  const estimate = provider
    ? imageCostEstimate(provider, defaultQualityFor(provider), tests)
    : null
  const creditsCheck = compareCostLines(
    estimate ? [estimate] : [],
    { image: credits.credits, voice: null },
    providerLabel,
  )
  const canStart =
    sourceReady &&
    replicate !== null &&
    provider !== null &&
    (provider === 'flow'
      ? flowCapacity.ready
      : configuredProviders.has(provider)) &&
    !starting &&
    !creditsCheck.blocking

  const pickImages = async () => {
    const picked = await videosApi.pickStyleCloneImages()
    if (picked.length === 0) return
    const next = addStyleCloneImages(paths, picked)
    setPaths(next.paths)
    setDropped(next.dropped)
  }

  const removeImage = (path: string) => {
    setPaths((current) => current.filter((item) => item !== path))
    setRejectedPaths((current) => current.filter((item) => item !== path))
    setDropped(0)
  }

  const start = async () => {
    if (
      !canStart ||
      replicate === null ||
      provider === null ||
      submission.current
    )
      return
    submission.current = true
    setStarting(true)
    try {
      if (provider === 'flow' && !(await flowCapacity.verify())) return
      onStart({
        source:
          kind === 'youtube'
            ? { kind: 'youtube', url: url.trim() }
            : { kind: 'images', paths },
        replicateCharacter: replicate,
        imageProvider: provider,
        ...(provider === 'flow'
          ? { executionPlan: { ...FLOW_TOOLS_EXECUTION_PLAN } }
          : {}),
        fallbackName: t('create.styleClone.fallbackName'),
      })
    } finally {
      submission.current = false
      setStarting(false)
    }
  }

  return (
    <div className="space-y-5">
      <SegmentedTabs
        value={kind}
        ariaLabel={t('create.styleClone.sourceAria')}
        options={[
          { id: 'youtube', label: t('create.styleClone.sourceVideo') },
          { id: 'images', label: t('create.styleClone.sourceImages') },
        ]}
        onChange={setKind}
      />

      {kind === 'youtube' ? (
        <div className="space-y-1.5">
          <label
            htmlFor="style-clone-url"
            className="block font-display text-sm font-bold text-foreground"
          >
            {t('create.styleClone.videoLabel')}
          </label>
          <input
            id="style-clone-url"
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder={t('create.styleClone.videoPlaceholder')}
            spellCheck={false}
            autoComplete="off"
            className={cn(CUSTOM_STYLE_FIELD_CLASS, 'font-body text-sm')}
          />
          {linkTyped && !linkValid ? (
            <p role="alert" className="font-body text-xs text-coral">
              {t('create.styleClone.videoInvalid')}
            </p>
          ) : (
            <p className="font-body text-xs text-muted-foreground">
              {t('create.styleClone.videoHint')}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-display text-sm font-bold text-foreground">
                {t('create.styleClone.imagesLabel')}
              </p>
              <span className="inline-flex items-center rounded-full bg-saffron px-2 py-0.5 font-display text-[10px] font-bold text-charcoal">
                {t('create.styleClone.imagesBadge')}
              </span>
            </div>
            <span className="font-body text-xs tabular-nums text-muted-foreground">
              {t('create.styleClone.imagesCount', {
                count: paths.length,
                limit: STYLE_CLONE_IMAGE_LIMIT,
              })}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {paths.map((path, index) => {
              const invalid = rejectedPaths.includes(path)
              return (
                <div
                  key={path}
                  className={cn(
                    'relative aspect-square overflow-hidden rounded-lg border-2 bg-muted',
                    invalid ? 'border-coral' : 'border-border',
                  )}
                >
                  <img
                    src={videosApi.imageSource(path)}
                    alt=""
                    draggable={false}
                    className={cn(
                      'h-full w-full object-cover',
                      invalid && 'opacity-30',
                    )}
                  />
                  {invalid && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-1 text-center">
                      <TriangleAlert className="h-4 w-4 text-coral" />
                      <span className="font-body text-[10px] font-semibold leading-tight text-foreground">
                        {t('create.styleClone.imagesRejected')}
                      </span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => removeImage(path)}
                    aria-label={t('create.styleClone.imagesRemove', {
                      number: index + 1,
                    })}
                    className="absolute right-1 top-1 cursor-pointer rounded-full bg-background/90 p-1 text-foreground shadow transition-colors hover:bg-coral hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-saffron/50"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )
            })}

            {paths.length < STYLE_CLONE_IMAGE_LIMIT && (
              <button
                type="button"
                onClick={() => void pickImages()}
                className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border px-1 text-center text-muted-foreground transition-colors hover:border-saffron/60 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-saffron/50"
              >
                <ImagePlus className="h-5 w-5" />
                <span className="font-display text-[11px] font-bold leading-tight">
                  {paths.length === 0
                    ? t('create.styleClone.imagesPick')
                    : t('create.styleClone.imagesAdd')}
                </span>
              </button>
            )}
          </div>

          <p className="font-body text-xs text-muted-foreground">
            {t('create.styleClone.imagesHint', {
              limit: STYLE_CLONE_IMAGE_LIMIT,
            })}
          </p>
          {dropped > 0 && (
            <p role="status" className="font-body text-xs text-foreground">
              {t('create.styleClone.imagesDropped', {
                limit: STYLE_CLONE_IMAGE_LIMIT,
                count: dropped,
              })}
            </p>
          )}
          {hasRejected && (
            <p role="alert" className="font-body text-xs text-coral">
              {t('create.styleClone.imagesRejectedNotice')}
            </p>
          )}
        </div>
      )}

      <div className="space-y-2">
        <p className="font-display text-sm font-bold text-foreground">
          {kind === 'youtube'
            ? t('create.styleClone.characterQuestionVideo')
            : t('create.styleClone.characterQuestionImages')}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {[true, false].map((answer) => {
            const chosen = replicate === answer
            return (
              <button
                key={String(answer)}
                type="button"
                aria-pressed={chosen}
                onClick={() => setReplicate(answer)}
                className={cn(
                  'cursor-pointer rounded-xl border-2 px-3 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-saffron/50',
                  chosen
                    ? 'border-saffron bg-saffron/10'
                    : 'border-border hover:border-saffron/60',
                )}
              >
                <span className="block font-display text-sm font-bold text-foreground">
                  {answer
                    ? t('create.styleClone.characterYes')
                    : t('create.styleClone.characterNo')}
                </span>
                <span className="mt-0.5 block font-body text-xs leading-snug text-muted-foreground">
                  {answer
                    ? t('create.styleClone.characterYesHint')
                    : t('create.styleClone.characterNoHint')}
                </span>
              </button>
            )
          })}
        </div>
        {/* En el catálogo, el personaje replicado es el personaje fijo de
              la gema: se avisa antes de responder. */}
        {target === 'catalog' && (
          <p className="font-body text-xs text-muted-foreground">
            {t('create.styleClone.characterCatalogHint')}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <p className="font-display text-sm font-bold text-foreground">
          {t('create.styleClone.providerQuestion')}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex flex-wrap items-center rounded-2xl border border-border bg-muted p-0.5">
            {IMAGE_PROVIDERS.map((imageProvider) => (
              <button
                key={imageProvider.id}
                type="button"
                onClick={() => setChosenProvider(imageProvider.id)}
                className={cn(
                  'cursor-pointer rounded-full px-4 py-1.5 font-display text-sm font-bold transition-colors',
                  provider === imageProvider.id
                    ? 'bg-saffron text-charcoal shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t(imageProvider.labelKey)}
              </button>
            ))}
          </div>
          <ImageCreditsBadges
            credits={credits.credits}
            loading={credits.isLoading}
            refreshing={credits.isRefreshing}
            active={provider}
            onRefresh={credits.refresh}
          />
        </div>
        {provider !== 'flow' && (
          <p className="font-body text-xs text-muted-foreground">
            {provider
              ? t('create.styleClone.costNote', {
                  provider: providerLabel(provider),
                })
              : t('create.customStyles.providerRequired')}
          </p>
        )}
      </div>

      {creditsCheck.blocking && (
        <InsufficientCreditsAlert
          lines={creditsCheck.lines}
          blocking
          onReload={(providerId) => void apiKeysApi.openBillingPage(providerId)}
          onRefresh={credits.refresh}
          refreshing={credits.isLoading || credits.isRefreshing}
        />
      )}

      <div className="flex justify-end">
        <Button type="button" disabled={!canStart} onClick={start}>
          {starting ? (
            <Loader2 aria-hidden className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
          {t('create.styleClone.analyze')}
        </Button>
      </div>
    </div>
  )
}
