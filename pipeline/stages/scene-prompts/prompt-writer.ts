import { isLlmAuthFailure } from '../../providers/llm/auth-failure.ts'
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
  buildDeterministicFallbackPrompt,
  missingHeadTraits,
  rewriteSceneryWithoutCharacter,
  type PromptCharacter,
} from './fallback-prompt.ts'
import { isPhotorealisticStyle } from '../shared/prompt-safety.ts'
import type { SceneLlm } from '../shared/llm.ts'
import { buildContextWindow, buildSceneUserPrompt } from './prompt-composer.ts'
import {
  cleanPlainTextPrompt,
  extractImagePrompt,
} from './prompt-extraction.ts'
import { buildScenePlanBlock } from './scene-director.ts'

// Redactor de prompts por escena (port de generarPromptsImagen /
// garantizarPrompts / rescatarPromptEscenaTextoPlano /
// regenerarPromptsParaFaltantes del parser del origen). Invariante: toda
// escena con texto sale con un prompt VÁLIDO, vía 4 capas en profundidad:
//   1. pasada principal con reintentos por escena (2 balanced + 3º premium),
//   2. barrido loop-until-dry SOLO sobre las faltantes, directo a premium,
//   2.5. rescate en TEXTO PLANO (el modo de falla dominante es el JSON roto),
//   3. fallback determinístico coherente (sin LLM).
// Idempotente: una escena con prompt válido nunca se re-genera.

const MAX_ATTEMPTS_PER_SCENE = 3
const MAX_SWEEP_ROUNDS = 3
const MAX_PLAIN_TEXT_RESCUE_ATTEMPTS = 2
// DeepInfra sostiene esta concurrencia sin 429 (valor medido del origen).
const LLM_CONCURRENCY = 100

export interface PromptWriterOptions {
  llm: SceneLlm
  style: VisualStyle
  fullScript: string
  visualBible?: string
  characters: PromptCharacter[]
  // Nombre inglés del idioma del guion ("" → el LLM lo infiere).
  imageTextLanguage: string
  signal: AbortSignal
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
  if (scenes.length === 0) return []

  // Gate de época en el punto de entrada: la biblia con era alucinada se
  // neutraliza y todo lo de abajo hereda el fix.
  const writerOptions: GenerateOptions = {
    ...options,
    visualBible: neutralizeEraInBible(options.visualBible, options.fullScript),
  }

  const toProcess = scenes.filter(
    (scene) =>
      !isValidPrompt(scene.imagePrompt) &&
      (hasText(scene) || (scene.userPrompt?.trim().length ?? 0) > 0),
  )
  if (toProcess.length === 0) return scenes

  const limit = limitConcurrency(LLM_CONCURRENCY)
  const results = new Map<number, Scene>()
  const failures: { id: number; message: string }[] = []
  const orderedScenes = [...scenes].sort((a, b) => a.id - b.id)

  await Promise.all(
    toProcess.map((scene) =>
      limit(async () => {
        if (writerOptions.signal.aborted) return

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
              // Escalada de tiers: el ÚLTIMO intento (y todo el barrido) va
              // al premium con el mismo prompt completo.
              tier:
                writerOptions.escalateTier || attempt === MAX_ATTEMPTS_PER_SCENE
                  ? 'premium'
                  : 'balanced',
            })

            const candidate = finishLlmPrompt(
              extractImagePrompt(content),
              scene,
              composed,
              writerOptions.style,
            )
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
            if (writerOptions.signal.aborted) return
            // Clave rechazada: ninguna capa de garantía la cura y el
            // fallback determinístico escondería el problema. Corta el job.
            if (isLlmAuthFailure(error)) throw error
            lastError = error instanceof Error ? error.message : String(error)
          }
          if (attempt < MAX_ATTEMPTS_PER_SCENE) await delay(300 * attempt)
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

  if (failures.length === toProcess.length && failures.length > 0) {
    const sample = failures
      .slice(0, 3)
      .map((failure) => `#${failure.id}: ${failure.message}`)
    throw new Error(
      `all ${failures.length} scenes that needed a prompt failed: ${sample.join(' | ')}`,
    )
  }

  return scenes.map((scene) => results.get(scene.id) ?? scene)
}

// ─── Capa 2.5: rescate en texto plano ───

// Cuando una escena agotó los intentos JSON, se le pide al MISMO redactor el
// prompt en TEXTO PLANO: mismos bloques, solo cambia el formato de salida.
// Devuelve "" si tampoco lo logró.
async function rescuePlainTextPrompt(
  scene: Scene,
  orderedScenes: Scene[],
  totalScenes: number,
  options: PromptWriterOptions,
): Promise<string> {
  const composed = composeSceneRequest(
    scene,
    orderedScenes,
    totalScenes,
    options,
  )
  const userPrompt =
    composed.userPrompt +
    `\n\n# OUTPUT FORMAT OVERRIDE — PLAIN TEXT ONLY\nIgnore any earlier instruction about JSON. Do NOT return JSON, markdown or commentary. Return ONLY the final image prompt as one plain-text paragraph, nothing else.`

  for (let attempt = 1; attempt <= MAX_PLAIN_TEXT_RESCUE_ATTEMPTS; attempt++) {
    try {
      const content = await options.llm.generate({
        systemPrompt: options.style.systemPrompt,
        userPrompt,
        jsonOnly: false,
        // Último recurso con LLM: directo al premium.
        tier: 'premium',
      })
      const candidate = finishLlmPrompt(
        cleanPlainTextPrompt(content),
        scene,
        composed,
        options.style,
      )
      if (isValidPrompt(candidate)) return candidate
    } catch (error) {
      if (options.signal.aborted) return ''
      if (isLlmAuthFailure(error)) throw error
      // Transitorio: reintentar abajo con backoff.
    }
    if (attempt < MAX_PLAIN_TEXT_RESCUE_ATTEMPTS) await delay(400 * attempt)
  }
  return ''
}

// ─── Punto de entrada: garantía de prompts ───

export async function guaranteePrompts(
  scenes: Scene[],
  options: PromptWriterOptions,
): Promise<Scene[]> {
  if (scenes.length === 0) return []

  // Capa 1 — si falla entera, el barrido + fallback igual garantizan.
  let result = scenes
  try {
    result = await generateScenePrompts(scenes, options)
  } catch (error) {
    // Clave rechazada: ninguna capa la cura; el job tiene que fallar.
    if (isLlmAuthFailure(error)) throw error
    // Sigue con barrido + fallback.
  }

  // Capa 2 — barrido loop-until-dry, directo a premium.
  for (let round = 1; round <= MAX_SWEEP_ROUNDS; round++) {
    if (scenesMissingPrompt(result).length === 0) break
    try {
      result = await generateScenePrompts(result, {
        ...options,
        escalateTier: true,
      })
    } catch (error) {
      if (isLlmAuthFailure(error)) throw error
      // Siguiente ronda / fallback.
    }
  }

  // Capa 2.5 — rescate en texto plano (respeta la cancelación).
  const pendingRescue = scenesMissingPrompt(result)
  if (pendingRescue.length > 0 && !options.signal.aborted) {
    const orderedScenes = [...result].sort((a, b) => a.id - b.id)
    const limit = limitConcurrency(LLM_CONCURRENCY)
    const rescued = new Map<number, string>()
    await Promise.all(
      pendingRescue.map((scene) =>
        limit(async () => {
          if (options.signal.aborted) return
          const prompt = await rescuePlainTextPrompt(
            scene,
            orderedScenes,
            result.length,
            options,
          )
          if (isValidPrompt(prompt)) rescued.set(scene.id, prompt)
        }),
      ),
    )
    if (rescued.size > 0) {
      result = result.map((scene) =>
        rescued.has(scene.id)
          ? {
              ...scene,
              imagePrompt: rescued.get(scene.id)!,
              promptIsFallback: false,
            }
          : scene,
      )
      for (const scene of result) {
        if (rescued.has(scene.id)) await options.onSceneProcessed?.(scene)
      }
    }
  }

  // Capa 3 — fallback determinístico coherente.
  const pendingFinal = scenesMissingPrompt(result)
  if (pendingFinal.length > 0) {
    const orderedScenes = [...result].sort((a, b) => a.id - b.id)
    const pendingIds = new Set(pendingFinal.map((scene) => scene.id))
    const visualBible = neutralizeEraInBible(
      options.visualBible,
      options.fullScript,
    )
    result = result.map((scene) => {
      if (!pendingIds.has(scene.id)) return scene
      const prompt = anchorNormalRealism(
        buildDeterministicFallbackPrompt(
          scene,
          visualBible,
          options.style,
          orderedScenes,
          options.characters,
          options.imageTextLanguage,
        ),
        options.style,
      )
      return { ...scene, imagePrompt: prompt, promptIsFallback: true }
    })
    for (const scene of result) {
      if (pendingIds.has(scene.id)) await options.onSceneProcessed?.(scene)
    }
  }

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

  const regenerated = await Promise.all(
    missing.map((scene) =>
      limit(async (): Promise<Scene> => {
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
              tier: retry === MAX_ATTEMPTS_PER_SCENE ? 'premium' : 'balanced',
            })
            const candidate = finishLlmPrompt(
              extractImagePrompt(content),
              scene,
              composed,
              writerOptions.style,
            )
            if (isValidPrompt(candidate)) {
              // En el rescate por content policy el nombre pelado se suelta;
              // los rasgos icónicos que el redactor escribió quedan.
              imagePrompt = neutralizeFamousNames(candidate)
              break
            }
          } catch (error) {
            if (writerOptions.signal.aborted) return scene
            if (isLlmAuthFailure(error)) throw error
            // Transitorio: reintentar abajo.
          }
          if (retry < MAX_ATTEMPTS_PER_SCENE) await delay(300 * retry)
        }

        // NO se conserva el prompt anterior: es JUSTO el que el modelo de
        // imágenes rechazó — reenviarlo byte-por-byte vuelve a fallar.
        const updated: Scene = isValidPrompt(imagePrompt)
          ? { ...scene, imagePrompt, promptIsFallback: false }
          : {
              ...scene,
              imagePrompt: anchorNormalRealism(
                buildDeterministicFallbackPrompt(
                  { ...scene, text },
                  writerOptions.visualBible,
                  writerOptions.style,
                  orderedScenes,
                  writerOptions.characters,
                  writerOptions.imageTextLanguage,
                ),
                writerOptions.style,
              ),
              promptIsFallback: true,
            }
        await writerOptions.onSceneProcessed?.(updated)
        return updated
      }),
    ),
  )

  const byId = new Map(regenerated.map((scene) => [scene.id, scene]))
  return scenes.map((scene) => byId.get(scene.id) ?? scene)
}
