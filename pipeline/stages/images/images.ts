import { isValidPrompt } from '../../prompts/prompt-limits.ts'
import { buildCharactersBibleBlock } from '../../prompts/reference-characters.ts'
import { VISUAL_STYLES } from '../../prompts/visual-styles.ts'
import { loadPipelineCharacters } from '../../project/characters.ts'
import { isValidFile, sceneImageFile } from '../../project/paths.ts'
import { readScenes, writeScenes } from '../../project/scenes-file.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type { Stage } from '../../runner/stage.ts'
import type {
  FalImageModelId,
  ImageProviderId,
} from '../../types/image-provider.ts'
import type { Scene } from '../../types/scenes.ts'
import { readTextWithRetry } from '../../utils/atomic-fs.ts'
import { limitConcurrency } from '../../utils/concurrency.ts'
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
import { createSceneLlm } from '../shared/llm.ts'
import { regeneratePromptsForRejected } from '../scene-prompts/prompt-writer.ts'
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
    const style = VISUAL_STYLES[context.options.styleId]
    const characters = await loadPipelineCharacters(
      context.paths,
      context.options.characters,
    )
    const promptCharacters = characters.map((character) => ({
      name: character.name,
      description: character.description,
    }))

    // La biblia (con el bloque de personajes) alimenta el fallback de Capa 4,
    // el lock de época y la re-sanitización de prompts.
    const bibleBase = await (context.visualBible ??
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

    // `contentRejected` es telemetría POR INTENTO: se resetea en las que se
    // van a (re)generar para que refleje solo lo que pase ahora.
    let alreadyReady = await idsWithValidImage(context, storedScenes)
    let scenes = applyProjectImageDefaults(
      storedScenes.map((scene) =>
        alreadyReady.has(scene.id)
          ? scene
          : { ...scene, contentRejected: false },
      ),
      context,
    )

    scenes = await generateImages(scenes, generation, new Set())
    await writeScenes(context.paths, scenes)

    // Pasadas de recuperación: reescriben el prompt SOLO de las rechazadas
    // por contenido (las de transporte conservan prompt y tarea pagada).
    for (let pass = 1; pass <= MAX_RECOVERY_PASSES; pass++) {
      context.signal.throwIfAborted()
      alreadyReady = await idsWithValidImage(context, scenes)
      const missing = scenes.filter(
        (scene) => hasText(scene) && !alreadyReady.has(scene.id),
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

      scenes = await regeneratePromptsForRejected(
        scenes,
        (scene) => alreadyReady.has(scene.id),
        pass,
        {
          llm: createSceneLlm(context),
          style,
          fullScript: script,
          visualBible,
          characters: promptCharacters,
          imageTextLanguage,
          signal: context.signal,
        },
      )
      await writeScenes(context.paths, scenes)

      scenes = scenes.map((scene) =>
        alreadyReady.has(scene.id)
          ? scene
          : { ...scene, contentRejected: false },
      )
      scenes = await generateImages(
        applyProjectImageDefaults(scenes, context),
        generation,
        new Set(missing.map((scene) => scene.id)),
      )
      await writeScenes(context.paths, scenes)
    }

    // Gate final: el proyecto no sigue al render con huecos.
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
  const defaultModel =
    options.imageProvider === 'fal'
      ? (options.falModel ?? 'flux-schnell')
      : 'gpt-image-2'
  return scenes.map((scene) => {
    if (scene.imageModel && scene.imageQuality) return scene
    return {
      ...scene,
      imageModel: scene.imageModel ?? defaultModel,
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

function laneEvents(context: CreateVideoContext): ImageLaneEvents {
  const lastProgressAt = new Map<number, number>()
  return {
    onStarted(sceneId) {
      context.emitter.emit({ type: 'scene-image-started', sceneId })
    },
    onReady(sceneId, imagePath) {
      context.emitter.emit({ type: 'scene-image-ready', sceneId, imagePath })
    },
    onFailed(sceneId, code) {
      context.emitter.emit({ type: 'scene-image-failed', sceneId, code })
    },
    onProgress(sceneId, percent, status) {
      // Debounce por escena: 100 escenas × polls cada 5s saturarían el canal.
      const now = Date.now()
      const terminal = percent >= 100 || status === 'completed'
      if (
        !terminal &&
        now - (lastProgressAt.get(sceneId) ?? 0) < PROGRESS_DEBOUNCE_MS
      )
        return
      lastProgressAt.set(sceneId, now)
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
): Promise<Scene[]> {
  const { context, style } = inputs
  const provider = context.options.imageProvider
  const orderedScenes = [...scenes].sort((a, b) => a.id - b.id)

  // Capa 4: ninguna escena con texto llega al proveedor sin prompt válido.
  const safeScenes = scenes.map((scene) => {
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

  const laneOptions: ImageLaneOptions = {
    paths: context.paths,
    signal: context.signal,
    events: laneEvents(context),
    forceRegenerate,
    // La regeneración explícita por escena llega con Library.
    explicitNewImage: new Set(),
  }

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
    return characterLane.provider === 'evolink'
      ? generateScenesWithEvolinkReferences(
          group.scenes,
          references,
          characterLane.apiKey,
          laneOptions,
        )
      : generateScenesWithFalReferences(
          group.scenes,
          references,
          characterLane.apiKey,
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
            falModel:
              (scene.imageModel as FalImageModelId) ??
              context.options.falModel ??
              'flux-schnell',
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
