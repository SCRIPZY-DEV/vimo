import { finalizeSceneImagePrompt } from '../shared/scene-prompt-finalization.ts'
import {
  narrativeCandidateFor,
  reviewNarrativePrompts,
  reviewerCorrection,
  type NarrativePromptCandidate,
} from './narrative-alignment.ts'
import { hasCatalogNarrative } from '../shared/catalog-prompt.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import { setTimeout as delay } from 'node:timers/promises'

import { isValidPrompt } from '../../prompts/prompt-limits.ts'
import {
  buildComplexionCorrectionBlock,
  buildIdentityCorrectionBlock,
  buildMissingCharacterCorrectionBlock,
  buildNoPersonCorrectionBlock,
  buildRetryAttemptBlock,
  buildSceneCharacterBlock,
  characterIndicesInRequest,
} from '../../prompts/scene-prompt-blocks.ts'
import type { VisualStyle } from '../../prompts/visual-styles.ts'
import type { Scene, ScenePromptFailure } from '../../types/scenes.ts'
import { limitConcurrency } from '../../utils/concurrency.ts'
import { neutralizeFamousNames } from '../../utils/content-safety.ts'
import { neutralizeEraInBible } from '../../utils/story-era.ts'
import {
  anchorNormalRealism,
  missingHeadTraits,
  rewriteSceneryWithoutCharacter,
  type PromptCharacter,
} from './fallback-prompt.ts'
import {
  lockCharacterComplexion,
  lockCharacterPresence,
  missingCharacterMention,
  missingComplexion,
  promptDepictsPerson,
  promptDepictsStandIn,
  sealSceneWithoutPeople,
} from './identity-lock.ts'
import { isPhotorealisticStyle } from '../shared/prompt-safety.ts'
import type { SceneLlm } from '../shared/llm.ts'
import {
  buildContextWindow,
  buildSceneUserPrompt,
  narrationFragmentFor,
} from './prompt-composer.ts'
import { extractImagePrompt } from './prompt-extraction.ts'
import { buildScenePlanBlock } from './scene-director.ts'

// Catálogo: cada respuesta se valida antes de anclar estilo; el cliente rota
// modelos. Nunca se persiste relleno. Cancelación y errores dejan el trabajo
// válido ya guardado para reanudar (ADR-0036).
const MAX_ATTEMPTS_PER_SCENE = 3
const LLM_CONCURRENCY = 6
// Hasta cuántas escenas sin prompt puede dejar una corrida para rescatarlas
// desde el editor. Un número fijo tumbaba los videos largos (7 de 549 = 1,3 %
// paraban todo antes de imágenes): crece con el video. Con más, el problema no
// es la escena: se reintenta todo.
const MIN_RESCUABLE_PROMPT_FAILURES = 5
const RESCUABLE_PROMPT_FAILURE_RATIO = 0.05
export function rescuablePromptFailures(pendingScenes: number): number {
  return Math.max(
    MIN_RESCUABLE_PROMPT_FAILURES,
    Math.ceil(pendingScenes * RESCUABLE_PROMPT_FAILURE_RATIO),
  )
}
// Fallos de un pedido en los que ningún modelo de texto respondió (el
// redactor o el revisor): la escena queda sin prompt, el resto sigue.
const MODELS_UNAVAILABLE_CODES = [
  'catalog_prompts_incomplete',
  'scene_prompt_alignment_failed',
]

export interface PromptWriterOptions {
  llm: SceneLlm
  /** Revisor separado del redactor, con tier premium cuando lo provee la stage. */
  reviewLlm?: SceneLlm
  style: VisualStyle
  fullScript: string
  visualBible?: string
  characters: PromptCharacter[]
  // Nombre inglés del idioma del guion ("" → el LLM lo infiere).
  imageTextLanguage: string
  signal: AbortSignal
  sceneIds?: ReadonlySet<number>
  // true en la generación automática: una escena SIN personaje que el redactor
  // insiste en poblar se PROMUEVE al protagonista (identidad + referencia) en
  // vez de aceptar a un desconocido. false al regenerar desde el editor: ahí
  // la presencia por escena la eligió el usuario y se respeta.
  promoteUnmarkedProtagonist?: boolean
  // Persistencia incremental: se llama tras cada escena con prompt nuevo —
  // también en la reescritura por content policy desde la fase de imágenes,
  // que lo usa para reemitir scene-prompt-ready.
  onSceneProcessed?(scene: Scene): Promise<void> | void
  // Cuántas escenas pueden quedar sin prompt (con `promptFailure`) sin tumbar
  // la corrida. 0 o ausente: cualquier hueco lanza, como siempre.
  rescueLimit?: number
  // Se llama con cada escena que quedó sin prompt, ya con su motivo.
  onSceneFailed?(scene: Scene): Promise<void> | void
  // Avisos para el log del job (p. ej. un prompt aceptado con objeción).
  onWarn?(message: string): void
}

// Objeción del revisor sobre el candidato, o undefined si se acepta. Un
// revisor que no responde no deja la escena sin prompt: se acepta sin
// revisión y queda en el log. Cuenta, saldo y cancelación siguen cortando.
async function narrativeObjection(
  candidate: NarrativePromptCandidate,
  options: PromptWriterOptions,
): Promise<string | undefined> {
  try {
    const rejected = await reviewNarrativePrompts([candidate], {
      llm: options.reviewLlm ?? options.llm,
      signal: options.signal,
    })
    return rejected.get(candidate.sceneId)
  } catch (error) {
    options.signal.throwIfAborted()
    if (
      !(error instanceof PipelineFailure) ||
      error.code !== 'scene_prompt_alignment_failed'
    )
      throw error
    options.onWarn?.(
      `scene ${candidate.sceneId} accepted without narrative review (reviewer unavailable)`,
    )
    return undefined
  }
}

// Toda escena lleva prompt: la muda (texto vacío del corte clásico) se
// ilustra desde la narración vecina, nunca se exime.
function scenesMissingPrompt(scenes: Scene[]): Scene[] {
  return scenes.filter((scene) => !isValidPrompt(scene.imagePrompt))
}

// Clave con la que se deduplican prompts entre escenas: dos escenas mudas no
// comparten fragmento (`''`), así que se distinguen por id.
function fragmentKey(scene: Scene): string {
  return scene.userPrompt?.trim() || scene.text || `#${scene.id}`
}

// Lo que el camino principal, el rescate y la re-sanitización comparten por
// escena: bloque duro de personajes + SCENE PLAN + user prompt completo.
interface ComposedSceneRequest {
  userPrompt: string
  isUserRequest: boolean
  // Proyecto con personajes pero ninguno en esta escena: en stickman la
  // salida del LLM se reenvuelve sin muñeco.
  isPlaceOnlyScene: boolean
  // Presencia efectiva (persistida, o la que un pedido manual trae de vuelta).
  effectivePresent: number[]
  // La narración que respalda el pedido: la propia o, en una escena muda, la
  // ventana vecina (lo que reconstruye el escenario si el LLM devolvió poco).
  narration: string
}

function composeSceneRequest(
  scene: Scene,
  orderedScenes: Scene[],
  totalScenes: number,
  options: PromptWriterOptions,
  fragmentOverride?: string,
): ComposedSceneRequest {
  const isUserRequest = (scene.userPrompt?.trim().length ?? 0) > 0
  const narration = narrationFragmentFor(
    scene,
    orderedScenes,
    options.fullScript,
  )
  const fragment = (
    fragmentOverride ??
    (scene.userPrompt?.trim() || narration.text)
  ).trim()
  const present = scene.charactersPresent ?? []
  const isStickmanStyle = options.style.id === 'pov_stickman'
  const isPhotorealistic = isPhotorealisticStyle(options.style.id)

  const characterBlock = buildSceneCharacterBlock(options.characters, present, {
    isStickmanStyle,
    imageTextLanguage: options.imageTextLanguage,
    isUserRequest,
    request: fragment,
    isPhotorealistic,
  })

  // Índices que el pedido manual trae de vuelta: gobiernan el reenvoltorio
  // sin-muñeco y el backstop de identidad, en paridad con el bloque.
  const requestedIndexes =
    isUserRequest && present.length === 0
      ? characterIndicesInRequest(fragment, options.characters)
      : []
  const isPlaceOnlyScene =
    options.characters.length > 0 &&
    present.length === 0 &&
    requestedIndexes.length === 0

  // El SCENE PLAN del director va al final del bloque duro; un pedido manual
  // del usuario MANDA sobre el plan (rama byte-idéntica, sin bloque).
  const planBlock = isUserRequest
    ? ''
    : buildScenePlanBlock(scene.direction, {
        present: present.length > 0,
        hasCharacters: options.characters.length > 0,
        isStickmanStyle,
        imageTextLanguage: options.imageTextLanguage,
        characterNames: options.characters.map((character) => character.name),
        styleId: options.style.id,
      })

  const userPrompt = buildSceneUserPrompt({
    fragment,
    sceneId: scene.id,
    totalScenes,
    styleName: options.style.name,
    contextWindow: buildContextWindow(orderedScenes, scene.id),
    startSeconds: scene.startSeconds,
    endSeconds: scene.endSeconds,
    visualBible: options.visualBible,
    isUserRequest,
    isSilentPause: narration.isSilent && !isUserRequest,
    mandatoryBlock: characterBlock + planBlock,
    imageTextLanguage: options.imageTextLanguage,
  })

  return {
    userPrompt,
    isUserRequest,
    isPlaceOnlyScene,
    effectivePresent: present.length > 0 ? present : requestedIndexes,
    narration: narration.text,
  }
}

// Post-proceso común de una salida del LLM: ancla de realismo + reenvoltorio
// sin muñeco cuando corresponde.
function finishLlmPrompt(
  rawPrompt: string,
  composed: ComposedSceneRequest,
  style: VisualStyle,
): string {
  const anchored = anchorNormalRealism(rawPrompt, style)
  return composed.isPlaceOnlyScene
    ? rewriteSceneryWithoutCharacter(anchored, style, composed.narration)
    : anchored
}

// Lo que se PERSISTE: la salida terminada más el candado de tez. El candado es
// no-op cuando el redactor ya escribió el tono de piel del personaje.
function lockedLlmPrompt(
  finished: string,
  composed: ComposedSceneRequest,
  options: PromptWriterOptions,
  requirePersonMention = false,
): string {
  // Sin personaje y sin pedido manual: se sella contra gente de fondo. Si el
  // redactor igual dejó a alguien, no se sella (contradiría su propio texto).
  if (composed.isPlaceOnlyScene) {
    const isSealable =
      !composed.isUserRequest &&
      !promptDepictsPerson(finished, options.style, options.characters)
    return isSealable
      ? sealSceneWithoutPeople(finished, options.style)
      : finished
  }

  // Primero que el personaje ESTÉ; después, que lleve su tez. La reescritura
  // por content policy puede volver la escena un paisaje a propósito: ahí no
  // se fuerza la presencia.
  const featured = requirePersonMention
    ? finished
    : lockCharacterPresence(
        finished,
        options.characters,
        composed.effectivePresent,
        options.style,
      )
  return lockCharacterComplexion(
    featured,
    options.characters,
    composed.effectivePresent,
    options.style,
    { requirePersonMention },
  )
}

// ─── Capa 1: pasada principal ───

interface GenerateOptions extends PromptWriterOptions {
  // true en el barrido: directo al tier premium (ya agotó el balanced).
  escalateTier?: boolean
}

// Procesa SOLO las escenas sin prompt válido; la muda se ilustra desde la
// ventana vecina. Si TODAS fallan lanza; si algunas, devuelve el mix y el
// caller sigue.
export async function generateScenePrompts(
  scenes: Scene[],
  options: GenerateOptions,
): Promise<Scene[]> {
  options.signal.throwIfAborted()
  if (scenes.length === 0) return []

  // Gate de época en el punto de entrada: la biblia con era alucinada se
  // neutraliza y todo lo de abajo hereda el fix.
  const writerOptions: GenerateOptions = {
    ...options,
    visualBible: neutralizeEraInBible(options.visualBible, options.fullScript),
  }

  const toProcess = scenes.filter(
    (scene) =>
      (!options.sceneIds || options.sceneIds.has(scene.id)) &&
      !isValidPrompt(scene.imagePrompt),
  )
  if (toProcess.length === 0) return scenes

  const limit = limitConcurrency(LLM_CONCURRENCY)
  const results = new Map<number, Scene>()
  const failures: { scene: Scene; failure: ScenePromptFailure }[] = []
  const orderedScenes = [...scenes].sort((a, b) => a.id - b.id)
  const normalize = (text: string) =>
    text.toLowerCase().replace(/\s+/g, ' ').trim()
  const accepted = new Map<string, string>()
  for (const scene of scenes) {
    if (isValidPrompt(scene.imagePrompt))
      accepted.set(normalize(scene.imagePrompt), normalize(fragmentKey(scene)))
  }

  const settled = await Promise.allSettled(
    toProcess.map((scene) =>
      limit(async () => {
        writerOptions.signal.throwIfAborted()

        // `let`: una escena sin personaje puede promoverse al protagonista.
        let currentScene = scene
        let composed = composeSceneRequest(
          currentScene,
          orderedScenes,
          scenes.length,
          writerOptions,
        )
        const characterNames = writerOptions.characters.map(
          (character) => character.name,
        )

        let imagePrompt = ''
        let lastFailure: ScenePromptFailure = { source: 'writer' }
        // Último candidato completo que el revisor objetó.
        let objectedPrompt: { prompt: string; feedback: string } | undefined
        // Si un intento soltó rasgos de cabeza canónicos, el siguiente lleva
        // la corrección explícita adjunta.
        let identityCorrection = ''
        // Una escena que el revisor ya rechazó en otra corrida arranca con su
        // objeción: reintentar a ciegas repetía el mismo prompt rechazado.
        let narrativeCorrection =
          scene.promptFailure?.source === 'reviewer' &&
          scene.promptFailure.detail
            ? narrativeCorrectionBlock(scene.promptFailure.detail)
            : ''
        for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_SCENE; attempt++) {
          try {
            const content = await writerOptions.llm.generate({
              systemPrompt: writerOptions.style.systemPrompt,
              userPrompt:
                composed.userPrompt + identityCorrection + narrativeCorrection,
              jsonOnly: true,
              validate(content) {
                const prompt = extractImagePrompt(content)
                if (!hasCatalogNarrative(prompt, writerOptions.style))
                  return false
                // Con candado: la clave coincide con lo que queda en disco.
                const final = normalize(
                  lockedLlmPrompt(
                    finishLlmPrompt(prompt, composed, writerOptions.style),
                    composed,
                    writerOptions,
                  ),
                )
                const fragment = normalize(fragmentKey(scene))
                const previousFragment = accepted.get(final)
                if (
                  previousFragment !== undefined &&
                  previousFragment !== fragment
                )
                  return false
                // Reserva sin await: respuestas simultáneas no pueden aceptar
                // el mismo texto exacto para fragmentos narrativos diferentes.
                accepted.set(final, fragment)
                return true
              },
              // Escalada de tiers: el ÚLTIMO intento (y todo el barrido) va
              // al premium con el mismo prompt completo.
              tier:
                writerOptions.escalateTier || attempt === MAX_ATTEMPTS_PER_SCENE
                  ? 'premium'
                  : 'balanced',
            })

            writerOptions.signal.throwIfAborted()
            const extracted = extractImagePrompt(content)
            const candidate = hasCatalogNarrative(
              extracted,
              writerOptions.style,
            )
              ? finishLlmPrompt(extracted, composed, writerOptions.style)
              : ''
            // Escena SIN personaje que dibuja a alguien sin rotular: no lleva
            // identidad ni referencia, así que sale como un desconocido que
            // hace de protagonista. La gente que la narración describe
            // («anonymous …») sí es legítima.
            const drewUnmarkedPerson =
              isValidPrompt(candidate) &&
              composed.isPlaceOnlyScene &&
              !composed.isUserRequest &&
              promptDepictsStandIn(
                candidate,
                writerOptions.style,
                writerOptions.characters,
              )
            if (!isValidPrompt(candidate)) {
              lastFailure = { source: 'writer' }
            } else if (drewUnmarkedPerson && attempt < MAX_ATTEMPTS_PER_SCENE) {
              lastFailure = { source: 'writer' }
              identityCorrection = buildNoPersonCorrectionBlock(characterNames)
            } else if (
              drewUnmarkedPerson &&
              writerOptions.promoteUnmarkedProtagonist
            ) {
              // El redactor insiste: la narración ES sobre el protagonista. Se
              // le da la escena con su identidad completa y se redacta de cero.
              currentScene = { ...scene, charactersPresent: [0] }
              composed = composeSceneRequest(
                currentScene,
                orderedScenes,
                scenes.length,
                writerOptions,
              )
              identityCorrection = ''
              attempt = 0
              continue
            } else {
              // Backstop de identidad: un prompt que soltó rasgos canónicos de
              // un personaje presente se reintenta con corrección; en el
              // último intento se acepta igual (nunca cae al fallback por esto).
              const missing = composed.isPlaceOnlyScene
                ? []
                : missingHeadTraits(
                    candidate,
                    writerOptions.characters,
                    composed.effectivePresent,
                  )
              // Mismo backstop para el tono de piel: el generador rellena con
              // piel clara cuando el prompt no lo nombra.
              const missingSkin = composed.isPlaceOnlyScene
                ? []
                : missingComplexion(
                    candidate,
                    writerOptions.characters,
                    composed.effectivePresent,
                    writerOptions.style,
                  )
              // Y para la PRESENCIA: una escena marcada con personaje (todas,
              // con frecuencia «always») tiene que traerlo en el prompt.
              const missingCharacters = composed.isPlaceOnlyScene
                ? []
                : missingCharacterMention(
                    candidate,
                    writerOptions.characters,
                    composed.effectivePresent,
                    writerOptions.style,
                  ).map((index) => writerOptions.characters[index].name)
              const isComplete =
                missing.length === 0 &&
                missingSkin.length === 0 &&
                missingCharacters.length === 0
              if (isComplete || attempt === MAX_ATTEMPTS_PER_SCENE) {
                // Si el último intento igual dejó afuera al personaje o soltó
                // la tez, se repara por código.
                const finalPrompt = finalizeSceneImagePrompt(
                  currentScene,
                  orderedScenes,
                  lockedLlmPrompt(candidate, composed, writerOptions),
                  writerOptions.style.id,
                  writerOptions.visualBible,
                )
                const feedback = await narrativeObjection(
                  narrativeCandidateFor(
                    currentScene,
                    orderedScenes,
                    finalPrompt,
                  ),
                  writerOptions,
                )
                if (!feedback) {
                  imagePrompt = finalPrompt
                  break
                }
                lastFailure = {
                  source: 'reviewer',
                  detail: reviewerCorrection(feedback),
                }
                objectedPrompt = { prompt: finalPrompt, feedback }
                narrativeCorrection = narrativeCorrectionBlock(feedback)
                continue
              }
              lastFailure = { source: 'writer' }
              // Sin el personaje no tiene sentido corregirle el pelo o la tez:
              // primero que aparezca.
              identityCorrection =
                missingCharacters.length > 0
                  ? buildMissingCharacterCorrectionBlock(missingCharacters)
                  : (missing.length > 0
                      ? buildIdentityCorrectionBlock(missing)
                      : '') + buildComplexionCorrectionBlock(missingSkin)
            }
          } catch (error) {
            writerOptions.signal.throwIfAborted()
            // La rotación acotada ya ocurrió dentro del cliente. Repetir esta
            // excepción en barridos multiplicaba minutos sobre el mismo fallo.
            // Sin modelos para ESTA escena, queda sin prompt y el resto sigue;
            // la cuenta (clave, saldo) o un fallo desconocido tumban todo.
            if (
              !(error instanceof PipelineFailure) ||
              !MODELS_UNAVAILABLE_CODES.includes(error.code)
            )
              throw error
            lastFailure = { source: 'models' }
            break
          }
          if (attempt < MAX_ATTEMPTS_PER_SCENE)
            await delay(300 * attempt, undefined, {
              signal: writerOptions.signal,
            })
        }

        // Revisor permisivo: si los intentos se agotaron y el revisor solo
        // objetó (el prompt es del redactor, sobre esta narración), se acepta
        // el último objetado y la objeción queda en el log. No es relleno.
        if (!isValidPrompt(imagePrompt) && objectedPrompt) {
          writerOptions.onWarn?.(
            `scene ${scene.id} accepted with reviewer objection: ${reviewerCorrection(objectedPrompt.feedback)}`,
          )
          imagePrompt = objectedPrompt.prompt
        }

        if (!isValidPrompt(imagePrompt)) {
          failures.push({ scene, failure: lastFailure })
          return
        }

        // Si tenía un fallback previo y ahora hay prompt LLM, deja de serlo.
        const updated: Scene = {
          ...currentScene,
          imagePrompt,
          promptIsFallback: false,
        }
        delete updated.promptFailure
        results.set(scene.id, updated)
        await writerOptions.onSceneProcessed?.(updated)
      }),
    ),
  )

  options.signal.throwIfAborted()
  // Esperar todos evita callbacks tardíos escribiendo sobre el siguiente job.
  const rejected = settled.find((result) => result.status === 'rejected')
  if (rejected?.status === 'rejected') throw rejected.reason
  failures.sort((a, b) => a.scene.id - b.scene.id)
  for (const { scene, failure } of failures) {
    const failed: Scene = {
      ...scene,
      imagePrompt: '',
      promptIsFallback: false,
      promptFailure: failure,
    }
    results.set(scene.id, failed)
    await writerOptions.onSceneFailed?.(failed)
  }
  // Pocos huecos en un proyecto que sí tiene el resto: la corrida sigue y
  // esas escenas se rescatan desde el editor. Jamás se rellenan.
  const rescuable =
    failures.length <= (options.rescueLimit ?? 0) &&
    failures.length < scenes.length
  if (failures.length > 0 && !rescuable)
    throw new PipelineFailure(
      'catalog_prompts_incomplete',
      'scenes without valid narrative prompts: ' +
        failures
          .map(({ scene, failure }) => `${scene.id} (${failure.source})`)
          .join(', '),
    )

  return scenes.map((scene) => results.get(scene.id) ?? scene)
}

function narrativeCorrectionBlock(feedback: string): string {
  return `\nNARRATIVE CORRECTION FOR THIS SCENE: ${feedback}\nRewrite the prompt to depict its own fragment.`
}

// Punto de entrada: completar con modelos, nunca con una plantilla genérica.
export async function guaranteePrompts(
  scenes: Scene[],
  options: PromptWriterOptions,
): Promise<Scene[]> {
  options.signal.throwIfAborted()
  const result = await generateScenePrompts(scenes, options)
  options.signal.throwIfAborted()
  if (
    scenesMissingPrompt(result).some(
      (scene) =>
        (!options.sceneIds || options.sceneIds.has(scene.id)) &&
        !scene.promptFailure,
    )
  )
    throw new PipelineFailure(
      'catalog_prompts_incomplete',
      'catalog prompts are incomplete',
    )
  return result
}

// ─── Re-sanitización por content policy (la usa la stage images) ───

// Reescribe el prompt SOLO de las escenas rechazadas por CONTENIDO (o sin
// prompt válido). Las que fallaron por transporte conservan su prompt: (a)
// reescribirlo degradaba la calidad sin motivo, (b) quemaba una llamada LLM
// y (c) invalidaba la tarea YA PAGADA en el proveedor asíncrono. Gate E26.
export async function regeneratePromptsForRejected(
  scenes: Scene[],
  hasImage: (scene: Scene) => boolean,
  attempt: number,
  options: PromptWriterOptions,
): Promise<Scene[]> {
  const missing = scenes.filter(
    (scene) =>
      !hasImage(scene) &&
      (scene.contentRejected === true || !isValidPrompt(scene.imagePrompt)),
  )
  if (missing.length === 0) return scenes

  const writerOptions: PromptWriterOptions = {
    ...options,
    visualBible: neutralizeEraInBible(options.visualBible, options.fullScript),
  }
  const orderedScenes = [...scenes].sort((a, b) => a.id - b.id)
  const retryBlock = buildRetryAttemptBlock(attempt)
  const limit = limitConcurrency(LLM_CONCURRENCY)

  const settled = await Promise.allSettled(
    missing.map((scene) =>
      limit(async (): Promise<Scene> => {
        writerOptions.signal.throwIfAborted()
        // En el rescate manda la narración (o la ventana vecina si la escena
        // es muda), no el pedido manual: el mismo fragmento del redactor
        // principal, pasado como override para conservar esa precedencia.
        const composed = composeSceneRequest(
          scene,
          orderedScenes,
          scenes.length,
          writerOptions,
          narrationFragmentFor(scene, orderedScenes, writerOptions.fullScript)
            .text,
        )
        const userPrompt = composed.userPrompt + retryBlock

        let imagePrompt = ''
        let narrativeCorrection = ''
        let objectedPrompt: { prompt: string; feedback: string } | undefined
        for (let retry = 1; retry <= MAX_ATTEMPTS_PER_SCENE; retry++) {
          try {
            const content = await writerOptions.llm.generate({
              systemPrompt: writerOptions.style.systemPrompt,
              userPrompt: userPrompt + narrativeCorrection,
              jsonOnly: true,
              validate: (content) =>
                hasCatalogNarrative(
                  extractImagePrompt(content),
                  writerOptions.style,
                ),
              tier: retry === MAX_ATTEMPTS_PER_SCENE ? 'premium' : 'balanced',
            })
            writerOptions.signal.throwIfAborted()
            const extracted = extractImagePrompt(content)
            const candidate = hasCatalogNarrative(
              extracted,
              writerOptions.style,
            )
              ? finishLlmPrompt(extracted, composed, writerOptions.style)
              : ''
            if (isValidPrompt(candidate)) {
              // En el rescate por content policy el nombre pelado se suelta;
              // los rasgos icónicos que el redactor escribió quedan.
              // El reintento puede volver la escena un paisaje: el candado de
              // tez solo entra si el prompt todavía muestra a alguien.
              const finalPrompt = finalizeSceneImagePrompt(
                scene,
                orderedScenes,
                neutralizeFamousNames(
                  lockedLlmPrompt(candidate, composed, writerOptions, true),
                ),
                writerOptions.style.id,
                writerOptions.visualBible,
              )
              const feedback = await narrativeObjection(
                narrativeCandidateFor(
                  { ...scene, userPrompt: undefined },
                  orderedScenes,
                  finalPrompt,
                ),
                writerOptions,
              )
              if (!feedback) {
                imagePrompt = finalPrompt
                break
              }
              objectedPrompt = { prompt: finalPrompt, feedback }
              narrativeCorrection = `\nNARRATIVE CORRECTION FOR THIS SCENE: ${feedback}`
            }
          } catch (error) {
            writerOptions.signal.throwIfAborted()
            throw error
          }
          if (retry < MAX_ATTEMPTS_PER_SCENE)
            await delay(300 * retry, undefined, {
              signal: writerOptions.signal,
            })
        }

        writerOptions.signal.throwIfAborted()
        // Mismo criterio que el redactor principal: el último objetado vale.
        if (!isValidPrompt(imagePrompt) && objectedPrompt) {
          writerOptions.onWarn?.(
            `scene ${scene.id} accepted with reviewer objection: ${reviewerCorrection(objectedPrompt.feedback)}`,
          )
          imagePrompt = objectedPrompt.prompt
        }
        if (!isValidPrompt(imagePrompt))
          throw new PipelineFailure(
            'catalog_prompts_incomplete',
            'content-policy rewrite failed; no filler image will be requested',
          )
        const updated: Scene = {
          ...scene,
          imagePrompt,
          promptIsFallback: false,
        }
        await writerOptions.onSceneProcessed?.(updated)
        return updated
      }),
    ),
  )

  options.signal.throwIfAborted()
  const rejected = settled.find((result) => result.status === 'rejected')
  if (rejected?.status === 'rejected') throw rejected.reason
  const regenerated = settled.flatMap((result) =>
    result.status === 'fulfilled' ? [result.value] : [],
  )
  const byId = new Map(regenerated.map((scene) => [scene.id, scene]))
  return scenes.map((scene) => byId.get(scene.id) ?? scene)
}
