import { useRef, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Clapperboard, Loader2, Sparkles } from 'lucide-react'
import { ErrorMessage } from '@/modules/common/components/ErrorMessage'
import { ImageCreditsBadges } from '@/modules/common/components/ImageCreditsBadges'
import { useAccessFeature } from '@/modules/common/hooks/useAccessFeature'
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
import { GemAgentWarnings } from '@/modules/videos/components/GemAgentWarnings'
import { GemMigrationNotice } from '@/modules/videos/components/GemMigrationNotice'
import { GemPasteStep } from '@/modules/videos/components/GemPasteStep'
import { GemSectionsEditor } from '@/modules/videos/components/GemSectionsEditor'
import { GemSourceText } from '@/modules/videos/components/GemSourceText'
import { StyleCharacterBlock } from '@/modules/videos/components/StyleCharacterBlock'
import { StyleSamplesCarousel } from '@/modules/videos/components/StyleSamplesCarousel'
import { apiKeysApi } from '@/modules/api-keys/api'
import { providerLabel } from '@/modules/api-keys/utilities/providerLabel'
import { InsufficientCreditsAlert } from '@/modules/common/components/InsufficientCreditsAlert'
import { compareCostLines } from '@/modules/common/utilities/compareCostLines'
import { defaultQualityFor } from '@/modules/videos/utilities/imageQuality'
import { imageCostEstimate } from '@/modules/videos/utilities/imageCostEstimate'
import { useGemTemplateDraft } from '@/modules/videos/hooks/useGemTemplateDraft'
import { useStyleSampleGeneration } from '@/modules/videos/hooks/useStyleSampleGeneration'
import { nextCharacterDraft } from '@/modules/videos/utilities/characterDraft'
import {
  gemBringsCharacter,
  hasGemText,
  pastedGemSavePayload,
  styleContextGemOf,
  templateStyleSavePayload,
} from '@/modules/videos/utilities/gemTemplate'
import { preferredImageProvider } from '@/modules/videos/utilities/preferredImageProvider'
import {
  CATALOG_ORIGIN_BADGE_CLASS,
  CUSTOM_STYLE_FIELD_CLASS,
  CUSTOM_STYLE_NAME_LIMIT,
  CUSTOM_STYLE_PROMPT_LIMIT,
  CUSTOM_STYLE_SAMPLE_COUNT,
  IMAGE_PROVIDERS,
  RECOMMENDED_SHOTS,
} from '@/modules/videos/constants'
import type { ImageProviderId } from '@pipeline/types/image-provider.ts'
import type { SelectedCharacter } from '@/modules/videos/types/create'
import type {
  CharacterDraft,
  CustomStyleDraft,
  GemMigrationState,
} from '@/modules/videos/types/styles'
import type {
  StyleCharacter,
  StyleSample,
  StyleSavePayload,
} from '@pipeline/types/styles.ts'

interface CustomStyleModalProps {
  styleId: string
  initial: CustomStyleDraft
  // Estilo nuevo, todavía fuera de la galería: con la plantilla encendida
  // arranca en «Pegá tu gema» (ADR-0048).
  isNew: boolean
  // Muestras VIVAS del estilo (derivadas de la query de la galería): se ven
  // al abrir y aparecen solas al terminar de generar.
  samples: StyleSample[]
  saving: boolean
  // Abierto desde «Generar 4 muestras» del menú: la intención ya se declaró
  // ahí, así que arranca apenas se elige el proveedor.
  generateOnOpen: boolean
  // Migración de ESTA gema vieja a la plantilla (spec §4.4); null = ninguna.
  migration: GemMigrationState | null
  onRetryMigration: () => void
  // Descarta el aviso de una migración ya hecha.
  onDismissMigration: () => void
  // Contexto para diseñar un personaje nuevo con esta gema desde el selector.
  script: string
  promptModel: string | null
  onSave: (payload: StyleSavePayload) => Promise<void>
  // «Preparar con IA»: guarda la gema pegada como texto y la manda a adaptar
  // en segundo plano; la galería pasa el modal a esa gema guardada.
  onAdaptPastedGem: (payload: StyleSavePayload) => Promise<void>
  onClose: () => void
}

// Ids de las muestras mientras el sidecar todavía no reportó ninguna.
const PLACEHOLDER_SAMPLE_IDS = Array.from(
  { length: CUSTOM_STYLE_SAMPLE_COUNT },
  (_, index) => index + 1,
)

// Modal del estilo (port de ModalEstilo del origen): verlo entero, editarlo y
// probarlo. Orden a propósito: personaje → muestras → proveedor → generar →
// nombre → estilo → Listo, porque el personaje cambia cómo salen las muestras
// y elegirlo después sería generar dos veces. El «estilo» es el texto y los
// planos de siempre en una gema vieja, o sus secciones en una de plantilla
// (ADR-0048), que antes de existir pasa por «Pegá tu gema». El filtro de color
// de la gema (spec §5.5) viaja como está guardado: no se elige acá.
// Cerrar (Listo, la X o clic afuera) GUARDA el borrador como tarjeta: no hay
// «Cancelar». En «Pegá tu gema» de una gema nueva no hay nada que guardar,
// así que con texto pegado se pregunta antes de tirarlo. Regla de modales del
// origen: nunca dos Radix abiertos — mientras se elige el personaje
// predeterminado, este se ESCONDE en vez de apilarse (Radix apaga los clicks
// del body con el de arriba abierto).
export function CustomStyleModal({
  styleId,
  initial,
  isNew,
  samples: storedSamples,
  saving,
  generateOnOpen,
  migration,
  onRetryMigration,
  onDismissMigration,
  script,
  promptModel,
  onSave,
  onAdaptPastedGem,
  onClose,
}: CustomStyleModalProps) {
  const { t } = useTranslation()
  const samplesJob = useStyleSampleGeneration()
  // Saldo por proveedor (misma query que Crear y el editor): generar muestras
  // cobra, y el job difiere el refetch al terminar para que el gasto se vea acá.
  const credits = useImageCredits()
  const { configuredProviders } = useRequiredApiKeys()
  // Interruptor de la plantilla (ADR-0048): configuración global, se lee acá.
  const gemTemplateEnabled = useAccessFeature('gemTemplate')
  // Qué editor usa esta apertura, fijo hasta cerrar. Una gema con secciones se
  // edita por secciones aunque el interruptor se haya apagado después (volver
  // atrás no rompe lo guardado); una nueva, solo con el interruptor encendido.
  // Las viejas siguen con el editor de siempre.
  const [templateMode] = useState(
    () => initial.sections !== undefined || (isNew && gemTemplateEnabled),
  )
  const gemDraft = useGemTemplateDraft(initial)
  // «Preparar con IA» guardando la gema pegada (hasta que el modal pasa a ella).
  const [preparing, setPreparing] = useState(false)

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

  // Hay estilo que guardar: el texto de una gema vieja o el estilo visual de
  // una de plantilla (sin él, el sidecar no la acepta).
  const hasStyleText = templateMode
    ? hasGemText({ sections: gemDraft.sections })
    : systemPrompt.trim().length > 0
  // «Pegá tu gema»: un estilo nuevo por plantilla. Una gema que ya tiene
  // secciones se edita sección por sección; otra gema es otro estilo («Crear
  // estilo»).
  const pasting = templateMode && gemDraft.pasting
  // Cerrar el paso de pegado tira lo pegado (todavía no hay nada guardado):
  // con texto en la caja, primero se pregunta.
  const dropsPastedText = pasting && gemDraft.pasteText.trim().length > 0
  // Mientras la gema vieja se migra, su editor queda quieto: lo que se
  // escribiera acá chocaría con las secciones que está por guardar la migración.
  const migrating = migration?.status === 'pending'
  // La migración ya se guardó, sin que la persona viera las secciones: sus
  // avisos se muestran con el pedido de revisarlas hasta que se descartan.
  const migrated = migration?.status === 'migrated' ? migration : null
  const locked = saving || migrating
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
    hasStyleText &&
    provider !== null &&
    !samplesJob.running &&
    !locked &&
    !creditsCheck.blocking
  const character = characterDraft.character

  const changeCharacter = (next: StyleCharacter) => {
    setCharacterDraft((draft) => nextCharacterDraft(draft, next))
  }

  const payload = (characterToSave: StyleCharacter): StyleSavePayload => {
    // El sidecar exige nombre: sin uno, la tarjeta se llama como en el
    // origen («Estilo sin nombre») en vez de perder el texto.
    const styleName = name.trim() || t('create.customStyles.unnamed')
    if (templateMode)
      return templateStyleSavePayload({
        id: styleId,
        name: styleName,
        sections: gemDraft.sections,
        templateVersion: gemDraft.templateVersion,
        colorFilter: gemDraft.colorFilter,
        character: characterToSave,
        // El respaldo lo escribe la adaptación: editar secciones lo conserva.
        sourcePrompt: null,
      })

    return {
      id: styleId,
      name: styleName,
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
    if (!hasStyleText) return false
    setSaveErrorKey(null)
    const toSave = payload(characterToSave)
    try {
      await onSave(toSave)
      return true
    } catch (error) {
      setSaveErrorKey(videosApi.errorMessageKey(error))
      return false
    }
  }

  // Con muestras generándose no se cierra: cuestan y se verían a medias; el
  // botón lo dice con su spinner. Tampoco en el instante en que se guarda la
  // gema pegada. La adaptación, en cambio, sigue aunque se cierre.
  const close = async () => {
    if (samplesJob.running || preparing) return
    // Sin cambios posibles durante la migración: se cierra sin guardar.
    if (migrating) {
      onClose()
      return
    }

    // Nativo, como al borrar una tarjeta: nunca otro modal encima de este.
    // Cancelar deja el modal abierto con lo pegado.
    if (
      dropsPastedText &&
      !window.confirm(t('create.gemTemplate.discardPasteConfirm'))
    )
      return

    if (hasStyleText) {
      const saved = await persist()
      if (!saved) return
    }
    onClose()
  }

  // «Reintentar» la migración desde el modal: primero se guarda el editor viejo
  // (el mismo camino que al cerrar), así la migración manda lo que la persona
  // ve y lo tipeado no se pierde cuando el modal se vuelve a sembrar por
  // secciones. Sin texto no hay nada que guardar: se migra lo guardado.
  const retryMigration = async () => {
    if (hasStyleText) {
      const saved = await persist()
      if (!saved) return
    }
    onRetryMigration()
  }

  // El estilo se guarda ANTES de generar (guard del origen: «muestras sin
  // estilo, no»): el sidecar genera para una tarjeta que ya existe.
  const generate = async (imageProvider: ImageProviderId) => {
    if (!hasStyleText || migrating) return
    const saved = await persist()
    if (!saved) return
    await samplesJob.generate(styleId, imageProvider, {
      templateGem: templateMode,
    })
  }

  const chooseProvider = (imageProvider: ImageProviderId) => {
    setChosenProvider(imageProvider)
    if (!generateOnOpen || autoStarted.current) return
    autoStarted.current = true
    void generate(imageProvider)
  }

  // «Preparar con IA»: la gema pegada se guarda tal cual (no se pierde aunque
  // se cierre el modal o la app) y se adapta a la plantilla en segundo plano,
  // como una gema vieja que se migra. El modal pasa a esa gema con el aviso
  // «Generando adaptación…» y se puede cerrar; las secciones se guardan solas.
  // Si el guardado falla, el texto sigue en la caja y el error se ve abajo.
  const prepare = async () => {
    setSaveErrorKey(null)
    setPreparing(true)
    try {
      await onAdaptPastedGem(
        pastedGemSavePayload({
          id: styleId,
          name: name.trim() || t('create.customStyles.unnamed'),
          text: gemDraft.pasteText,
          character,
          colorFilter: gemDraft.colorFilter,
        }),
      )
    } catch (error) {
      setSaveErrorKey(videosApi.errorMessageKey(error))
    } finally {
      setPreparing(false)
    }
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
              {pasting
                ? t('create.gemTemplate.pasteHint')
                : t('create.customStyles.modalDescription')}
            </DialogDescription>
            {/* Una copia de «Pasar a mi estilo» dice de qué estilo de Vimo se
                clonó, con el nombre en una píldora (Entrega 2). */}
            {initial.origin && (
              <p className="font-body text-sm text-foreground">
                <Trans
                  i18nKey="create.customStyles.clonedFrom"
                  values={{ name: initial.origin.name }}
                  components={{
                    badge: <span className={CATALOG_ORIGIN_BADGE_CLASS} />,
                  }}
                />
              </p>
            )}
          </DialogHeader>

          {pasting ? (
            // Si «Preparar con IA» no logra guardar la gema pegada, el texto
            // sigue en la caja y el porqué se dice acá.
            <div className="space-y-3">
              <GemPasteStep
                text={gemDraft.pasteText}
                pending={saving || preparing}
                onTextChange={gemDraft.setPasteText}
                onPrepare={() => void prepare()}
              />
              {saveErrorKey && <ErrorMessage>{t(saveErrorKey)}</ErrorMessage>}
            </div>
          ) : (
            <div className="space-y-4">
              {migration && migration.status !== 'migrated' && (
                <GemMigrationNotice
                  migration={migration}
                  named={false}
                  retryDisabled={saving || samplesJob.running}
                  onRetry={() => void retryMigration()}
                />
              )}
              {templateMode && migrated && (
                <GemAgentWarnings
                  warnings={migrated.warnings}
                  migrated
                  onDismiss={onDismissMigration}
                />
              )}

              <StyleCharacterBlock
                value={character}
                disabled={locked}
                styleId={styleId}
                // Con la sección `character` escrita (también mientras se
                // escribe), «genérico» es el personaje de la gema.
                fixedCharacter={
                  templateMode && gemBringsCharacter(gemDraft.sections)
                }
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
                  disabled={locked}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={t('create.customStyles.namePlaceholder')}
                  className={cn(CUSTOM_STYLE_FIELD_CLASS, 'text-sm')}
                />
              </div>

              {templateMode ? (
                <>
                  <GemSectionsEditor
                    sections={gemDraft.sections}
                    disabled={saving}
                    onChange={gemDraft.editSection}
                  />
                  {/* El respaldo de la gema (spec §4.4), solo de lectura. Con
                    el interruptor apagado el modal queda como hoy (spec §7). */}
                  {gemTemplateEnabled && gemDraft.originalText && (
                    <GemSourceText text={gemDraft.originalText} />
                  )}
                </>
              ) : (
                <>
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
                      disabled={locked}
                      onChange={(event) => setSystemPrompt(event.target.value)}
                      placeholder={t('create.customStyles.promptPlaceholder')}
                      rows={14}
                      spellCheck={false}
                      className={cn(
                        CUSTOM_STYLE_FIELD_CLASS,
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
                      disabled={locked}
                      onChange={(event) => setShots(event.target.value)}
                      placeholder={t('create.customStyles.shotsPlaceholder')}
                      spellCheck={false}
                      className={cn(
                        CUSTOM_STYLE_FIELD_CLASS,
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
                      disabled={locked}
                      className="mt-2"
                      onClick={() => setShots(RECOMMENDED_SHOTS.join(', '))}
                    >
                      <Clapperboard className="mr-2 h-4 w-4" />
                      {t('create.customStyles.recommendedShots')}
                    </Button>
                  </div>
                </>
              )}

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
          )}
        </DialogContent>
      </Dialog>

      {picking !== null && (
        <CharacterPickerModal
          previewStyleKey={styleId}
          selected={picking}
          max={1}
          styleContext={
            hasStyleText
              ? {
                  styleId,
                  // Una gema de plantilla viaja por secciones: el sidecar la
                  // pasa a texto sin su sección de personaje (ADR-0048).
                  ...styleContextGemOf(
                    templateMode
                      ? { sections: gemDraft.sections }
                      : { systemPrompt },
                  ),
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
