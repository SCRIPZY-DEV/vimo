import { hasCatalogNarrative } from '../shared/catalog-prompt.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import { setTimeout as delay } from 'node:timers/promises'

import { isValidPrompt } from '../../prompts/prompt-limits.ts'
import {
  buildIdentityCorrectionBlock,
  buildRetryAttemptBlock,
  buildSceneCharacterBlock,
  characterIndicesInRequest,
} from '../../prompts/scene-prompt-blocks.ts'
import type { VisualStyle } from '../../prompts/visual-styles.ts'
import type { Scene } from '../../types/scenes.ts'
import { limitConcurrency } from '../../utils/concurrency.ts'
import { neutralizeFamousNames } from '../../utils/content-safety.ts'
import { neutralizeEraInBible } from '../../utils/story-era.ts'
import {
  anchorNormalRealism,
  missingHeadTraits,
  rewriteSceneryWithoutCharacter,
  type PromptCharacter,
} from './fallback-prompt.ts'
import { isPhotorealisticStyle } from '../shared/prompt-safety.ts'
import type { SceneLlm } from '../shared/llm.ts'
import { buildContextWindow, buildSceneUserPrompt } from './prompt-composer.ts'
import { extractImagePrompt } from './prompt-extraction.ts'
import { buildScenePlanBlock } from './scene-director.ts'

// Catálogo: cada respuesta se valida antes de anclar estilo; el cliente rota
// modelos. Nunca se persiste relleno. Cancelación y errores dejan el trabajo
// válido ya guardado para reanudar (ADR-0036).
const MAX_ATTEMPTS_PER_SCENE = 3
const LLM_CONCURRENCY = 6

export interface PromptWriterOptions {
  llm: SceneLlm
  style: VisualStyle
  fullScript: string
  visualBible?: string
  characters: PromptCharacter[]
  // Nombre inglés del idioma del guion ("" → el LLM lo infiere).
  imageTextLanguage: string
  signal: AbortSignal
  sceneIds?: ReadonlySet<number>
  // Persistencia incremental: se llama tras cada escena con prompt nuevo —
  // también en la reescritura por content policy desde la fase de imágenes,
  // que lo usa para reemitir scene-prompt-ready.
  onSceneProcessed?(scene: Scene): Promise<void> | void
}

function hasText(scene: Scene): boolean {
  return (scene.text?.trim().length ?? 0) > 0
}

function scenesMissingPrompt(scenes: Scene[]): Scene[] {
  return scenes.filter(
    (scene) => hasText(scene) && !isValidPrompt(scene.imagePrompt),
  )
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
}

function composeSceneRequest(
  scene: Scene,
  orderedScenes: Scene[],
  totalScenes: number,
  options: PromptWriterOptions,
  fragmentOverride?: string,
): ComposedSceneRequest {
  const isUserRequest = (scene.userPrompt?.trim().length ?? 0) > 0
  const fragment = (
    fragmentOverride ??
    (scene.userPrompt?.trim() || scene.text || '')
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
    mandatoryBlock: characterBlock + planBlock,
    imageTextLanguage: options.imageTextLanguage,
  })

  return {
    userPrompt,
    isUserRequest,
    isPlaceOnlyScene,
    effectivePresent: present.length > 0 ? present : requestedIndexes,
  }
}

// Post-proceso común de una salida del LLM: ancla de realismo + reenvoltorio
// sin muñeco cuando corresponde.
function finishLlmPrompt(
  rawPrompt: string,
  scene: Scene,
  composed: ComposedSceneRequest,
  style: VisualStyle,
): string {
  const anchored = anchorNormalRealism(rawPrompt, style)
  return composed.isPlaceOnlyScene
    ? rewriteSceneryWithoutCharacter(anchored, style, scene.text || '')
    : anchored
}

// ─── Capa 1: pasada principal ───

interface GenerateOptions extends PromptWriterOptions {
  // true en el barrido: directo al tier premium (ya agotó el balanced).
  escalateTier?: boolean
}

// Procesa SOLO las escenas sin prompt válido (con texto o pedido manual).
// Si TODAS fallan lanza; si algunas, devuelve el mix y el caller sigue.
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
      !isValidPrompt(scene.imagePrompt) &&
      (hasText(scene) || (scene.userPrompt?.trim().length ?? 0) > 0),
  )
  if (toProcess.length === 0) return scenes

  const limit = limitConcurrency(LLM_CONCURRENCY)
  const results = new Map<number, Scene>()
  const failures: { id: number; message: string }[] = []
  const orderedScenes = [...scenes].sort((a, b) => a.id - b.id)
  const normalize = (text: string) =>
    text.toLowerCase().replace(/\s+/g, ' ').trim()
  const accepted = new Map<string, string>()
  for (const scene of scenes) {
    if (isValidPrompt(scene.imagePrompt))
      accepted.set(
        normalize(scene.imagePrompt),
        normalize(scene.userPrompt?.trim() || scene.text),
      )
  }

  const settled = await Promise.allSettled(
    toProcess.map((scene) =>
      limit(async () => {
        writerOptions.signal.throwIfAborted()

        const composed = composeSceneRequest(
          scene,
          orderedScenes,
          scenes.length,
          writerOptions,
        )

        let imagePrompt = ''
        let lastError = ''
        // Si un intento soltó rasgos de cabeza canónicos, el siguiente lleva
        // la corrección explícita adjunta.
        let identityCorrection = ''
        for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_SCENE; attempt++) {
          try {
            const content = await writerOptions.llm.generate({
              systemPrompt: writerOptions.style.systemPrompt,
              userPrompt: composed.userPrompt + identityCorrection,
              jsonOnly: true,
              validate(content) {
                const prompt = extractImagePrompt(content)
                if (!hasCatalogNarrative(prompt, writerOptions.style))
                  return false
                const final = normalize(
                  finishLlmPrompt(prompt, scene, composed, writerOptions.style),
                )
                const fragment = normalize(
                  scene.userPrompt?.trim() || scene.text,
                )
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
              ? finishLlmPrompt(extracted, scene, composed, writerOptions.style)
              : ''
            if (!isValidPrompt(candidate)) {
              lastError = 'the LLM returned an empty or invalid prompt'
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
              if (missing.length === 0 || attempt === MAX_ATTEMPTS_PER_SCENE) {
                imagePrompt = candidate
                break
              }
              lastError = `the prompt dropped canonical head traits (${missing.join(', ')})`
              identityCorrection = buildIdentityCorrectionBlock(missing)
            }
          } catch (error) {
            writerOptions.signal.throwIfAborted()
            // La rotación acotada ya ocurrió dentro del cliente. Repetir esta
            // excepción en barridos multiplicaba minutos sobre el mismo fallo.
            throw error
          }
          if (attempt < MAX_ATTEMPTS_PER_SCENE)
            await delay(300 * attempt, undefined, {
              signal: writerOptions.signal,
            })
        }

        if (!isValidPrompt(imagePrompt)) {
          failures.push({ id: scene.id, message: lastError })
          return
        }

        // Si tenía un fallback previo y ahora hay prompt LLM, deja de serlo.
        const updated: Scene = {
          ...scene,
          imagePrompt,
          promptIsFallback: false,
        }
        results.set(scene.id, updated)
        await writerOptions.onSceneProcessed?.(updated)
      }),
    ),
  )

  options.signal.throwIfAborted()
  // Esperar todos evita callbacks tardíos escribiendo sobre el siguiente job.
  const rejected = settled.find((result) => result.status === 'rejected')
  if (rejected?.status === 'rejected') throw rejected.reason
  if (failures.length > 0)
    throw new PipelineFailure(
      'catalog_prompts_incomplete',
      'scenes without valid narrative prompts: ' +
        failures.map((failure) => failure.id).join(', '),
    )

  return scenes.map((scene) => results.get(scene.id) ?? scene)
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
      (scene) => !options.sceneIds || options.sceneIds.has(scene.id),
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
        // Sin texto (corte mid-word): la ventana de vecinas (o el inicio del
        // guion) como fragmento, para igual generar un prompt coherente.
        let text = (scene.text ?? '').trim()
        if (!text) {
          text =
            buildContextWindow(orderedScenes, scene.id, 320) ||
            writerOptions.fullScript.slice(0, 320)
        }

        const composed = composeSceneRequest(
          scene,
          orderedScenes,
          scenes.length,
          writerOptions,
          text,
        )
        const userPrompt = composed.userPrompt + retryBlock

        let imagePrompt = ''
        for (let retry = 1; retry <= MAX_ATTEMPTS_PER_SCENE; retry++) {
          try {
            const content = await writerOptions.llm.generate({
              systemPrompt: writerOptions.style.systemPrompt,
              userPrompt,
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
              ? finishLlmPrompt(extracted, scene, composed, writerOptions.style)
              : ''
            if (isValidPrompt(candidate)) {
              // En el rescate por content policy el nombre pelado se suelta;
              // los rasgos icónicos que el redactor escribió quedan.
              imagePrompt = neutralizeFamousNames(candidate)
              break
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
