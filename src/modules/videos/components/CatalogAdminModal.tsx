import { FLOW_TOOLS_EXECUTION_PLAN } from '@/modules/common/constants'
import { FlowExecutionMode } from '@/modules/common/components/FlowExecutionMode'
import type { FlowRestartRequest } from '@/modules/common/types/flow'
import { FlowRestartInline } from '@/modules/common/components/FlowRestartInline'
import { FlowCapacityNotice } from '@/modules/common/components/FlowCapacityNotice'
import { useFlowCapacity } from '@/modules/common/hooks/useFlowCapacity'
import { FLOW_RESULT_RECOVERY_KEYS } from '@/modules/common/constants'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Save, Sparkles, Upload } from 'lucide-react'
import { Alert } from '@/modules/common/components/Alert'
import { ErrorMessage } from '@/modules/common/components/ErrorMessage'
import { InsufficientCreditsAlert } from '@/modules/common/components/InsufficientCreditsAlert'
import { Brand } from '@/modules/common/brand/brand'
import { useImageCredits } from '@/modules/common/hooks/useImageCredits'
import { Button } from '@/modules/common/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/modules/common/ui/dialog'
import { compareCostLines } from '@/modules/common/utilities/compareCostLines'
import { apiKeysApi } from '@/modules/api-keys/api'
import { useRequiredApiKeys } from '@/modules/api-keys/hooks/useRequiredApiKeys'
import { providerLabel } from '@/modules/api-keys/utilities/providerLabel'
import { videosApi } from '@/modules/videos/api'
import { CatalogAdminFields } from '@/modules/videos/components/CatalogAdminFields'
import { GemAgentWarnings } from '@/modules/videos/components/GemAgentWarnings'
import { GemPasteStep } from '@/modules/videos/components/GemPasteStep'
import { GemSectionsEditor } from '@/modules/videos/components/GemSectionsEditor'
import { ImageProviderPicker } from '@/modules/videos/components/ImageProviderPicker'
import { SampleGenerationProgress } from '@/modules/videos/components/SampleGenerationProgress'
import { StyleSamplesCarousel } from '@/modules/videos/components/StyleSamplesCarousel'
import { useStyleSampleGeneration } from '@/modules/videos/hooks/useStyleSampleGeneration'
import {
  CATALOG_DRAFT_CONFLICT_CODE,
  CATALOG_DRAFT_SAMPLE_COUNT,
} from '@/modules/videos/constants'
import {
  catalogAdminSampleImages,
  catalogDraftFromRebuild,
  catalogDraftProblems,
  catalogPublishBlockers,
  emptyCatalogDraft,
  normalizedCatalogDraft,
  sameCatalogDraft,
  suggestedCatalogStyleId,
  withBehaviorTags,
} from '@/modules/videos/utilities/catalogAdminDraft'
import { samplesOriginOf } from '@/modules/videos/utilities/catalogSync'
import { gemRebuildRequest } from '@/modules/videos/utilities/gemTemplate'
import { defaultQualityFor } from '@/modules/videos/utilities/imageQuality'
import { imageCostEstimate } from '@/modules/videos/utilities/imageCostEstimate'
import { preferredImageProvider } from '@/modules/videos/utilities/preferredImageProvider'
import type { useCatalogAdmin } from '@/modules/videos/hooks/useCatalogAdmin'
import type { AdminCatalogStyle } from '@/modules/videos/types/catalogRemote'
import type { CatalogStyleContent } from '@pipeline/types/catalog.ts'
import type { ImageProviderId } from '@pipeline/types/image-provider.ts'
import type { GemSectionKey, StyleSample } from '@pipeline/types/styles.ts'

/** Lo que el modal necesita del hook del admin (la galería es su dueña). */
export type CatalogAdminController = Pick<
  ReturnType<typeof useCatalogAdmin>,
  | 'createStyle'
  | 'saveStyle'
  | 'reserveSamples'
  | 'publishStyle'
  | 'refreshStyle'
  | 'translateName'
  | 'translating'
  | 'busy'
>

interface CatalogAdminModalProps {
  // null = estilo nuevo: arranca en «Pegá tu gema», salvo que llegue
  // `initialDraft`.
  style: AdminCatalogStyle | null
  // Un estilo nuevo que ya viene armado (la gema que clonó «Crear estilo con
  // IA», ADR-0050): se saltea «Pegá tu gema» y arranca en los campos, con el
  // id sugerido desde su nombre. Solo cuenta con `style === null`.
  initialDraft?: CatalogStyleContent
  samplesBaseUrl: string
  // Abierto desde «Generar muestras» del menú: la intención ya se declaró
  // ahí, así que arranca apenas se elige el proveedor.
  generateOnOpen: boolean
  admin: CatalogAdminController
  onClose: () => void
}

// Ids de las muestras mientras el sidecar todavía no reportó ninguna.
const PLACEHOLDER_SAMPLE_IDS = Array.from(
  { length: CATALOG_DRAFT_SAMPLE_COUNT },
  (_, index) => index + 1,
)

// El modal del admin para un estilo del catálogo remoto (Entrega 3, ADR-0049,
// plan E3 tareas C4 y C5), armado con las piezas del modal de Mi estilo. Un
// estilo nuevo arranca en «Pegá tu gema»: el agente la ordena en secciones y
// sugiere los modos; después vienen los campos del catálogo (id sugerido
// desde el nombre, nombre en tres idiomas con «Traducir con IA», etiquetas,
// modos, filtro, posición), las muestras y las secciones. Lo que se guarda es
// un BORRADOR en el servidor: los usuarios ven el estilo cuando se publica.
// Generar muestras guarda primero (como Mi estilo), genera con las claves del
// admin en `_catalog/_drafts/<id>/`, reserva una tanda en el bucket, sube los
// archivos y guarda el borrador con la tanda nueva, todo en un gesto. Dos
// admins no se pisan: un `borrador-cambio` ofrece volver a intentar con la
// revisión de ahora sin perder lo escrito (plan E3, P11). Cerrar guarda el
// borrador si se puede; si no, pregunta antes de tirar lo escrito.
export function CatalogAdminModal({
  style,
  initialDraft,
  samplesBaseUrl,
  generateOnOpen,
  admin,
  onClose,
}: CatalogAdminModalProps) {
  const { t, i18n } = useTranslation()
  const samplesJob = useStyleSampleGeneration()
  const credits = useImageCredits()
  const { configuredProviders } = useRequiredApiKeys()

  // Un borrador que ya viene armado solo vale para un estilo nuevo.
  const prepared = style === null ? initialDraft : undefined
  const [pasting, setPasting] = useState(style === null && !prepared)
  const [pasteText, setPasteText] = useState('')
  const [preparing, setPreparing] = useState(false)
  const [prepareErrorKey, setPrepareErrorKey] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])

  // El id de un borrador armado se sugiere desde su nombre al abrir: `update`
  // solo lo sugiere cuando el admin cambia el nombre.
  const [id, setId] = useState(
    style?.id ?? suggestedCatalogStyleId(prepared?.name.es ?? ''),
  )
  // Hasta que el admin toque el id, se sugiere solo desde el nombre en español.
  const [idTouched, setIdTouched] = useState(style !== null)
  const [position, setPosition] = useState(style?.position ?? 0)
  const [content, setContent] = useState<CatalogStyleContent>(
    style?.draft ?? prepared ?? emptyCatalogDraft(),
  )
  // null = el estilo todavía no existe en el servidor.
  const [revision, setRevision] = useState<number | null>(
    style?.revision ?? null,
  )
  // Lo último guardado en el servidor (null = nunca): contra esto se decide si
  // hay algo que guardar, comparando de verdad y no con una marca de «tocado»,
  // así deshacer un cambio a mano vuelve a apagar «Guardar borrador».
  const [saved, setSaved] = useState<{
    content: CatalogStyleContent
    position: number
  } | null>(style ? { content: style.draft, position: style.position } : null)
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const [errorDetail, setErrorDetail] = useState('')
  const [conflict, setConflict] = useState(false)
  // Las muestras recién generadas, en disco, hasta que la próxima apertura
  // las vea desde el bucket.
  const [localSamples, setLocalSamples] = useState<StyleSample[] | null>(null)
  const [uploading, setUploading] = useState(false)
  const [chosenProvider, setChosenProvider] = useState<ImageProviderId | null>(
    null,
  )
  const executionPlan = FLOW_TOOLS_EXECUTION_PLAN
  const provider = chosenProvider ?? preferredImageProvider(configuredProviders)
  const autoStarted = useRef(false)
  const flowCapacity = useFlowCapacity(
    CATALOG_DRAFT_SAMPLE_COUNT,
    provider === 'flow',
    { executionPlan },
  )
  const recoveringFlow =
    provider === 'flow' &&
    !!samplesJob.errorKey &&
    FLOW_RESULT_RECOVERY_KEYS.has(samplesJob.errorKey)
  const providerReady =
    provider === 'flow'
      ? flowCapacity.ready || recoveringFlow
      : provider !== null && configuredProviders.has(provider)

  const language = i18n.resolvedLanguage ?? 'es'
  const displayName =
    content.name.es.trim() ||
    content.name.en.trim() ||
    id ||
    t('create.catalogAdmin.modalTitle')
  const problems = catalogDraftProblems(id, content)
  const blockers = catalogPublishBlockers(normalizedCatalogDraft(content))
  // Un estilo nuevo ya preparado siempre tiene algo que guardar; uno existente,
  // solo si cambió respecto de lo guardado.
  const dirty =
    saved === null ? !pasting : !sameCatalogDraft({ content, position }, saved)
  const locked = admin.busy || preparing || uploading || samplesJob.running
  const samplesEstimate = provider
    ? imageCostEstimate(
        provider,
        defaultQualityFor(provider),
        CATALOG_DRAFT_SAMPLE_COUNT,
      )
    : null
  const creditsCheck = compareCostLines(
    samplesEstimate ? [samplesEstimate] : [],
    { image: credits.credits, voice: null },
    providerLabel,
  )
  const canGenerate =
    problems.length === 0 &&
    provider !== null &&
    providerReady &&
    !locked &&
    !creditsCheck.blocking
  const sampleImages = localSamples
    ? localSamples.map((sample) =>
        videosApi.imageSource(sample.path, sample.mtimeMs),
      )
    : catalogAdminSampleImages(id, content, samplesBaseUrl)
  const carouselKey = sampleImages.join('|')

  const failWith = (error: unknown) => {
    setErrorKey(videosApi.catalogServerErrorKey(error))
    setErrorDetail(videosApi.catalogServerErrorDetail(error))
    if (videosApi.catalogServerErrorCode(error) === CATALOG_DRAFT_CONFLICT_CODE)
      setConflict(true)
  }

  const update = (next: CatalogStyleContent) => {
    setContent({ ...next, tags: withBehaviorTags(next) })
    if (!idTouched && revision === null)
      setId(suggestedCatalogStyleId(next.name.es))
  }

  const editSection = (key: GemSectionKey, value: string) => {
    update({ ...content, sections: { ...content.sections, [key]: value } })
  }

  // «Preparar con IA»: la gema pegada va al agente con `origin: 'catalogo'`
  // (sin cupo para admins) y vuelve por secciones con los modos sugeridos.
  const prepare = async () => {
    setPrepareErrorKey(null)
    setPreparing(true)
    try {
      const response = await videosApi.rebuildGem(
        gemRebuildRequest(pasteText, 'catalogo', Brand.version, language),
      )
      const draft = catalogDraftFromRebuild(response)
      setContent(draft)
      setWarnings(response.warnings)
      setPasting(false)
    } catch (error) {
      setPrepareErrorKey(videosApi.gemRebuildErrorKey(error))
    } finally {
      setPreparing(false)
    }
  }

  // Guarda el borrador (crea el estilo si todavía no existe). null = no se
  // guardó: el porqué queda a la vista y el modal sigue abierto. Sin cambios
  // sobre un estilo que ya existe no manda nada: devuelve el de la lista.
  const persist = async (): Promise<AdminCatalogStyle | null> => {
    if (problems.length > 0) return null
    if (!dirty && style && style.revision === revision) return style
    setErrorKey(null)
    setErrorDetail('')
    const draft = normalizedCatalogDraft(content)
    try {
      const stored =
        revision === null
          ? await admin.createStyle({ id, position, draft }, displayName)
          : await admin.saveStyle(
              id,
              { revision, draft, position },
              displayName,
            )
      setRevision(stored.revision)
      setContent(stored.draft)
      setPosition(stored.position)
      setSaved({ content: stored.draft, position: stored.position })
      setConflict(false)
      return stored
    } catch (error) {
      failWith(error)
      return null
    }
  }

  // «Guardar borrador»: guarda y vuelve al catálogo (pedido del dueño,
  // 2026-10-06): lo guardado ya está en su tarjeta, como «Borrador».
  const saveAndClose = async () => {
    const stored = await persist()
    if (stored) onClose()
  }

  // Tras un `borrador-cambio`: la revisión de ahora y lo escrito, de nuevo.
  const retryAfterConflict = async () => {
    const fresh = await admin.refreshStyle(id)
    if (!fresh) return
    setRevision(fresh.revision)
    setConflict(false)
  }

  const translate = async () => {
    try {
      const { name } = await admin.translateName(content.name.es.trim())
      update({
        ...content,
        name: { ...content.name, en: name.en, pt: name.pt },
      })
    } catch (error) {
      failWith(error)
    }
  }

  // Generar las 4 muestras del borrador: guardar → generar (sidecar, claves
  // del admin) → reservar la tanda → subir → guardar con la tanda nueva.
  const generate = async (
    imageProvider: ImageProviderId,
    restart?: FlowRestartRequest,
  ) => {
    if (
      imageProvider === 'flow' &&
      !recoveringFlow &&
      !(await flowCapacity.verify())
    )
      return
    if (imageProvider !== 'flow' && !configuredProviders.has(imageProvider))
      return
    const saved = await persist()
    if (!saved) return
    const samples = await samplesJob.generateForCatalogDraft(
      {
        id,
        name: displayName,
        sections: saved.draft.sections,
        sampleMode: saved.draft.sampleMode,
      },
      imageProvider,
      restart,
      imageProvider === 'flow' ? executionPlan : undefined,
    )
    if (!samples || samples.length === 0) return
    setLocalSamples(samples)
    setUploading(true)
    try {
      const reserved = await admin.reserveSamples(id, {
        revision: saved.revision,
        count: samples.length,
      })
      await videosApi.uploadCatalogDraftSamples({
        catalogStyleId: id,
        uploads: reserved.uploads,
        uploadOrigin: samplesOriginOf(samplesBaseUrl),
      })
      const withBatch: CatalogStyleContent = {
        ...saved.draft,
        samples: { revision: reserved.samplesRevision, count: samples.length },
      }
      const savedAgain = await admin.saveStyle(
        id,
        { revision: reserved.style.revision, draft: withBatch, position },
        displayName,
      )
      setContent(savedAgain.draft)
      setRevision(savedAgain.revision)
      setSaved({ content: savedAgain.draft, position: savedAgain.position })
    } catch (error) {
      failWith(error)
    } finally {
      setUploading(false)
    }
  }

  const chooseProvider = (imageProvider: ImageProviderId) => {
    setChosenProvider(imageProvider)
    // Multimagen se envía desde Generar, después de verificar las cuentas.
    if (imageProvider === 'flow') return
    if (!generateOnOpen || autoStarted.current) return
    autoStarted.current = true
    void generate(imageProvider)
  }

  // Publicar guarda primero y cierra al terminar: la galería avisa que ya lo
  // ven los usuarios.
  const publish = async () => {
    const saved = await persist()
    if (!saved) return
    try {
      await admin.publishStyle(saved, displayName)
      onClose()
    } catch (error) {
      failWith(error)
    }
  }

  const close = async () => {
    if (locked) return
    if (pasting) {
      if (
        pasteText.trim().length > 0 &&
        !window.confirm(t('create.gemTemplate.discardPasteConfirm'))
      )
        return
      onClose()
      return
    }
    if (dirty) {
      if (problems.length === 0) {
        const saved = await persist()
        if (!saved) return
      } else if (!window.confirm(t('create.catalogAdmin.unsavedConfirm'))) {
        return
      }
    }
    onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) void close()
      }}
    >
      <DialogContent
        className="max-h-[90vh] max-w-3xl overflow-y-auto"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="font-display">
            {style
              ? t('create.catalogAdmin.modalTitle')
              : t('create.catalogAdmin.newTitle')}
          </DialogTitle>
          <DialogDescription>
            {pasting
              ? t('create.catalogAdmin.pasteHint')
              : t('create.catalogAdmin.modalDescription')}
          </DialogDescription>
        </DialogHeader>

        {pasting ? (
          <div className="space-y-3">
            <GemPasteStep
              text={pasteText}
              pending={preparing}
              onTextChange={setPasteText}
              onPrepare={() => void prepare()}
            />
            {prepareErrorKey && (
              <ErrorMessage>{t(prepareErrorKey)}</ErrorMessage>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {warnings.length > 0 && <GemAgentWarnings warnings={warnings} />}

            <CatalogAdminFields
              id={id}
              idEditable={revision === null}
              position={position}
              content={content}
              disabled={locked}
              translating={admin.translating}
              onIdChange={(next) => {
                setIdTouched(true)
                setId(next)
              }}
              onPositionChange={setPosition}
              onContentChange={update}
              onTranslate={() => void translate()}
            />

            <div className="space-y-3">
              <p className="text-xs font-medium">
                {t('create.catalogAdmin.samplesLabel')}
              </p>
              {samplesJob.running ? (
                <SampleGenerationProgress
                  job={samplesJob}
                  sampleIds={PLACEHOLDER_SAMPLE_IDS}
                  name={displayName}
                />
              ) : sampleImages.length > 0 ? (
                <StyleSamplesCarousel
                  key={carouselKey}
                  images={sampleImages}
                  name={displayName}
                />
              ) : (
                <div className="flex aspect-video items-center justify-center rounded-xl border-2 border-dashed border-border text-center">
                  <p className="px-6 font-body text-sm text-muted-foreground">
                    {t('create.customStyles.samplesEmpty')}
                  </p>
                </div>
              )}

              <ImageProviderPicker
                showFlowGenerationControls={recoveringFlow}
                provider={provider}
                disabled={locked || recoveringFlow}
                credits={credits}
                onChoose={chooseProvider}
              />

              {provider === 'flow' && !recoveringFlow && <FlowExecutionMode />}
              {provider === 'flow' && !recoveringFlow && (
                <FlowCapacityNotice
                  count={CATALOG_DRAFT_SAMPLE_COUNT}
                  executionPlan={executionPlan}
                />
              )}
              {provider === 'flow' &&
                samplesJob.errorKey === 'extension.restartRequired' && (
                  <FlowRestartInline
                    disabled={locked}
                    onRestart={(request) => void generate('flow', request)}
                  />
                )}

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
                  {samplesJob.running || uploading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {uploading
                        ? t('create.catalogAdmin.samplesUploading')
                        : t(
                            provider === 'flow'
                              ? 'extension.generatingImages'
                              : 'create.customStyles.generating',
                          )}
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
                {t('create.catalogAdmin.samplesHint')}
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
              {samplesJob.errorKey && (
                <ErrorMessage>{t(samplesJob.errorKey)}</ErrorMessage>
              )}
            </div>

            <GemSectionsEditor
              sections={content.sections}
              disabled={locked}
              onChange={editSection}
            />

            {conflict ? (
              <Alert
                tone="danger"
                title={t('create.catalogAdmin.errors.draftChanged')}
                actions={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={locked}
                    onClick={() => void retryAfterConflict()}
                  >
                    {t('create.catalogAdmin.conflictRetry')}
                  </Button>
                }
              />
            ) : (
              errorKey && (
                <ErrorMessage>
                  {t(errorKey, { detail: errorDetail })}
                </ErrorMessage>
              )
            )}

            {/* Qué falta para guardar o para publicar, a la vista junto a los
                botones: ningún botón apagado sin su porqué. */}
            {problems.length > 0 ? (
              <p className="font-body text-xs text-muted-foreground">
                {t('create.catalogAdmin.cannotSave')}{' '}
                {problems
                  .map((problem) => t(`create.catalogAdmin.problem.${problem}`))
                  .join('; ')}
                .
              </p>
            ) : (
              blockers.length > 0 && (
                <p className="font-body text-xs text-muted-foreground">
                  {t('create.catalogAdmin.publishBlocked')}{' '}
                  {blockers
                    .map((blocker) =>
                      t(`create.catalogAdmin.blocker.${blocker}`),
                    )
                    .join('; ')}
                  .
                </p>
              )
            )}

            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={locked || problems.length > 0 || !dirty}
                onClick={() => void saveAndClose()}
              >
                <Save className="mr-2 h-4 w-4" />
                {t('create.catalogAdmin.saveDraft')}
              </Button>
              <Button
                type="button"
                disabled={locked || problems.length > 0 || blockers.length > 0}
                onClick={() => void publish()}
              >
                <Upload className="mr-2 h-4 w-4" />
                {t('create.catalogAdmin.publishButton')}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
