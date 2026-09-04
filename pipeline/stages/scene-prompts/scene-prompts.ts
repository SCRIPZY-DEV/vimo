import { isValidPrompt } from '../../prompts/prompt-limits.ts'
import { buildCharactersBibleBlock } from '../../prompts/reference-characters.ts'
import { resolveProjectStyle } from '../shared/project-style.ts'
import { loadPipelineCharacters } from '../../project/characters.ts'
import { isValidFile } from '../../project/paths.ts'
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
import { createSceneLlm, type SceneLlm } from '../shared/llm.ts'
import {
  recordPromptModelUsed,
  runVerbatimLane,
} from './verbatim/verbatim-lane.ts'
import { guaranteePrompts } from './prompt-writer.ts'
import { directScenes, scenesNeedPlan } from './scene-director.ts'
import { loadOrGenerateVisualBible } from '../shared/visual-bible.ts'

// Fase 4 (port de la Fase «prompts» del orquestador): biblia visual ∥
// (presencia de personajes → director de escenas) → redactor por escena con
// persistencia incremental de scenes.json y un evento por escena.

function hasText(scene: Scene): boolean {
  return (scene.text?.trim().length ?? 0) > 0
}

export const scenePromptsStage: Stage<CreateVideoContext> = {
  id: 'scene-prompts',

  async skip(context) {
    const scenes = await readScenes(context.paths)
    if (!scenes) return false
    // Una escena cuenta como lista solo con prompt VÁLIDO; las sin texto no
    // necesitan prompt.
    return scenes.every(
      (scene) => !hasText(scene) || isValidPrompt(scene.imagePrompt),
    )
  },

  async run(context) {
    const scenes = await readScenes(context.paths)
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
    if (context.options.customStyle) {
      const lane = await runVerbatimLane(context, scenes, script)
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
      // Faltantes declaradas: no se rellenan acá con el redactor de la casa
      // (E34 — el estilo del usuario nunca se pisa). La Capa 4 de la fase de
      // imágenes cubre el hueco con su fallback determinístico si hace falta.
      if (lane.missing.length > 0)
        context.emitter.emit({
          type: 'log',
          level: 'warn',
          message: `${lane.missing.length} scene(s) ended without a verbatim prompt: ${lane.missing.join(', ')}`,
        })
      return undefined
    }

    const llm = createSceneLlm(context)

    // La biblia normalmente ya viene corriendo desde la Fase 1 (hoisting);
    // con audio propio el guion recién existe tras la transcripción → camino
    // tardío. No se awaitea todavía: ni la presencia ni el director la usan.
    const bibleTask =
      context.visualBible ?? loadOrGenerateVisualBible(context, script)

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
    // un plan persistido completo se reusa.
    if (scenesNeedPlan(currentScenes)) {
      context.signal.throwIfAborted()
      context.emitter.emit({
        type: 'log',
        level: 'info',
        message: 'planning the visual variety of the video (scene director)',
      })
      currentScenes = await directScenes(llm, currentScenes, script, {
        styleId: style.id,
        isStickmanStyle: style.id === 'pov_stickman',
        characters: promptCharacters,
        imageTextLanguage,
        signal: context.signal,
        onLog: (message) =>
          context.emitter.emit({ type: 'log', level: 'info', message }),
      })
      await writeScenesOwned(
        context.paths,
        currentScenes,
        context.regenerateSceneIds,
      )
    }

    // Recién acá se cobra la biblia; el bloque de identidad de los personajes
    // se le anexa (la referencia de imagen fija la cara; el texto, el resto).
    const bibleBase = await bibleTask
    const characterBlock = buildCharactersBibleBlock(promptCharacters)
    const visualBible = characterBlock
      ? `${bibleBase ?? ''}${characterBlock}`.trim()
      : bibleBase

    // Persistencia incremental: tras cada escena con prompt nuevo, el buffer
    // se escribe entero — si el job muere a mitad, lo hecho queda en disco.
    const buffer = currentScenes.map((scene) => ({ ...scene }))
    currentScenes = await guaranteePrompts(currentScenes, {
      llm,
      style,
      fullScript: script,
      visualBible,
      characters: promptCharacters,
      imageTextLanguage,
      signal: context.signal,
      async onSceneProcessed(scene) {
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
      },
    })
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
  await writeScenesOwned(context.paths, marked, context.regenerateSceneIds)
  return marked
}
