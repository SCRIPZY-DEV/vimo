import { isValidPrompt } from '../../prompts/prompt-limits.ts'
import { buildCharactersBibleBlock } from '../../prompts/reference-characters.ts'
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
import type { Scene } from '../../types/scenes.ts'
import { readTextWithRetry } from '../../utils/atomic-fs.ts'
import { detectScriptLanguage } from '../../utils/script-language.ts'
import type { CreateVideoContext } from '../context.ts'
import {
  applyFrequencyToCharacters,
  detectScenesWithCharacters,
  needsAlwaysCure,
} from './character-presence.ts'
import type { SceneLlm } from '../shared/llm.ts'
import { createNarrativeReviewLlm } from './narrative-alignment.ts'
import { createCatalogSceneLlm } from '../shared/catalog-llm.ts'
import { hasCatalogPrompt } from '../shared/catalog-prompt.ts'
import {
  recordPromptModelUsed,
  runVerbatimLane,
} from './verbatim/verbatim-lane.ts'
import { createVerbatimPromptPersistence } from './verbatim/verbatim-persistence.ts'
import { describeTreatmentMix } from './verbatim/treatments.ts'
import { guaranteePrompts } from './prompt-writer.ts'
import { directScenes, scenesNeedPlan } from './scene-director.ts'
import { loadOrGenerateVisualBible } from '../shared/visual-bible.ts'

// Fase 4 (port de la Fase «prompts» del orquestador): biblia visual ∥
// (presencia de personajes → director de escenas) → redactor por escena con
// persistencia incremental de scenes.json y un evento por escena.

// No reescribir assets pagados sin pedido explícito. Los rellenos heredados
// sin imagen se reparan; una tarea remota pendiente no pierde su prompt/hash.
// Toda escena cuenta, también la muda (texto vacío): el render exige una
// imagen por escena, así que la pausa se ilustra desde la narración vecina.
async function catalogPendingIds(
  context: CreateVideoContext,
  scenes: Scene[],
): Promise<Set<number>> {
  const ids = new Set<number>()
  const style = resolveProjectStyle(context.options)
  for (const scene of scenes) {
    if (
      context.regenerateSceneIds?.size &&
      !context.regenerateSceneIds.has(scene.id)
    )
      continue
    if (hasCatalogPrompt(scene, style)) continue
    if (
      !context.regenerateSceneIds?.has(scene.id) &&
      (await isValidFile(sceneImageFile(context.paths, scene.id)))
    )
      continue
    if (scene.imageTask && !context.regenerateSceneIds?.has(scene.id))
      throw new PipelineFailure(
        'catalog_prompt_pending_image',
        'a legacy filler prompt has a paid image task; review it before rewriting',
      )
    ids.add(scene.id)
  }
  return ids
}

export const scenePromptsStage: Stage<CreateVideoContext> = {
  id: 'scene-prompts',

  async skip(context) {
    const scenes = await readScenes(context.paths)
    if (!scenes) return false
    if (!context.options.customStyle)
      return (await catalogPendingIds(context, scenes)).size === 0
    // Una escena cuenta como lista solo con prompt VÁLIDO, tenga texto o no.
    return scenes.every((scene) => isValidPrompt(scene.imagePrompt))
  },

  async run(context) {
    let scenes = await readScenes(context.paths)
    if (!scenes)
      throw new PipelineFailure(
        'scenes_missing',
        'scene-prompts needs scenes.json',
      )

    const script = await readScript(context)

    // ── Carril VERBATIM (estilo propio, ADR-0016) ──
    // La gema del usuario manda entera y sin envoltorio: acá se SALTEAN la
    // biblia visual, el director de escenas y el clasificador de presencia
    // (paridad con el origen — el estilo trae el ritmo, el guion completo es
    // el contexto, y la presencia del sujeto la informa el propio motor). El
    // carril de la casa queda byte-idéntico más abajo.
    const customStyle = context.options.customStyle
    if (customStyle) {
      // Los prompts se van a disco LOTE A LOTE: si el job muere a mitad —o la
      // UI lo cancela porque el modelo da errores (ADR-0028)— lo ya pagado
      // queda escrito y el reintento solo pide lo que falta. Antes se perdía
      // todo, porque la única escritura era la de acá abajo.
      const persistence = createVerbatimPromptPersistence(context, scenes)
      const lane = await runVerbatimLane(context, scenes, script, {
        onPrompts: persistence.onPrompts,
      }).finally(() => persistence.flush())
      await writeScenesOwned(
        context.paths,
        lane.scenes,
        context.regenerateSceneIds,
      )
      await recordPromptModelUsed(context, lane)
      for (const scene of lane.scenes) {
        if (!lane.written.has(scene.id)) continue
        context.emitter.emit({
          type: 'scene-prompt-ready',
          scene: await toSceneSummary(context.paths, scene),
        })
      }
      // El carril temporal exige completar y revisar todas las escenas antes
      // de comprar imágenes; no recurre a prompts de relleno.
      if (lane.missing.length > 0)
        context.emitter.emit({
          type: 'log',
          level: 'warn',
          message: `${lane.missing.length} scene(s) ended without a verbatim prompt: ${lane.missing.join(', ')}`,
        })
      // El reparto de una gema con dinamismo (spec §5.3): solo diagnóstico,
      // con las claves que el log de soporte ya sube (type, level, message).
      if (customStyle.sections?.dynamism?.trim() && lane.written.size > 0)
        context.emitter.emit({
          type: 'log',
          level: 'info',
          message: describeTreatmentMix(
            lane.scenes,
            lane.written,
            lane.scenesWithSubject,
          ),
        })
      return undefined
    }

    context.signal.throwIfAborted()
    const pendingIds = await catalogPendingIds(context, scenes)
    scenes = scenes.map((scene) =>
      pendingIds.has(scene.id)
        ? {
            ...scene,
            imagePrompt: '',
            promptIsFallback: false,
            // El plan adjunto a un relleno heredado también pudo ser ciego.
            direction: scene.promptIsFallback ? undefined : scene.direction,
          }
        : scene,
    )
    await writeScenesOwned(context.paths, scenes, context.regenerateSceneIds)
    const llm = createCatalogSceneLlm(context)

    // La biblia normalmente ya viene corriendo desde la Fase 1 (hoisting);
    // con audio propio el guion recién existe tras la transcripción → camino
    // tardío. No se awaitea todavía: ni la presencia ni el director la usan.
    const bibleTask = (context.visualBible ??= loadOrGenerateVisualBible(
      context,
      script,
    ))
    void bibleTask.catch(() => undefined)

    const characters = await loadPipelineCharacters(
      context.paths,
      context.options.characters,
    )
    const promptCharacters = characters.map((character) => ({
      name: character.name,
      description: character.description,
    }))

    let currentScenes = await resolveCharacterPresence(
      context,
      llm,
      scenes,
      characters.length,
    )

    const style = resolveProjectStyle(context.options)
    const imageTextLanguage = detectScriptLanguage(script)

    // Director de escenas: UNA pasada que planifica el video. Idempotente:
    // un plan persistido completo se reusa. La escena muda no se planifica a
    // propósito (no hay narración que dirigir): el redactor la ilustra como
    // pausa desde la ventana vecina, sin SCENE PLAN.
    const toDirect = currentScenes.filter((scene) => pendingIds.has(scene.id))
    if (scenesNeedPlan(toDirect)) {
      context.signal.throwIfAborted()
      context.emitter.emit({
        type: 'log',
        level: 'info',
        message: 'planning the visual variety of the video (scene director)',
      })
      const directed = await directScenes(llm, toDirect, script, {
        styleId: style.id,
        isStickmanStyle: style.id === 'pov_stickman',
        characters: promptCharacters,
        imageTextLanguage,
        signal: context.signal,
        onLog: (message) =>
          context.emitter.emit({ type: 'log', level: 'info', message }),
      })
      const directions = new Map(directed.map((scene) => [scene.id, scene]))
      currentScenes = currentScenes.map(
        (scene) => directions.get(scene.id) ?? scene,
      )
      context.signal.throwIfAborted()
      await writeScenesOwned(
        context.paths,
        currentScenes,
        context.regenerateSceneIds,
      )
    }

    // Recién acá se cobra la biblia; el bloque de identidad de los personajes
    // se le anexa (la referencia de imagen fija la cara; el texto, el resto).
    const bibleBase = await bibleTask
    context.signal.throwIfAborted()
    const characterBlock = buildCharactersBibleBlock(promptCharacters)
    const visualBible = characterBlock
      ? `${bibleBase ?? ''}${characterBlock}`.trim()
      : bibleBase

    // Persistencia incremental: tras cada escena con prompt nuevo, el buffer
    // se escribe entero — si el job muere a mitad, lo hecho queda en disco.
    const buffer = currentScenes.map((scene) => ({ ...scene }))
    let persistence = Promise.resolve()
    const total = currentScenes.length
    let ready = total - pendingIds.size
    context.emitter.emit({ type: 'scene-prompts-progress', ready, total })
    currentScenes = await guaranteePrompts(currentScenes, {
      llm,
      reviewLlm: createNarrativeReviewLlm(context),
      style,
      fullScript: script,
      visualBible,
      characters: promptCharacters,
      imageTextLanguage,
      signal: context.signal,
      sceneIds: pendingIds,
      // Desde el editor la presencia por escena la marcó el usuario.
      promoteUnmarkedProtagonist: !context.regenerateSceneIds,
      async onSceneProcessed(scene) {
        persistence = persistence.then(async () => {
          context.signal.throwIfAborted()
          const index = buffer.findIndex((item) => item.id === scene.id)
          if (index >= 0) buffer[index] = scene
          await writeScenesOwned(
            context.paths,
            buffer,
            context.regenerateSceneIds,
          )
          context.emitter.emit({
            type: 'scene-prompt-ready',
            scene: await toSceneSummary(context.paths, scene),
          })
          ready++
          context.emitter.emit({ type: 'scene-prompts-progress', ready, total })
        })
        await persistence
      },
    })
    context.signal.throwIfAborted()
    await writeScenesOwned(
      context.paths,
      currentScenes,
      context.regenerateSceneIds,
    )

    return undefined
  },
}

async function readScript(context: CreateVideoContext): Promise<string> {
  if (!(await isValidFile(context.paths.scriptFile))) return ''
  return readTextWithRetry(context.paths.scriptFile)
}

// Presencia de los personajes por escena (port de prepararPersonaje): la
// FRECUENCIA elegida manda sobre todo el video; sin frecuencia explícita, el
// clasificador por sujeto/acción + rescate. La presencia persistida es
// autoritativa en re-corridas (salvo la cura del caso "always" roto).
async function resolveCharacterPresence(
  context: CreateVideoContext,
  llm: SceneLlm,
  scenes: Scene[],
  characterCount: number,
): Promise<Scene[]> {
  if (characterCount === 0) return scenes

  const characterIndexes = new Set<number>()
  for (let index = 0; index < characterCount; index++)
    characterIndexes.add(index)
  const frequency = context.options.characterFrequency
  const alreadyClassified = scenes.some(
    (scene) => scene.charactersPresent !== undefined,
  )

  let marked: Scene[]
  if (!alreadyClassified && frequency) {
    marked = applyFrequencyToCharacters(
      scenes.map((scene) => ({
        ...scene,
        charactersPresent: scene.charactersPresent ?? [],
      })),
      characterIndexes,
      frequency,
    )
  } else if (!alreadyClassified) {
    const presence = await detectScenesWithCharacters(
      llm,
      scenes,
      (context.options.characters ?? []).map((character) => ({
        name: character.name,
      })),
    )
    marked = scenes.map((scene) => ({
      ...scene,
      charactersPresent: presence.get(scene.id) ?? [],
    }))
    // Clasificador en 0 escenas: sin rescate el video ENTERO saldría sin el
    // personaje — aparece en todas las escenas con texto.
    const anyPresent = marked.some(
      (scene) => (scene.charactersPresent ?? []).length > 0,
    )
    if (!anyPresent)
      marked = applyFrequencyToCharacters(marked, characterIndexes, 'always')
  } else {
    marked = scenes.map((scene) =>
      scene.charactersPresent !== undefined
        ? scene
        : { ...scene, charactersPresent: [] },
    )
    if (needsAlwaysCure(marked, characterIndexes, frequency ?? 'balanced'))
      marked = applyFrequencyToCharacters(marked, characterIndexes, 'always')
  }

  const withCharacter = marked.filter(
    (scene) => (scene.charactersPresent ?? []).length > 0,
  ).length
  context.emitter.emit({
    type: 'log',
    level: 'info',
    message: `reference character present in ${withCharacter} of ${marked.length} scene(s)`,
  })
  context.signal.throwIfAborted()
  await writeScenesOwned(context.paths, marked, context.regenerateSceneIds)
  return marked
}
