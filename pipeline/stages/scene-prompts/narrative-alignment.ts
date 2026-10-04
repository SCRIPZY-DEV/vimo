import type { PipelineContext } from '../../runner/context.ts'
import type { Scene } from '../../types/scenes.ts'
import { createSceneLlm, type SceneLlm } from '../shared/llm.ts'

// Correspondencia temporal de los prompts con su narración (ADR-0043).
//
// La revisión con un segundo modelo está RETIRADA desde el 2026-10-04, por
// decisión del dueño: su modelo fijo (DeepSeek V4 Pro en DeepInfra) empezó a
// devolver una copia de su entrada en vez de su veredicto, cada lote terminaba
// en `scene_prompt_alignment_failed` y ningún video pasaba de «Validando
// prompts», en el Catálogo ni en Mi estilo. Las pruebas con videos reales sin
// ella no mostraron imágenes de otro momento del relato. Lo que sigue vigente
// es el contexto local del redactor: cada escena con su fragmento, su
// intervalo y sus vecinos (`narrativeCandidateFor`).
//
// `reviewNarrativePrompts` y `createNarrativeReviewLlm` se conservan con su
// firma para que los carriles no cambien; la revisión no llama a ningún modelo
// y no objeta nada.

export interface NarrativePromptCandidate {
  sceneId: number
  startSeconds: number
  endSeconds: number
  source: string
  sourceKind: 'narration' | 'user-request' | 'silent-hold'
  previous: string
  next: string
  prompt: string
}

interface NarrativeReviewOptions {
  llm: SceneLlm
  signal: AbortSignal
}

// Cliente de los carriles para la revisión retirada: ya no se usa para llamar
// a un modelo.
export function createNarrativeReviewLlm(context: PipelineContext): SceneLlm {
  return createSceneLlm(context)
}

export function narrativeCandidateFor(
  scene: Scene,
  orderedScenes: readonly Scene[],
  prompt: string,
): NarrativePromptCandidate {
  const position = orderedScenes.findIndex(({ id }) => id === scene.id)
  const before = position < 0 ? [] : orderedScenes.slice(0, position)
  const after = position < 0 ? [] : orderedScenes.slice(position + 1)
  const previous = before.findLast(({ text }) => text.trim())?.text.trim() ?? ''
  const next = after.find(({ text }) => text.trim())?.text.trim() ?? ''
  const manual = scene.userPrompt?.trim() ?? ''
  const narration = scene.text.trim()
  const startSeconds = scene.startSeconds ?? 0
  const endSeconds = scene.endSeconds ?? startSeconds

  if (manual)
    return {
      sceneId: scene.id,
      startSeconds,
      endSeconds,
      source: manual,
      sourceKind: 'user-request',
      previous: '',
      next: '',
      prompt,
    }

  if (narration)
    return {
      sceneId: scene.id,
      startSeconds,
      endSeconds,
      source: narration,
      sourceKind: 'narration',
      previous,
      next,
      prompt,
    }

  // Una pausa sostiene lo anterior. Al inicio solo puede establecer el
  // contexto de lo que seguirá: el revisor no autoriza anticipar sus actos.
  return {
    sceneId: scene.id,
    startSeconds,
    endSeconds,
    source: previous || next,
    sourceKind: 'silent-hold',
    previous,
    next: previous ? '' : next,
    prompt,
  }
}

// Revisión retirada (ver arriba): no llama a ningún modelo, no objeta nada y
// ningún prompt se frena acá. Solo respeta la cancelación del job.
export async function reviewNarrativePrompts(
  _candidates: readonly NarrativePromptCandidate[],
  options: NarrativeReviewOptions,
): Promise<Map<number, string>> {
  options.signal.throwIfAborted()
  return new Map()
}
