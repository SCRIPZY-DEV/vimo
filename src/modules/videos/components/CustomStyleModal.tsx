import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Clapperboard, Loader2, Sparkles } from 'lucide-react'
import { ErrorMessage } from '@/modules/common/components/ErrorMessage'
import { ImageCreditsBadges } from '@/modules/common/components/ImageCreditsBadges'
import { useImageCredits } from '@/modules/common/hooks/useImageCredits'
import { Button } from '@/modules/common/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/modules/common/ui/dialog'
import { cn } from '@/modules/common/utilities/cn'
import { useRequiredApiKeys } from '@/modules/api-keys/hooks/useRequiredApiKeys'
import { videosApi } from '@/modules/videos/api'
import { CharacterPickerModal } from '@/modules/videos/components/CharacterPickerModal'
import { StyleCharacterBlock } from '@/modules/videos/components/StyleCharacterBlock'
import { StyleSamplesCarousel } from '@/modules/videos/components/StyleSamplesCarousel'
import { apiKeysApi } from '@/modules/api-keys/api'
import { providerLabel } from '@/modules/api-keys/utilities/providerLabel'
import { InsufficientCreditsAlert } from '@/modules/common/components/InsufficientCreditsAlert'
import { compareCostLines } from '@/modules/common/utilities/compareCostLines'
import { defaultQualityFor } from '@/modules/videos/utilities/imageQuality'
import { imageCostEstimate } from '@/modules/videos/utilities/imageCostEstimate'
import { useStyleSampleGeneration } from '@/modules/videos/hooks/useStyleSampleGeneration'
import { preferredImageProvider } from '@/modules/videos/utilities/preferredImageProvider'
import {
  CUSTOM_STYLE_NAME_LIMIT,
  CUSTOM_STYLE_PROMPT_LIMIT,
  CUSTOM_STYLE_SAMPLE_COUNT,
  IMAGE_PROVIDERS,
  RECOMMENDED_SHOTS,
} from '@/modules/videos/constants'
import type { ImageProviderId } from '@pipeline/types/image-provider.ts'
import type { SelectedCharacter } from '@/modules/videos/types/create'
import type { CustomStyleDraft } from '@/modules/videos/types/styles'
import type {
  StyleCharacter,
  StyleSample,
  StyleSavePayload,
} from '@pipeline/types/styles.ts'

interface CustomStyleModalProps {
  styleId: string
  initial: CustomStyleDraft
  // Muestras VIVAS del estilo (derivadas de la query de la galería): se ven
  // al abrir y aparecen solas al terminar de generar.
  samples: StyleSample[]
  saving: boolean
  // Abierto desde «Generar 4 muestras» del menú: la intención ya se declaró
  // ahí, así que arranca apenas se elige el proveedor.
  generateOnOpen: boolean
  // Contexto para diseñar un personaje nuevo con esta gema desde el selector.
  script: string
  promptModel: string | null
  onSave: (payload: StyleSavePayload) => Promise<void>
  onClose: () => void
}

// El protagonista de la gema más lo que hay que recordar al pasar por otro
// modo: si la persona va a «Genérico» y vuelve a «Mi personaje», no pierde
// el personaje que ya había fijado (en disco solo se guarda con «own»).
interface CharacterDraft {
  character: StyleCharacter
  lastDefaultCharacterId?: string
}

// Qué queda en el borrador al cambiar el bloque de personaje. Pura: la
// elección del predeterminado se guarda en el mismo gesto que la aplica, así
// que hay que conocer el borrador nuevo antes de que React lo pinte.
function nextCharacterDraft(
  draft: CharacterDraft,
  next: StyleCharacter,
): CharacterDraft {
  const current = draft.character
  const returnsToOwn = next.mode === 'own' && current.mode !== 'own'
  // Volver a «Mi personaje» desde otro modo recupera el fijado que tenía.
  if (returnsToOwn && !next.defaultCharacterId && draft.lastDefaultCharacterId)
    return {
      ...draft,
      character: {
        mode: 'own',
        defaultCharacterId: draft.lastDefaultCharacterId,
      },
    }
  // Apagar el predeterminado estando en «Mi personaje» lo olvida.
  if (next.mode === 'own' && !next.defaultCharacterId && !returnsToOwn)
    return { character: next }
  return {
    character: next,
    lastDefaultCharacterId:
      next.defaultCharacterId ?? draft.lastDefaultCharacterId,
  }
}

// Ids de las muestras mientras el sidecar todavía no reportó ninguna.
const PLACEHOLDER_SAMPLE_IDS = Array.from(
  { length: CUSTOM_STYLE_SAMPLE_COUNT },
  (_, index) => index + 1,
)

const FIELD_CLASS =
  'w-full rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-primary disabled:opacity-60'

// Modal del estilo (port de ModalEstilo del origen): verlo entero, editarlo y
// probarlo. Orden a propósito: personaje → muestras → proveedor → generar →
// nombre → estilo → planos → Listo, porque el personaje cambia cómo salen
// las muestras y elegirlo después sería generar dos veces. Cerrar (Listo, la
// X o clic afuera) GUARDA el borrador como tarjeta: no hay «Cancelar».
// Regla de modales del origen: nunca dos Radix abiertos — mientras se elige
// el personaje predeterminado, este se ESCONDE en vez de apilarse (Radix
// apaga los clicks del body con el de arriba abierto).
export function CustomStyleModal({
  styleId,
  initial,
  samples: storedSamples,
  saving,
  generateOnOpen,
  script,
  promptModel,
  onSave,
  onClose,
}: CustomStyleModalProps) {
  const { t } = useTranslation()
  const samplesJob = useStyleSampleGeneration()
  // Saldo por proveedor (misma query que Crear y el editor): generar muestras
  // cobra, y el job difiere el refetch al terminar para que el gasto se vea acá.
  const credits = useImageCredits()
  const { configuredProviders } = useRequiredApiKeys()

  const [name, setName] = useState(initial.name)
  const [systemPrompt, setSystemPrompt] = useState(initial.systemPrompt)
  const [shots, setShots] = useState(initial.shots.join(', '))
  // Con qué proveedor salen las muestras: lo que la persona tocó, o, hasta
  // que toque, el proveedor con clave configurada (Evolink si están las dos).
  // Sin ninguna clave no hay elegido y el botón de generar espera.
  const [chosenProvider, setChosenProvider] = useState<ImageProviderId | null>(
    null,
  )
  const provider = chosenProvider ?? preferredImageProvider(configuredProviders)
  // Ausente en disco = genérico (gemas previas a ADR-0020). Viaja SIEMPRE en
  // el payload: el guard del sidecar conserva el bloque solo cuando falta.
  const [characterDraft, setCharacterDraft] = useState<CharacterDraft>({
    character: initial.character ?? { mode: 'generic' },
    lastDefaultCharacterId: initial.character?.defaultCharacterId,
  })
  // Selector de personaje abierto, con el ya elegido preseleccionado.
  const [picking, setPicking] = useState<SelectedCharacter[] | null>(null)
  const [saveErrorKey, setSaveErrorKey] = useState<string | null>(null)
  // La generación automática del menú corre UNA vez por apertura.
  const autoStarted = useRef(false)

  const hasPrompt = systemPrompt.trim().length > 0
  // Las muestras se cobran como N imágenes en calidad base (ADR-0029): con
  // saldo leído insuficiente el botón se frena y se ofrece recargar.
  const samplesEstimate = provider
    ? imageCostEstimate(
        provider,
        defaultQualityFor(provider),
        CUSTOM_STYLE_SAMPLE_COUNT,
      )
    : null
  const creditsCheck = compareCostLines(
    samplesEstimate ? [samplesEstimate] : [],
    { image: credits.credits, voice: null },
    providerLabel,
  )
  const canGenerate =
    hasPrompt &&
    provider !== null &&
    !samplesJob.running &&
    !saving &&
    !creditsCheck.blocking
  const character = characterDraft.character

  const changeCharacter = (next: StyleCharacter) => {
    setCharacterDraft((draft) => nextCharacterDraft(draft, next))
  }

  const payload = (characterToSave: StyleCharacter): StyleSavePayload => {
    return {
      id: styleId,
      // El sidecar exige nombre: sin uno, la tarjeta se llama como en el
      // origen («Estilo sin nombre») en vez de perder el texto.
      name: name.trim() || t('create.customStyles.unnamed'),
      systemPrompt: systemPrompt.trim(),
      shots: shots
        .split(',')
        .map((shot) => shot.trim())
        .filter(Boolean),
      character: characterToSave,
    }
  }

  // Guarda el borrador si tiene estilo escrito. Sin texto no hay nada que
  // guardar (el sidecar lo exige); un fallo se muestra y deja el modal
  // abierto para no perder lo tipeado. `characterToSave` permite guardar un
  // bloque recién elegido antes de que React lo pinte.
  const persist = async (
    characterToSave: StyleCharacter = character,
  ): Promise<boolean> => {
    if (!hasPrompt) return false
    setSaveErrorKey(null)
    try {
      await onSave(payload(characterToSave))
      return true
    } catch (error) {
      setSaveErrorKey(videosApi.errorMessageKey(error))
      return false
    }
  }

  // Con muestras generándose no se cierra: el trabajo cuesta y se vería a
  // medias; el botón lo dice con su spinner.
  const close = async () => {
    if (samplesJob.running) return
    if (hasPrompt) {
      const saved = await persist()
      if (!saved) return
    }
    onClose()
  }

  // El estilo se guarda ANTES de generar (guard del origen: «muestras sin
  // estilo, no»): el sidecar genera para una tarjeta que ya existe.
  const generate = async (imageProvider: ImageProviderId) => {
    if (!hasPrompt) return
    const saved = await persist()
    if (!saved) return
    await samplesJob.generate(styleId, imageProvider)
  }

  const chooseProvider = (imageProvider: ImageProviderId) => {
    setChosenProvider(imageProvider)
    if (!generateOnOpen || autoStarted.current) return
    autoStarted.current = true
    void generate(imageProvider)
  }

  const writing = samplesJob.phase !== 'images'
  const progressIds = PLACEHOLDER_SAMPLE_IDS
  const sampleImages = storedSamples.map((sample) =>
    videosApi.imageSource(sample.path, sample.mtimeMs),
  )
  // Muestras nuevas → carrusel nuevo, desde la primera.
  const carouselKey = storedSamples
    .map((sample) => `${sample.file}:${sample.mtimeMs}`)
    .join('|')

  return (
    <>
      <Dialog
        open={picking === null}
        onOpenChange={(open) => {
          if (!open) void close()
        }}
      >
        {/* Sin autofoco al abrir: Radix enfoca «lo primero enfocable», que acá
            es el signo de pregunta de la opción activa del personaje, y el
            tooltip se abre con el foco. Tab sigue entrando normalmente. */}
        <DialogContent
          className="max-h-[90vh] max-w-3xl overflow-y-auto"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="font-display">
              {t('create.customStyles.modalTitle')}
            </DialogTitle>
            <DialogDescription>
              {t('create.customStyles.modalDescription')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <StyleCharacterBlock
              value={character}
              disabled={saving}
              styleId={styleId}
              onChange={changeCharacter}
              onPickCharacter={(current) =>
                setPicking(current ? [current] : [])
              }
            />

            {samplesJob.running ? (
              // Mientras se generan, las 4 muestras se ven como tarjetas
              // cargando con su barra y su %: Evolink el real del poll, Fal
              // la estimación del sidecar.
              <div className="grid grid-cols-2 gap-3">
                {progressIds.map((id) => {
                  const percent =
                    (writing
                      ? samplesJob.promptPercents[id]
                      : samplesJob.samplePercents[id]) ?? 0
                  const image = samplesJob.sampleImages[id]
                  return (
                    <div
                      key={id}
                      className="relative flex aspect-video flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border border-border bg-muted/60 px-5"
                    >
                      {image && (
                        <img
                          src={image}
                          alt={t('create.customStyles.sampleAlt', {
                            number: id,
                            name,
                          })}
                          className="absolute inset-0 h-full w-full object-contain"
                        />
                      )}
                      <span className="absolute left-2.5 top-2 font-display text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                        {t('create.customStyles.sampleLabel', { id })}
                      </span>
                      {!image && (
                        <p className="font-body text-xs text-muted-foreground">
                          <SampleProgressText
                            writing={writing}
                            percent={percent}
                          />
                        </p>
                      )}
                      {!image && (
                        <div className="h-1.5 w-full max-w-[180px] overflow-hidden rounded-full bg-border">
                          <div
                            className="h-full rounded-full bg-saffron transition-all duration-500"
                            style={{ width: `${Math.max(4, percent)}%` }}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : sampleImages.length > 0 ? (
              <StyleSamplesCarousel
                key={carouselKey}
                images={sampleImages}
                name={name.trim() || t('create.customStyles.modalTitle')}
              />
            ) : (
              <div className="flex aspect-video items-center justify-center rounded-xl border-2 border-dashed border-border text-center">
                <p className="px-6 font-body text-sm text-muted-foreground">
                  {t('create.customStyles.samplesEmpty')}
                  <br />
                  {t('create.customStyles.samplesEmptyHint')}
                </p>
              </div>
            )}

            <div>
              <p className="mb-1.5 text-xs font-medium">
                {t('create.customStyles.providerQuestion')}
              </p>
              {/* El mismo control segmentado que el formulario de Crear (el
                  elegido en saffron pleno), con el saldo de cada proveedor y
                  el botón de refrescar al lado. */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex items-center rounded-full border border-border bg-muted p-0.5">
                  {IMAGE_PROVIDERS.map((imageProvider) => {
                    const chosen = provider === imageProvider.id
                    return (
                      <button
                        key={imageProvider.id}
                        type="button"
                        disabled={samplesJob.running}
                        onClick={() => chooseProvider(imageProvider.id)}
                        className={cn(
                          'cursor-pointer rounded-full px-4 py-1.5 font-display text-sm font-bold transition-colors disabled:cursor-default disabled:opacity-60',
                          chosen
                            ? 'bg-saffron text-charcoal shadow-sm'
                            : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {imageProvider.label}
                      </button>
                    )
                  })}
                </div>
                <ImageCreditsBadges
                  credits={credits.credits}
                  loading={credits.isLoading}
                  refreshing={credits.isRefreshing}
                  active={provider}
                  onRefresh={credits.refresh}
                />
              </div>
              <p className="mt-1.5 font-body text-xs text-muted-foreground">
                {t('create.customStyles.providerHint')}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canGenerate}
                onClick={() => {
                  if (provider) void generate(provider)
                }}
              >
                {samplesJob.running ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('create.customStyles.generating')}
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    {sampleImages.length > 0
                      ? t('create.customStyles.regenerateSamples')
                      : t('create.customStyles.generateSamples')}
                  </>
                )}
              </Button>
              {provider === null && (
                <span className="font-body text-xs text-muted-foreground">
                  {t('create.customStyles.providerRequired')}
                </span>
              )}
            </div>
            <p className="font-body text-xs text-muted-foreground">
              {t('create.customStyles.samplesNote')}
            </p>

            {creditsCheck.blocking && (
              <InsufficientCreditsAlert
                lines={creditsCheck.lines}
                blocking
                onReload={(providerId) =>
                  void apiKeysApi.openBillingPage(providerId)
                }
                onRefresh={credits.refresh}
                refreshing={credits.isLoading || credits.isRefreshing}
              />
            )}

            {saveErrorKey && <ErrorMessage>{t(saveErrorKey)}</ErrorMessage>}
            {samplesJob.errorKey && (
              <ErrorMessage>{t(samplesJob.errorKey)}</ErrorMessage>
            )}

            <div>
              <label
                htmlFor="custom-style-name"
                className="mb-1 block text-xs font-medium"
              >
                {t('create.customStyles.nameLabel')}
              </label>
              <input
                id="custom-style-name"
                value={name}
                maxLength={CUSTOM_STYLE_NAME_LIMIT}
                disabled={saving}
                onChange={(event) => setName(event.target.value)}
                placeholder={t('create.customStyles.namePlaceholder')}
                className={cn(FIELD_CLASS, 'text-sm')}
              />
            </div>

            <div>
              <label
                htmlFor="custom-style-prompt"
                className="mb-1 block text-xs font-medium"
              >
                {t('create.customStyles.promptLabel')}
              </label>
              <textarea
                id="custom-style-prompt"
                value={systemPrompt}
                maxLength={CUSTOM_STYLE_PROMPT_LIMIT}
                disabled={saving}
                onChange={(event) => setSystemPrompt(event.target.value)}
                placeholder={t('create.customStyles.promptPlaceholder')}
                rows={14}
                spellCheck={false}
                className={cn(
                  FIELD_CLASS,
                  'resize-y font-mono text-xs leading-relaxed placeholder:text-muted-foreground/70',
                )}
              />
            </div>

            <div>
              <label
                htmlFor="custom-style-shots"
                className="mb-1 block text-xs font-medium"
              >
                {t('create.customStyles.shotsLabel')}{' '}
                <span className="font-normal text-muted-foreground">
                  {t('create.customStyles.shotsOptional')}
                </span>
              </label>
              <input
                id="custom-style-shots"
                value={shots}
                disabled={saving}
                onChange={(event) => setShots(event.target.value)}
                placeholder={t('create.customStyles.shotsPlaceholder')}
                spellCheck={false}
                className={cn(
                  FIELD_CLASS,
                  'font-mono text-xs placeholder:text-muted-foreground/70',
                )}
              />
              {/* Los pedidos de prompts van en paralelo, así que uno no sabe
                  con qué plano terminó el anterior: con la lista se reparten
                  de antemano. Sin ella funciona igual. */}
              <p className="mt-1 font-body text-xs text-muted-foreground">
                {t('create.customStyles.shotsHint')}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={saving}
                className="mt-2"
                onClick={() => setShots(RECOMMENDED_SHOTS.join(', '))}
              >
                <Clapperboard className="mr-2 h-4 w-4" />
                {t('create.customStyles.recommendedShots')}
              </Button>
            </div>

            <div className="flex justify-end">
              <Button
                type="button"
                disabled={saving || samplesJob.running}
                onClick={() => void close()}
              >
                {t('create.customStyles.save')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {picking !== null && (
        <CharacterPickerModal
          previewStyleKey={styleId}
          selected={picking}
          max={1}
          styleContext={
            hasPrompt
              ? {
                  styleId,
                  gem: systemPrompt,
                  script,
                  ...(promptModel ? { promptModel } : {}),
                }
              : undefined
          }
          onConfirm={(characters) => {
            const chosen = characters.at(0)
            const draft = nextCharacterDraft(
              characterDraft,
              chosen
                ? { mode: 'own', defaultCharacterId: chosen.characterId }
                : { mode: 'own' },
            )
            setCharacterDraft(draft)
            setPicking(null)
            // v1.19.3 del origen: la elección del predeterminado se guarda al
            // toque, no solo al cerrar (se perdía si la persona salía sin
            // «Listo»). Sin texto todavía no hay tarjeta: la guarda el cierre.
            void persist(draft.character)
          }}
          onClose={() => setPicking(null)}
        />
      )}
    </>
  )
}

interface SampleProgressTextProps {
  writing: boolean
  percent: number
}

// Qué dice cada tarjeta de muestra mientras se genera.
function SampleProgressText({ writing, percent }: SampleProgressTextProps) {
  const { t } = useTranslation()

  if (writing) return t('create.customStyles.writingPrompts')
  if (percent >= 100) return t('create.customStyles.sampleReady')
  return t('create.customStyles.sampleGenerating', { percent })
}
