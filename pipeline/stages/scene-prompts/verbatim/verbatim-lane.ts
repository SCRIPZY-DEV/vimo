import { finalizeSceneImagePrompt } from '../../shared/scene-prompt-finalization.ts'
import { isValidPrompt } from '../../../prompts/prompt-limits.ts'
import { resolveVerbatimModel } from '../../../providers/llm/model-catalog.ts'
import { createVerbatimClient } from '../../../providers/llm/verbatim-client.ts'
import {
  loadPipelineCharacters,
  type PipelineCharacter,
} from '../../../project/characters.ts'
import { PipelineFailure } from '../../../runner/failure.ts'
import type { LlmModelProfile } from '../../../types/llm-models.ts'
import type { Scene, SceneTreatment } from '../../../types/scenes.ts'
import type { StyleCharacter } from '../../../types/styles.ts'
import type {
  ProjectCharacter,
  ProjectCustomStyle,
  StyleProtagonist,
} from '../../../types/video-project.ts'
import { composeGemText } from '../../../prompts/template-frame.ts'
import type { VerbatimFragment } from '../../../prompts/verbatim-messages.ts'
import type { CreateVideoContext } from '../../context.ts'
import {
  createNarrativeReviewLlm,
  narrativeCandidateFor,
  reviewNarrativePrompts,
} from '../narrative-alignment.ts'
import {
  generateVerbatimPrompts,
  type VerbatimCharacterInput,
} from './verbatim-writer.ts'
import {
  descriptionFromUserPrompt,
  namesByName,
  namesSubject,
  mentionsProtagonist,
  protagonistFromSection,
  recoverProtagonistFromScenes,
} from './subject-weaver.ts'
import { withTreatment } from './treatments.ts'

// El PUENTE entre las stages y el motor verbatim (port de
// `motor-web/puente/fase_prompts.ts` del origen, sin el carril Storytime):
// entra `Scene[]` y sale `Scene[]` con `imagePrompt` puesto — el resto del
// pipeline no se entera de que el redactor es otro.
//
// Qué reemplaza, exactamente, cuando el proyecto tiene estilo propio:
//
//   | Carril de la casa (intacto)             | Carril verbatim (este archivo) |
//   |-----------------------------------------|--------------------------------|
//   | director de escenas (scene-director)    | nada — el estilo trae el ritmo |
//   | redactor 1 llamada × escena             | lotes de hasta 20              |
//   | biblia visual + bloque de personajes    | el guion completo como contexto|

export interface VerbatimLaneResult {
  scenes: Scene[]
  /** Compatibilidad del resultado: el carril temporal ahora detiene la fase
   *  si no pudo validar todos los prompts, sin comprar imágenes de relleno. */
  missing: number[]
  /** Ids de escena que este pase ESCRIBIÓ (para persistir/emitir solo esas). */
  written: Set<number>
  /** Ids de las escritas en este pase que nombraron al protagonista (el
   *  reparto del log de una gema con dinamismo). */
  scenesWithSubject: number[]
  /** El modelo que escribió de verdad (tras la degradación, si la hubo) y lo
   *  que movió: el llamador lo persiste como auditoría en project.json. */
  profile: LlmModelProfile
  inputTokens: number
  outputTokens: number
}

/**
 * Qué hace este video con el protagonista. Port de `personajeParaElMotor`
 * del origen: la GEMA declara el modo (`customStyle.character`, ADR-0020) y
 * el proyecto dice cuál personaje.
 *
 *   - `none`    → sin protagonista, pase lo que pase con el proyecto.
 *   - `generic` → la Fase 1 de la gema diseña uno; los personajes del
 *                 proyecto se ignoran (con aviso — paridad con el origen).
 *   - `own`     → manda lo que el proyecto trae: con foto → `reference` (la
 *                 identidad viaja en la imagen que el carril de personaje ya
 *                 adjunta); sin foto pero con descripción → `text`; sin
 *                 personajes → `generic` con aviso.
 *   - ausente   → comportamiento previo a ADR-0020, intacto: el proyecto
 *                 manda (mismas reglas que `own`, sin aviso).
 *
 * El modo foto/texto lo decide el ARCHIVO (la referencia cargada), no el
 * campo `mode` de la metadata: un proyecto puede declarar foto y haberla
 * perdido.
 */
export function verbatimCharacterFor(
  loaded: PipelineCharacter[],
  declared: ProjectCharacter[] | undefined,
  styleCharacter?: StyleCharacter,
  onWarn?: (message: string) => void,
): { input: VerbatimCharacterInput; index?: number } {
  if (styleCharacter?.mode === 'none') return { input: { mode: 'none' } }
  if (styleCharacter?.mode === 'generic') {
    if (loaded.length > 0)
      onWarn?.(
        'the style designs its own character: the project characters are ignored',
      )
    return { input: { mode: 'generic' } }
  }
  if (loaded.length === 0) {
    if (styleCharacter?.mode === 'own')
      onWarn?.(
        'the style asks for your character but the project brings none: one coherent with the script is designed instead',
      )
    return { input: { mode: 'generic' } }
  }

  const protagonistName = declared
    ?.find((character) => character.isProtagonist)
    ?.name?.trim()
  const foundIndex = protagonistName
    ? loaded.findIndex((character) => character.name === protagonistName)
    : 0
  const index = foundIndex >= 0 ? foundIndex : 0
  const chosen = loaded[index]!
  // Con estilo propio el video lleva UN protagonista (la gema escribe
  // `[subject]` en singular): el selector deja elegir dos, pero el segundo no
  // viaja. Se dice, para que nadie lo busque en las escenas.
  if (loaded.length > 1)
    onWarn?.(
      `the project brings ${loaded.length} characters but a custom style video carries one protagonist: only "${chosen.name}" travels`,
    )

  if (chosen.imageDataUri)
    return { input: { mode: 'reference', name: chosen.name }, index }
  if (chosen.description)
    return {
      input: { mode: 'text', prompt: chosen.description, name: chosen.name },
      index,
    }
  return { input: { mode: 'generic' } }
}

/**
 * Anota en qué escenas aparece el protagonista, según lo que el motor
 * ESCRIBIÓ de verdad (`scenesWithSubject`) — es el dato del que depende que
 * la foto de referencia se adjunte a las escenas correctas y a ninguna otra.
 * Solo toca las escenas escritas en esta pasada: en un resume o en una
 * regeneración parcial, las que ya estaban no se pisan. Sin personajes en el
 * proyecto no marca nada: `charactersPresent` indexa `options.characters`.
 */
function markSubjectPresence(
  scenes: Scene[],
  written: ReadonlySet<number>,
  scenesWithSubject: readonly number[],
  characterIndex: number | undefined,
): Scene[] {
  if (characterIndex === undefined) return scenes
  const marked = new Set(scenesWithSubject)
  return scenes.map((scene) => {
    if (!written.has(scene.id) || !(scene.imagePrompt ?? '').trim())
      return scene
    return {
      ...scene,
      charactersPresent: marked.has(scene.id) ? [characterIndex] : [],
    }
  })
}

/**
 * El reparto de UNA escena recién escrita, con la misma regla que
 * `markSubjectPresence` y que el mapa `presence` del final — pero por escena,
 * para poder persistirla apenas cierra su lote. `undefined` = no hay
 * personaje que indexar y el campo no se toca.
 */
function presenceForScene(
  group: VerbatimSceneGroup,
  characterIndex: number | undefined,
  carriesSubject: boolean,
): number[] | undefined {
  if (group.indexes !== undefined) return group.indexes
  if (characterIndex === undefined) return undefined
  return carriesSubject ? [characterIndex] : []
}

/**
 * La nota que viaja pegada al fragmento de una escena rechazada por
 * content-policy (v1.20.0 del origen, palabra por palabra — en español porque
 * es un mensaje AL MODELO del mismo idioma que el resto de la mecánica del
 * carril, no texto de UI). Nombra los motivos de rechazo más comunes con
 * todas las letras: famosos, violencia gráfica, sangre.
 */
export const CONTENT_POLICY_RETRY_NOTE =
  'El generador de imágenes rechazó la versión anterior de esta escena por sus políticas de contenido. Reescribe el prompt más neutro y family-friendly, sin nombres propios de personas reales ni de famosos, sin violencia gráfica, sangre ni matanzas explícitas (sugiere esas ideas con atmósfera y fuera de cuadro), manteniendo intacto el estilo visual.'

/**
 * La nota de una escena MUDA (el corte clásico cayó en una pausa): su
 * fragmento es la narración vecina, y el modelo tiene que ilustrar el momento
 * entre esas líneas, no repetir la imagen anterior. Mismo registro que la
 * nota de content-policy: mensaje al modelo, no texto de UI.
 */
export const SILENT_PAUSE_NOTE =
  'En el tramo de esta escena no se dice nada: el fragmento es la narración inmediatamente anterior y posterior a la pausa. Ilustra el momento ENTRE esas líneas (una transición, una reacción, un detalle del mismo lugar), sin repetir la imagen de la escena anterior ni ilustrar literalmente la línea siguiente, manteniendo intacto el estilo visual.'

/** Una escena con su prompt recién escrito, lista para ir a disco. */
export interface VerbatimScenePrompt {
  id: number
  imagePrompt: string
  /** Ausente = el proyecto no trae personaje que indexar: no tocar el campo. */
  charactersPresent?: number[]
  /** El tratamiento que declaró su etiqueta `[T:…]` (gema con dinamismo). */
  treatment?: SceneTreatment
}

export interface VerbatimLaneOptions {
  /**
   * Nota de reintento POR ESCENA (E34, rescate por content-policy): cuando el
   * generador de imágenes rechaza una escena por contenido, la reescritura
   * también va por ESTE carril — el estilo del usuario nunca se pisa con el
   * de la casa — y la nota viaja pegada al fragmento, como mensaje de
   * usuario. La clave es el id de la escena.
   */
  retryNotes?: ReadonlyMap<number, string>
  /**
   * Prompts recién escritos, al cerrar CADA lote. Quien llame los persiste
   * en el acto: ya están pagados y la corrida todavía puede morir (la UI
   * cancela el job cuando el modelo da errores, ADR-0028).
   */
  onPrompts?: (prompts: readonly VerbatimScenePrompt[]) => Promise<void>
}

interface VerbatimSceneGroup {
  scenes: Scene[]
  input: VerbatimCharacterInput
  /** Ausente en Create: allí decide la gema. En el editor, [] es explícito. */
  indexes?: number[]
}

// Reutiliza el escritor y agrupa solo por reparto, para no pedir cada escena
// por separado ni mezclar reglas opuestas en una misma conversación.
function editorCharacterInput(
  characters: PipelineCharacter[],
): VerbatimCharacterInput {
  if (characters.length === 0)
    return { mode: 'none', withoutScriptProtagonist: true }
  if (characters.length === 1)
    return verbatimCharacterFor(characters, undefined).input

  const name = characters.map((character) => character.name).join(' and ')
  if (characters.every((character) => character.imageDataUri))
    return { mode: 'reference', name }

  // Dos identidades: las que tienen foto no reciben descripción física
  // competidora; las de texto se recortan con la misma regla del escritor.
  const prompt = characters
    .map((character) => {
      const identity = character.imageDataUri
        ? 'the person from the attached reference image'
        : descriptionFromUserPrompt(character.description)
      return `${character.name}, ${identity}`
    })
    .join('; ')
  return { mode: 'text', name, prompt }
}

/**
 * La sección `character` de una gema de plantilla, cuando viaja: solo en el
 * modo genérico (declarado o ausente). En «Mi personaje» el protagonista es el
 * del usuario y en cinemático no hay (spec §5.2).
 */
function sectionCharacterOf(
  customStyle: ProjectCustomStyle | undefined,
): string | undefined {
  const mode = customStyle?.character?.mode
  if (mode === 'own' || mode === 'none') return undefined
  return customStyle?.sections?.character?.trim() || undefined
}

/**
 * El protagonista que este proyecto YA tiene resuelto para sus grupos
 * `generic` (sin personaje del usuario): el guardado en project.json; el que
 * define la sección `character` de una gema de plantilla (sin Fase 1); o, en
 * proyectos anteriores a ese campo, el que sus prompts de escena ya vienen
 * tejiendo. `undefined` = primera vez: lo diseña la Fase 1.
 *
 * La recuperación desde los prompts solo aplica SIN personajes en el
 * proyecto: con reparto del usuario, la identidad tejida en las escenas es la
 * de SU personaje y no la del estilo.
 */
function resolveStyleProtagonist(
  context: CreateVideoContext,
  scenes: Scene[],
  projectHasCharacters: boolean,
): StyleProtagonist | undefined {
  const stored = context.metadata.styleProtagonist
  if (stored?.description.trim()) return stored
  const section = sectionCharacterOf(context.options.customStyle)
  if (section) return protagonistFromSection(section)
  if (projectHasCharacters) return undefined

  const recovered = recoverProtagonistFromScenes(scenes)
  if (!recovered) return undefined
  return { portrait: recovered, description: recovered, source: 'recovered' }
}

/**
 * La fase de prompts con el motor verbatim. Toda escena lleva prompt —la
 * muda (texto vacío) se pide con la narración vecina y una nota de pausa—,
 * y las que YA tienen prompt válido no se re-piden: en un resume o en el
 * rescate llegan 15 escenas con 8 prompts buenos y 7 agujeros — re-escribir
 * los 8 buenos gastaba tokens y podía CAMBIAR prompts que el usuario ya vio.
 * Quien quiere reescritura en serio primero vacía el `imagePrompt` (el mismo
 * gesto del flujo de regenerar).
 */
export async function runVerbatimLane(
  context: CreateVideoContext,
  scenes: Scene[],
  fullScript: string,
  options: VerbatimLaneOptions = {},
): Promise<VerbatimLaneResult> {
  const customStyle = context.options.customStyle
  if (!customStyle)
    throw new PipelineFailure(
      'invalid_payload',
      'verbatim lane requires options.customStyle',
    )

  const apiKey = context.job.apiKeys.deepinfra
  if (!apiKey)
    throw new PipelineFailure('missing_api_key', 'deepinfra API key is missing')

  const pending = scenes.filter(
    (scene) =>
      (!context.regenerateSceneIds?.size ||
        context.regenerateSceneIds.has(scene.id)) &&
      !isValidPrompt(scene.imagePrompt),
  )
  if (pending.length === 0)
    return {
      scenes,
      missing: [],
      written: new Set(),
      scenesWithSubject: [],
      profile: resolveVerbatimModel(context.options.promptModel).profile,
      inputTokens: 0,
      outputTokens: 0,
    }

  const loadedCharacters = await loadPipelineCharacters(
    context.paths,
    context.options.characters,
  )
  const character = verbatimCharacterFor(
    loadedCharacters,
    context.options.characters,
    customStyle.character,
    (message) => context.emitter.emit({ type: 'log', level: 'warn', message }),
  )

  const groups: VerbatimSceneGroup[] = []
  const editorSelection = Boolean(
    context.regenerateSceneIds?.size && loadedCharacters.length > 0,
  )
  if (editorSelection) {
    const bySelection = new Map<string, VerbatimSceneGroup>()
    for (const scene of pending) {
      const indexes = [...new Set(scene.charactersPresent ?? [])].sort(
        (a, b) => a - b,
      )
      if (
        indexes.some(
          (index) => !Number.isInteger(index) || !loadedCharacters[index],
        )
      )
        throw new PipelineFailure(
          'invalid_payload',
          'scene character selection is outside the project cast',
        )
      const signature = indexes.join(',')
      let group = bySelection.get(signature)
      if (!group) {
        group = {
          scenes: [],
          indexes,
          input: editorCharacterInput(
            indexes.map((index) => loadedCharacters[index]!),
          ),
        }
        bySelection.set(signature, group)
      }
      group.scenes.push(scene)
    }
    groups.push(...bySelection.values())
  } else {
    groups.push({ scenes: pending, input: character.input })
  }

  // El protagonista del estilo se resuelve UNA vez por proyecto, no por
  // corrida: reanudar, reescribir por política de contenido o regenerar una
  // escena volvía a diseñarlo y el video cambiaba de personaje a mitad de
  // camino. Si ya está resuelto, todos los grupos `generic` tejen ese.
  const saveStyleProtagonist = async (protagonist: StyleProtagonist) => {
    context.metadata.styleProtagonist = protagonist
    await context.saveMetadata()
  }
  const genericGroups = groups.filter((group) => group.input.mode === 'generic')
  const knownProtagonist =
    genericGroups.length > 0
      ? resolveStyleProtagonist(context, scenes, loadedCharacters.length > 0)
      : undefined
  if (knownProtagonist) {
    if (
      knownProtagonist.source === 'recovered' &&
      !context.metadata.styleProtagonist
    ) {
      context.emitter.emit({
        type: 'log',
        level: 'info',
        message:
          'protagonist recovered from the scene prompts this project already has: it is kept instead of designing a new one',
      })
      await saveStyleProtagonist(knownProtagonist)
    }
    if (
      knownProtagonist.source === 'style-section' &&
      !context.metadata.styleProtagonist
    ) {
      context.emitter.emit({
        type: 'log',
        level: 'info',
        message:
          'protagonist taken from the character section of the style: no character design phase',
      })
      await saveStyleProtagonist(knownProtagonist)
    }
    for (const group of genericGroups)
      group.input = { mode: 'generic', designed: knownProtagonist }
  }
  // Sin protagonista resuelto y con MÁS de un grupo `generic` (solo pasa en el
  // editor), los grupos correrían en paralelo y cada uno diseñaría el suyo: va
  // uno solo adelante y los demás tejen lo que ese dejó guardado.
  const leadingGroups =
    !knownProtagonist && genericGroups.length > 1
      ? genericGroups.slice(0, 1)
      : []

  const onPrompts = options.onPrompts
  const client = createVerbatimClient({
    apiKey,
    baseUrl: context.config.llm.baseUrl,
  })

  let lastReady = 0
  const groupProgress = new Map<VerbatimSceneGroup, number>()
  // La ventana vecina de una escena muda se arma sobre TODAS las escenas del
  // proyecto (no solo las del grupo), para que la pausa vea sus dos lados.
  const orderedScenes = [...scenes].sort((a, b) => a.id - b.id)
  const scenesById = new Map(orderedScenes.map((scene) => [scene.id, scene]))
  const reviewLlm = createNarrativeReviewLlm(context)
  const runGroup = async (group: VerbatimSceneGroup) => {
    const fragments: VerbatimFragment[] = group.scenes.map((scene) => {
      const retryNote = options.retryNotes?.get(scene.id)?.trim()
      // La descripción manual ES el fragmento (paridad con el carril del
      // catálogo): como nota al lado de la narración, la narración ganaba
      // y la imagen regenerada salía igual a la anterior.
      const userRequest = scene.userPrompt?.trim()
      const narrative = narrativeCandidateFor(scene, orderedScenes, '')
      const selectionNote = group.indexes?.length
        ? 'El usuario incluyo al personaje en esta escena: [subject] DEBE aparecer en la accion de este fragmento, manteniendo el mismo estilo.'
        : undefined
      const pauseNote =
        !userRequest && narrative.sourceKind === 'silent-hold'
          ? SILENT_PAUSE_NOTE
          : undefined
      const note = [retryNote, selectionNote, pauseNote]
        .filter(Boolean)
        .join(' ')
      return {
        n: scene.id,
        text: narrative.source,
        temporalContext: JSON.stringify({
          sceneId: scene.id,
          startSeconds: scene.startSeconds,
          endSeconds: scene.endSeconds,
          sourceKind: narrative.sourceKind,
          fragment: narrative.source,
          previous: narrative.previous,
          next: narrative.next,
        }),
        ...(note ? { note } : {}),
      }
    })
    const result = await generateVerbatimPrompts(fragments, fullScript, {
      // La gema del usuario, VERBATIM: el snapshot del proyecto, sin los
      // ALLOWED SHOTS ni las GLOBAL_RULES del carril de la casa (paridad con el
      // origen: los planos solo gobiernan el carril del catálogo). Una gema de
      // plantilla viaja por secciones: el marco arma su system y la Fase 1 (y
      // su último recurso) recibe su texto sin las frases fijas, que pega el
      // código y no son parte de la ficha del retrato (ADR-0048).
      gem: customStyle.sections
        ? composeGemText(customStyle.sections, { fixedPhrases: false })
        : (customStyle.systemPrompt ?? ''),
      sections: customStyle.sections,
      // El modelo elegido en el proyecto; el writer lo resuelve (retirado o
      // desconocido → el de la casa, con aviso).
      modelId: context.options.promptModel,
      character: group.input,
      validatePrompt:
        group.indexes === undefined
          ? undefined
          : (prompt) => {
              const selected = group.indexes!
              const excluded = loadedCharacters.filter(
                (_, index) => !selected.includes(index),
              )
              if (excluded.some((entry) => namesByName(prompt, entry.name)))
                return false
              if (selected.length === 0)
                return !namesSubject(prompt) && !mentionsProtagonist(prompt)
              return (
                namesSubject(prompt) ||
                selected.every((index) =>
                  namesByName(prompt, loadedCharacters[index]!.name),
                )
              )
            },
      client,
      signal: context.signal,
      // El recorte previo al juez protege las frases fijas igual que el de
      // la fase de imágenes (spec §5.4): el juez aprueba lo que se compra.
      preparePrompt: (prompt, id) =>
        finalizeSceneImagePrompt(
          scenesById.get(id)!,
          orderedScenes,
          prompt,
          'custom',
          undefined,
          customStyle.sections,
        ),
      reviewPrompts: (prompts) =>
        reviewNarrativePrompts(
          [...prompts].map(([id, prompt]) =>
            narrativeCandidateFor(scenesById.get(id)!, orderedScenes, prompt),
          ),
          { llm: reviewLlm, signal: context.signal },
        ),
      // Cada lote cerrado se persiste antes de seguir: si la corrida muere
      // después, lo pagado ya está en disco y el reintento solo pide lo que
      // falta.
      onBatchReady: onPrompts
        ? async (batch) => {
            const carriers = new Set(batch.scenesWithSubject)
            const written: VerbatimScenePrompt[] = []
            for (const [id, imagePrompt] of batch.prompts) {
              if (!imagePrompt.trim()) continue
              const charactersPresent = presenceForScene(
                group,
                character.index,
                carriers.has(id),
              )
              const treatment = batch.treatments.get(id)
              written.push({
                id,
                imagePrompt,
                ...(charactersPresent === undefined
                  ? {}
                  : { charactersPresent }),
                ...(treatment ? { treatment } : {}),
              })
            }
            if (written.length === 0) return
            await onPrompts(written)
          }
        : undefined,
      onProtagonistDesigned: saveStyleProtagonist,
      onLog: (message) =>
        context.emitter.emit({ type: 'log', level: 'info', message }),
      onWarn: (message) =>
        context.emitter.emit({ type: 'log', level: 'warn', message }),
      // El modelo elegido falló de verdad (código del proveedor o rescate):
      // evento tipado para que la UI lo bloquee un rato y ofrezca cambiarlo.
      onModelTrouble: (modelId, code, sceneIds) =>
        context.emitter.emit({
          type: 'prompt-model-trouble',
          modelId,
          code,
          sceneIds,
        }),
      // Cifras absolutas sobre TODAS las escenas (evento tipado, ADR-0013): las
      // que ya traían prompt cuentan como listas, así la UI muestra
      // max(persistidos, escritos) y la barra avanza mientras el modelo escribe.
      // Monótono por construcción: un lote que reporta desde cero no la devuelve.
      onProgress: (ready) => {
        groupProgress.set(group, ready)
        const groupedReady = [...groupProgress.values()].reduce(
          (total, count) => total + count,
          0,
        )
        const absolute = Math.min(
          scenes.length,
          scenes.length - pending.length + groupedReady,
        )
        if (absolute <= lastReady) return
        lastReady = absolute
        context.emitter.emit({
          type: 'scene-prompts-progress',
          ready: absolute,
          total: scenes.length,
        })
      },
    })
    context.signal.throwIfAborted()
    if (result.missing.length > 0)
      throw new PipelineFailure(
        'scene_prompt_alignment_failed',
        `scene prompts could not satisfy the narrative contract for IDs ${result.missing.join(', ')}; no filler images requested`,
      )
    return { group, result }
  }

  const settledLeading = await Promise.allSettled(leadingGroups.map(runGroup))
  const designedByLeading = context.metadata.styleProtagonist
  if (leadingGroups.length > 0 && designedByLeading) {
    for (const group of genericGroups) {
      if (leadingGroups.includes(group)) continue
      group.input = { mode: 'generic', designed: designedByLeading }
    }
  }
  const settled = [
    ...settledLeading,
    ...(await Promise.allSettled(
      groups.filter((group) => !leadingGroups.includes(group)).map(runGroup),
    )),
  ]
  context.signal.throwIfAborted()
  const results = settled.flatMap((entry) =>
    entry.status === 'fulfilled' ? [entry.value] : [],
  )
  const failure = settled.find((entry) => entry.status === 'rejected')
  if (failure?.status === 'rejected') throw failure.reason
  const prompts = new Map(results.flatMap(({ result }) => [...result.prompts]))
  const presence = new Map(
    results.flatMap(({ group, result }) => {
      if (group.indexes === undefined) return []
      return [...result.prompts.keys()].map((id): [number, number[]] => [
        id,
        group.indexes!,
      ])
    }),
  )

  const treatments = new Map(
    results.flatMap(({ result }) => [...result.treatments]),
  )
  const scenesWithSubject = results.flatMap(
    ({ result }) => result.scenesWithSubject,
  )

  const written = new Set(prompts.keys())
  const withPrompts = scenes.map((scene) => {
    const prompt = prompts.get(scene.id)
    if (!prompt) return scene
    // Un prompt del motor nunca es fallback: si la escena traía uno, deja de
    // serlo. Su tratamiento es el del prompt nuevo.
    return withTreatment(
      {
        ...scene,
        imagePrompt: prompt,
        promptIsFallback: false,
        ...(presence.has(scene.id)
          ? { charactersPresent: presence.get(scene.id)! }
          : {}),
      },
      treatments.get(scene.id),
    )
  })

  return {
    scenes: editorSelection
      ? withPrompts
      : markSubjectPresence(
          withPrompts,
          written,
          scenesWithSubject,
          character.index,
        ),
    missing: results.flatMap(({ result }) => result.missing),
    written,
    scenesWithSubject,
    profile: results[0]!.result.profile,
    inputTokens: results.reduce(
      (total, { result }) => total + result.inputTokens,
      0,
    ),
    outputTokens: results.reduce(
      (total, { result }) => total + result.outputTokens,
      0,
    ),
  }
}

/**
 * Deja escrito en project.json con qué modelo salieron los prompts. Solo
 * auditoría (soporte y una futura UI): no gobierna ninguna decisión.
 */
export async function recordPromptModelUsed(
  context: CreateVideoContext,
  lane: VerbatimLaneResult,
): Promise<void> {
  if (lane.written.size === 0) return
  context.metadata.promptModelUsed = {
    id: lane.profile.id,
    label: lane.profile.label,
  }
  await context.saveMetadata()
}
