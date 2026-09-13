import { isValidPrompt } from '../../prompts/prompt-limits.ts'
import { buildCharactersBibleBlock } from '../../prompts/reference-characters.ts'
import { VISUAL_STYLES } from '../../prompts/visual-styles.ts'
import { resolveProjectStyle } from '../shared/project-style.ts'
import { loadPipelineCharacters } from '../../project/characters.ts'
import { isValidFile, sceneImageFile } from '../../project/paths.ts'
import {
  readScenes,
  toSceneSummary,
  writeScenesOwned,
} from '../../project/scenes-file.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type { Stage } from '../../runner/stage.ts'
import {
  IMAGE_MODEL,
  type ImageProviderId,
} from '../../types/image-provider.ts'
import type { Scene } from '../../types/scenes.ts'
import { videoFormatOf } from '../../types/video-format.ts'
import { readTextWithRetry } from '../../utils/atomic-fs.ts'
import { limitConcurrency } from '../../utils/concurrency.ts'
import { isInsufficientCreditsFailure } from '../../utils/insufficient-credits.ts'
import { detectScriptLanguage } from '../../utils/script-language.ts'
import {
  deriveEraFromBible,
  eraEscapeWindow,
  neutralizeEraInBible,
} from '../../utils/story-era.ts'
import type { CreateVideoContext } from '../context.ts'
import {
  anchorNormalRealism,
  buildDeterministicFallbackPrompt,
} from '../scene-prompts/fallback-prompt.ts'
import { createCatalogSceneLlm } from '../shared/catalog-llm.ts'
import { hasCatalogPrompt } from '../shared/catalog-prompt.ts'
import { regeneratePromptsForRejected } from '../scene-prompts/prompt-writer.ts'
import {
  CONTENT_POLICY_RETRY_NOTE,
  recordPromptModelUsed,
  runVerbatimLane,
} from '../scene-prompts/verbatim/verbatim-lane.ts'
import { loadOrGenerateVisualBible } from '../shared/visual-bible.ts'
import {
  generateScenesWithEvolinkReferences,
  generateScenesWithFalReferences,
  type CharacterReference,
} from './character-lane.ts'
import { IMAGE_LANES } from './lanes.ts'
import type { ImageLaneEvents, ImageLaneOptions, LaneResult } from './lane.ts'
import { sanitizeFinalPrompt } from '../shared/prompt-safety.ts'

// Fase 5 (port de la Fase «imágenes» del orquestador + images.ts): dispatcher
// con chokepoint único de seguridad, carril normal y carril de personaje en
// paralelo, cache por archivo y hasta MAX_RECOVERY_PASSES pasadas que
// reescriben el prompt SOLO de las rechazadas por contenido. Gate final: si
// queda una escena sin imagen el job falla con sus ids — la UI ya pintó cada
// fallo con scene-image-failed y el usuario reintenta.

const MAX_RECOVERY_PASSES = 4
const PROGRESS_DEBOUNCE_MS = 250

function hasText(scene: Scene): boolean {
  return (scene.text?.trim().length ?? 0) > 0
}

// Qué prompts reescribe una pasada de recuperación: los rechazados por
// contenido o inválidos, siempre que la escena siga sin imagen. Es el mismo
// predicado en los dos carriles; vive acá para conocer los ids ANTES de
// reescribir y anunciarlos a la UI.
function needsPromptRewrite(scene: Scene, ready: boolean): boolean {
  if (ready) return false
  return scene.contentRejected === true || !isValidPrompt(scene.imagePrompt)
}

async function idsWithValidImage(
  context: CreateVideoContext,
  scenes: Scene[],
): Promise<Set<number>> {
  const ids = new Set<number>()
  for (const scene of scenes) {
    if (await isValidFile(sceneImageFile(context.paths, scene.id)))
      ids.add(scene.id)
  }
  return ids
}

export const imagesStage: Stage<CreateVideoContext> = {
  id: 'images',

  async skip(context) {
    // Regeneración selectiva: las escenas objetivo se re-generan aunque su
    // imagen exista — la fase nunca se saltea.
    if (context.regenerateSceneIds?.size) return false

    const scenes = await readScenes(context.paths)
    if (!scenes) return false
    const ready = await idsWithValidImage(context, scenes)
    // Toda escena con texto (las que llevan prompt) tiene su imagen.
    return scenes.every((scene) => !hasText(scene) || ready.has(scene.id))
  },

  async run(context) {
    const storedScenes = await readScenes(context.paths)
    if (!storedScenes)
      throw new PipelineFailure('scenes_missing', 'images needs scenes.json')

    const script = (await isValidFile(context.paths.scriptFile))
      ? await readTextWithRetry(context.paths.scriptFile)
      : ''
    const style = resolveProjectStyle(context.options)
    const characters = await loadPipelineCharacters(
      context.paths,
      context.options.characters,
    )
    const promptCharacters = characters.map((character) => ({
      name: character.name,
      description: character.description,
    }))

    // La biblia (con el bloque de personajes) alimenta el fallback de Capa 4,
    // el lock de época y la re-sanitización de prompts. Con estilo propio NO
    // se genera (paridad con el carril verbatim: la gema es el único contexto
    // visual; el fallback y la sanitización aceptan biblia ausente).
    const bibleBase = context.options.customStyle
      ? undefined
      : await (context.visualBible ??
          loadOrGenerateVisualBible(context, script))
    const characterBlock = buildCharactersBibleBlock(promptCharacters)
    const visualBible = neutralizeEraInBible(
      characterBlock ? `${bibleBase ?? ''}${characterBlock}`.trim() : bibleBase,
      script || storedScenes.map((scene) => scene.text).join(' '),
    )
    const imageTextLanguage = detectScriptLanguage(script)

    const generation: GenerationInputs = {
      context,
      style,
      characters,
      promptCharacters,
      visualBible,
      script,
      imageTextLanguage,
    }

    // Regeneración selectiva (ADR-0014): un objetivo conserva su imagen
    // VIEJA en disco hasta que sale la nueva, así que "tener archivo" no
    // alcanza — cuenta como lista recién cuando este job produjo una nueva
    // (`produced`, alimentado por onReady; un cache-hit es imposible para un
    // objetivo forzado). Sin esto, un objetivo que falla nunca entra a las
    // pasadas de recuperación, como sí pasa en el origen.
    const targets = new Set(context.regenerateSceneIds ?? [])
    const produced = new Set<number>()
    const events = laneEvents(context, produced)
    const isReady = (sceneId: number, withFile: Set<number>) =>
      withFile.has(sceneId) && (!targets.has(sceneId) || produced.has(sceneId))

    // `contentRejected` es telemetría POR INTENTO: se resetea en las que se
    // van a (re)generar para que refleje solo lo que pase ahora.
    let alreadyReady = await idsWithValidImage(context, storedScenes)
    let scenes = applyProjectImageDefaults(
      storedScenes.map((scene) =>
        isReady(scene.id, alreadyReady)
          ? scene
          : { ...scene, contentRejected: false },
      ),
      context,
    )

    // En modo regeneración selectiva los objetivos se fuerzan desde la
    // primera pasada; en Create el set vacío deja todo el cache intacto.
    scenes = await generateImages(scenes, generation, targets, events)
    await writeScenesOwned(context.paths, scenes, context.regenerateSceneIds)

    // Pasadas de recuperación: reescriben el prompt SOLO de las rechazadas
    // por contenido (las de transporte conservan prompt y tarea pagada).
    for (let pass = 1; pass <= MAX_RECOVERY_PASSES; pass++) {
      context.signal.throwIfAborted()
      alreadyReady = await idsWithValidImage(context, scenes)
      const missing = scenes.filter(
        (scene) => hasText(scene) && !isReady(scene.id, alreadyReady),
      )
      if (missing.length === 0) break

      const rejectedCount = missing.filter(
        (scene) => scene.contentRejected,
      ).length
      context.emitter.emit({
        type: 'log',
        level: 'info',
        message: `${missing.length} scene(s) without image${rejectedCount > 0 ? ` (${rejectedCount} rejected by content policy, rewriting their prompts)` : ', retrying with the same prompt'} — pass ${pass}/${MAX_RECOVERY_PASSES}`,
      })

      const readyNow = alreadyReady
      const toRewrite = scenes.filter((scene) =>
        needsPromptRewrite(scene, isReady(scene.id, readyNow)),
      )
      // La UI devuelve la fila de prompts a «en curso» con este evento; la
      // fase NO se reabre en el runner (ADR-0013: acá no se emite stage-*).
      if (toRewrite.length > 0)
        context.emitter.emit({
          type: 'images-recovery-pass',
          kind: 'rewrite',
          sceneIds: toRewrite.map((scene) => scene.id),
          pass,
          maxPasses: MAX_RECOVERY_PASSES,
        })

      if (context.options.customStyle) {
        // E34 — Con estilo propio, el prompt de una escena SOLO puede
        // escribirlo su propio carril: el re-escritor de la casa escribe en
        // el estilo del catálogo, y usarlo acá fue exactamente el bug del
        // origen (2026-08-18) — 7 de 15 escenas rescatadas en estilo
        // «normal», video con estilos mezclados. Se vacía el prompt de las
        // que hay que reescribir (el mismo gesto del flujo de regenerar) y
        // la nota de content-policy viaja pegada al fragmento. Si el carril
        // propio tampoco puede, la escena queda sin imagen y la corrida
        // termina con el aviso honesto — jamás con otro estilo.
        if (toRewrite.length > 0) {
          const retryNotes = new Map<number, string>()
          for (const scene of toRewrite) {
            if (scene.contentRejected === true)
              retryNotes.set(scene.id, CONTENT_POLICY_RETRY_NOTE)
          }
          const rewriteIds = new Set(toRewrite.map((scene) => scene.id))
          const cleared = scenes.map((scene) =>
            rewriteIds.has(scene.id)
              ? { ...scene, imagePrompt: '', promptIsFallback: false }
              : scene,
          )
          const lane = await runVerbatimLane(context, cleared, script, {
            retryNotes,
          })
          await recordPromptModelUsed(context, lane)
          scenes = lane.scenes
          // El carril entrega los prompts al cerrar el lote: se reemiten
          // acá los reescritos (las `missing` quedan sin prompt y las cubre
          // el fallback de generateImages, como hasta ahora).
          for (const scene of lane.scenes) {
            if (!lane.written.has(scene.id)) continue
            context.emitter.emit({
              type: 'scene-prompt-ready',
              scene: await toSceneSummary(context.paths, scene),
            })
          }
        }
      } else {
        scenes = await regeneratePromptsForRejected(
          scenes,
          (scene) => isReady(scene.id, readyNow),
          pass,
          {
            llm: createCatalogSceneLlm(context),
            style,
            fullScript: script,
            visualBible,
            characters: promptCharacters,
            imageTextLanguage,
            signal: context.signal,
            onSceneProcessed: async (scene) => {
              context.emitter.emit({
                type: 'scene-prompt-ready',
                scene: await toSceneSummary(context.paths, scene),
              })
            },
          },
        )
      }
      await writeScenesOwned(context.paths, scenes, context.regenerateSceneIds)

      scenes = scenes.map((scene) =>
        isReady(scene.id, readyNow)
          ? scene
          : { ...scene, contentRejected: false },
      )
      // Cierra el `rewrite` (si lo hubo) y anuncia el reintento de imágenes.
      context.emitter.emit({
        type: 'images-recovery-pass',
        kind: 'retry',
        sceneIds: missing.map((scene) => scene.id),
        pass,
        maxPasses: MAX_RECOVERY_PASSES,
      })
      scenes = await generateImages(
        applyProjectImageDefaults(scenes, context),
        generation,
        new Set(missing.map((scene) => scene.id)),
        events,
      )
      await writeScenesOwned(context.paths, scenes, context.regenerateSceneIds)
    }

    // Gate final: el proyecto no sigue al render con huecos. Un objetivo de
    // regeneración que no salió NO es un hueco (su imagen vieja sigue siendo
    // válida para el render): el subcomando lo reporta en `failed` y la UI
    // lo muestra por escena.
    const ready = await idsWithValidImage(context, scenes)
    const stillMissing = scenes
      .filter((scene) => hasText(scene) && !ready.has(scene.id))
      .map((scene) => scene.id)
      .sort((a, b) => a - b)
    if (stillMissing.length > 0)
      throw new PipelineFailure(
        'images_incomplete',
        `scenes without image after ${MAX_RECOVERY_PASSES} passes: ${stillMissing.join(', ')}`,
      )

    return undefined
  },
}

// Modelo/calidad del proyecto persistidos por escena cuando no tienen
// override (una regeneración futura recuerda la elección).
function applyProjectImageDefaults(
  scenes: Scene[],
  context: CreateVideoContext,
): Scene[] {
  const options = context.options
  return scenes.map((scene) => {
    if (scene.imageModel && scene.imageQuality) return scene
    return {
      ...scene,
      imageModel: scene.imageModel ?? IMAGE_MODEL,
      imageQuality: scene.imageQuality ?? options.imageQuality,
    }
  })
}

interface GenerationInputs {
  context: CreateVideoContext
  style: (typeof VISUAL_STYLES)[keyof typeof VISUAL_STYLES]
  characters: { name: string; description: string; imageDataUri?: string }[]
  promptCharacters: { name: string; description: string }[]
  visualBible: string | undefined
  script: string
  imageTextLanguage: string
}

// `produced` acumula las escenas que salieron con imagen en este job. El
// motivo técnico de cada fallo viaja en el evento y se loguea en warn: la
// UI muestra el código traducido y la terminal/harness conservan el detalle.
function laneEvents(
  context: CreateVideoContext,
  produced: Set<number>,
): ImageLaneEvents {
  const lastProgressAt = new Map<number, number>()
  // Último % emitido por escena: el avance de una imagen es monótono por
  // construcción (regla del origen) — un reintento del carril o un poll sin
  // `progress` no la devuelven a cero.
  const lastPercent = new Map<number, number>()
  return {
    onStarted(sceneId, attempt) {
      // Solo el primer intento de cada pasada: los reintentos internos del
      // carril no reinician la celda (spinner y % siguen donde estaban).
      if (attempt > 1) return
      lastPercent.delete(sceneId)
      context.emitter.emit({ type: 'scene-image-started', sceneId })
    },
    onReady(sceneId, imagePath) {
      produced.add(sceneId)
      context.emitter.emit({ type: 'scene-image-ready', sceneId, imagePath })
    },
    onFailed(sceneId, code, detail) {
      context.emitter.emit({
        type: 'scene-image-failed',
        sceneId,
        code,
        ...(detail ? { detail } : {}),
      })
      context.emitter.emit({
        type: 'log',
        level: 'warn',
        message: `scene ${sceneId} image failed: ${code}${detail ? ` — ${detail}` : ''}`,
      })
    },
    onProgress(sceneId, percent, status) {
      const terminal = percent >= 100 || status === 'completed'
      // Solo si subió: un valor igual o menor al último emitido se descarta.
      const previous = lastPercent.get(sceneId) ?? -1
      if (!terminal && percent <= previous) return
      // Debounce por escena: 100 escenas × polls cada 5s saturarían el canal.
      const now = Date.now()
      if (
        !terminal &&
        now - (lastProgressAt.get(sceneId) ?? 0) < PROGRESS_DEBOUNCE_MS
      )
        return
      lastProgressAt.set(sceneId, now)
      lastPercent.set(sceneId, Math.max(previous, percent))
      context.emitter.emit({
        type: 'scene-image-progress',
        sceneId,
        percent,
        status,
      })
    },
  }
}

// Port de generarImagenes: Capa 4 (fallback para prompts inválidos) →
// chokepoint de seguridad → carriles en paralelo → merge por id.
async function generateImages(
  scenes: Scene[],
  inputs: GenerationInputs,
  forceRegenerate: Set<number>,
  events: ImageLaneEvents,
): Promise<Scene[]> {
  const { context, style } = inputs
  context.signal.throwIfAborted()
  if (!context.options.customStyle) {
    const invalidIds: number[] = []
    for (const scene of scenes) {
      if (!hasText(scene) || hasCatalogPrompt(scene, style)) continue
      if (
        !forceRegenerate.has(scene.id) &&
        (await isValidFile(sceneImageFile(context.paths, scene.id)))
      )
        continue
      invalidIds.push(scene.id)
    }
    if (invalidIds.length > 0)
      throw new PipelineFailure(
        'catalog_prompts_incomplete',
        'image generation blocked for scenes without narrative prompts: ' +
          invalidIds.join(', '),
      )
  }
  const orderedScenes = [...scenes].sort((a, b) => a.id - b.id)

  // Capa 4: ninguna escena con texto llega al proveedor sin prompt válido.
  const safeScenes = scenes.map((scene) => {
    // Catálogo jamás llega al fallback de compatibilidad de Mi estilo.
    if (!context.options.customStyle) return scene
    if (!hasText(scene) || isValidPrompt(scene.imagePrompt)) return scene
    return {
      ...scene,
      imagePrompt: anchorNormalRealism(
        buildDeterministicFallbackPrompt(
          scene,
          inputs.visualBible,
          style,
          orderedScenes,
          inputs.promptCharacters,
          inputs.imageTextLanguage,
        ),
        style,
      ),
      promptIsFallback: true,
    }
  })

  // Capa 3: scrub final + cláusulas duras (época, diagrama diegético,
  // texto-en-imagen, anonimato) — único chokepoint antes de los proveedores.
  const globalEra = deriveEraFromBible(inputs.visualBible)
  const sceneTexts = orderedScenes.map((scene) => ({
    id: scene.id,
    text: scene.text,
  }))
  const finalScenes = safeScenes.map((scene) => {
    if (!isValidPrompt(scene.imagePrompt)) return scene
    // Con pedido manual del usuario el plan del director NO aplica.
    const isDiagram =
      !scene.userPrompt?.trim() && scene.direction?.treatment === 'diagram'
    return {
      ...scene,
      imagePrompt: sanitizeFinalPrompt(scene.imagePrompt, {
        era: globalEra,
        sceneText: scene.userPrompt?.trim() || scene.text || '',
        window: eraEscapeWindow(sceneTexts, scene.id),
        isDiagram,
        styleId: style.id,
      }),
    }
  })

  // Saldo agotado en cualquier carril: se cortan los que siguen en vuelo (no
  // piden más imágenes que fallarían igual) y el job cae con el código; lo
  // ya bajado queda en disco como cache-hit para reanudar (ADR-0029).
  const creditsAbort = new AbortController()
  const laneOptions: ImageLaneOptions = {
    customStyle: Boolean(context.options.customStyle),
    paths: context.paths,
    signal: AbortSignal.any([context.signal, creditsAbort.signal]),
    events,
    forceRegenerate,
    // ÚNICO bypass de la cosecha de una tarea ya pagada: los ids que el
    // usuario pidió regenerar explícitamente desde el editor (ADR-0014).
    // Las pasadas de recuperación de Create siguen cosechando `imageTask`.
    explicitNewImage: new Set(context.regenerateSceneIds ?? []),
  }

  try {
    return await dispatchLanes(finalScenes, inputs, laneOptions)
  } catch (error) {
    if (isInsufficientCreditsFailure(error)) creditsAbort.abort()
    throw error
  }
}

// Carril normal y carril de personaje en paralelo, con degradación de las
// escenas de personaje que no salieron con referencia al carril normal.
async function dispatchLanes(
  finalScenes: Scene[],
  inputs: GenerationInputs,
  laneOptions: ImageLaneOptions,
): Promise<Scene[]> {
  const { context } = inputs
  const provider = context.options.imageProvider

  // Carril de personaje: solo los personajes CON foto (los sin foto ya viajan
  // inyectados por texto). Sin ninguna foto → todo normal.
  const photoIndexes = new Set(
    inputs.characters
      .map((character, index) => (character.imageDataUri ? index : -1))
      .filter((index) => index >= 0),
  )
  if (photoIndexes.size === 0)
    return mergeResults(
      finalScenes,
      await dispatchNormal(finalScenes, provider, inputs, laneOptions),
    )

  const characterLane = resolveCharacterLane(provider, context)
  if (!characterLane) {
    context.emitter.emit({
      type: 'log',
      level: 'warn',
      message:
        'reference characters have photos but the image provider key is missing — generating without references',
    })
    return mergeResults(
      finalScenes,
      await dispatchNormal(finalScenes, provider, inputs, laneOptions),
    )
  }

  // Agrupar por CONJUNTO de fotos presentes: [0], [1] y [0,1] van cada uno
  // a su llamada con sus referencias.
  const withoutPhoto: Scene[] = []
  const groups = new Map<string, { indexes: number[]; scenes: Scene[] }>()
  for (const scene of finalScenes) {
    const indexes = (scene.charactersPresent ?? []).filter((index) =>
      photoIndexes.has(index),
    )
    if (indexes.length === 0) {
      withoutPhoto.push(scene)
      continue
    }
    const signature = [...indexes].sort((a, b) => a - b).join(',')
    const group = groups.get(signature) ?? { indexes, scenes: [] }
    group.scenes.push(scene)
    groups.set(signature, group)
  }

  // TODO al mismo tiempo: los carriles tienen semáforos separados, así que
  // lanzarlos juntos no suma requests por encima del límite de cada uno.
  const characterTasks = [...groups.values()].map((group) => {
    const references: CharacterReference[] = group.indexes.map((index) => ({
      name: inputs.characters[index].name,
      imageDataUri: inputs.characters[index].imageDataUri!,
    }))
    const format = videoFormatOf(inputs.context.options)
    return characterLane.provider === 'evolink'
      ? generateScenesWithEvolinkReferences(
          group.scenes,
          references,
          characterLane.apiKey,
          format,
          laneOptions,
        )
      : generateScenesWithFalReferences(
          group.scenes,
          references,
          characterLane.apiKey,
          format,
          laneOptions,
        )
  })
  const normalTask = dispatchNormal(withoutPhoto, provider, inputs, laneOptions)

  const [characterResults, normalResults] = await Promise.all([
    Promise.all(characterTasks).then((groupsResults) => groupsResults.flat()),
    normalTask,
  ])

  // Degradación elegante: las escenas de personaje que no salieron con
  // referencia van al carril normal → nunca quedan en blanco.
  const characterFailures = characterResults
    .filter((result) => !result.imageReady)
    .map((result) => result.scene)
  const rescued =
    characterFailures.length > 0
      ? await dispatchNormal(characterFailures, provider, inputs, laneOptions)
      : []

  return mergeResults(finalScenes, [
    ...characterResults.filter((result) => result.imageReady),
    ...normalResults,
    ...rescued,
  ])
}

function resolveCharacterLane(
  provider: ImageProviderId,
  context: CreateVideoContext,
): { provider: ImageProviderId; apiKey: string } | null {
  const falKey = context.job.apiKeys.fal
  const evolinkKey = context.job.apiKeys.evolink
  // El proveedor del proyecto primero; si no tiene clave, el otro.
  if (provider === 'evolink' && evolinkKey)
    return { provider: 'evolink', apiKey: evolinkKey }
  if (provider === 'fal' && falKey) return { provider: 'fal', apiKey: falKey }
  if (falKey) return { provider: 'fal', apiKey: falKey }
  if (evolinkKey) return { provider: 'evolink', apiKey: evolinkKey }
  return null
}

async function dispatchNormal(
  scenes: Scene[],
  provider: ImageProviderId,
  inputs: GenerationInputs,
  laneOptions: ImageLaneOptions,
): Promise<LaneResult[]> {
  if (scenes.length === 0) return []

  const { context } = inputs
  const lane = IMAGE_LANES[provider]
  const apiKey = lane.apiKeyOf(context.job.apiKeys)
  if (!apiKey)
    throw new PipelineFailure(
      'missing_api_key',
      `${provider} API key is missing`,
    )

  const limit = limitConcurrency(lane.concurrency)
  return Promise.all(
    scenes.map((scene) =>
      limit(() =>
        lane.generateScene(
          scene,
          {
            apiKey,
            qualityOption: scene.imageQuality ?? context.options.imageQuality,
            format: videoFormatOf(context.options),
          },
          laneOptions,
        ),
      ),
    ),
  )
}

// Merge por id preservando el orden original; una escena sin resultado
// conserva su versión sanitizada.
function mergeResults(scenes: Scene[], results: LaneResult[]): Scene[] {
  const byId = new Map<number, Scene>()
  for (const result of results) byId.set(result.scene.id, result.scene)
  return scenes.map((scene) => byId.get(scene.id) ?? scene)
}
