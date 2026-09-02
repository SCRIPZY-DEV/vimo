import { isValidPrompt } from '../../../prompts/prompt-limits.ts'
import { createVerbatimClient } from '../../../providers/llm/verbatim-client.ts'
import {
  loadPipelineCharacters,
  type PipelineCharacter,
} from '../../../project/characters.ts'
import { PipelineFailure } from '../../../runner/failure.ts'
import type { Scene } from '../../../types/scenes.ts'
import type { ProjectCharacter } from '../../../types/video-project.ts'
import type { VerbatimFragment } from '../../../prompts/verbatim-messages.ts'
import type { CreateVideoContext } from '../../context.ts'
import {
  generateVerbatimPrompts,
  type VerbatimCharacterInput,
} from './verbatim-writer.ts'

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
  /** Ids que ningún lote devolvió. El llamador decide si sigue (la Capa 4 de
   *  images cubre el hueco con su fallback determinístico). */
  missing: number[]
  /** Ids de escena que este pase ESCRIBIÓ (para persistir/emitir solo esas). */
  written: Set<number>
}

/**
 * Qué hace este video con el protagonista, derivado de los personajes del
 * proyecto. Adaptación del `personajeParaElMotor` del origen: allá el modo lo
 * declara la GEMA (`estiloPersonaje`, que acá llega en la rama del selector,
 * B3-P3) y el proyecto dice cuál; acá la gema todavía no declara nada, así
 * que manda lo que el proyecto trae — con foto → `reference` (la identidad
 * viaja en la imagen que el carril de personaje ya adjunta); sin foto pero
 * con descripción → `text`; sin personajes → `generic` (la Fase 1 de la gema
 * diseña uno, lo de siempre). El modo lo decide el ARCHIVO (la referencia
 * cargada), no el campo `mode` de la metadata: un proyecto puede declarar
 * foto y haberla perdido.
 */
export function verbatimCharacterFor(
  loaded: PipelineCharacter[],
  declared: ProjectCharacter[] | undefined,
): { input: VerbatimCharacterInput; index?: number } {
  if (loaded.length === 0) return { input: { mode: 'generic' } }

  const protagonistName = declared
    ?.find((character) => character.isProtagonist)
    ?.name?.trim()
  const foundIndex = protagonistName
    ? loaded.findIndex((character) => character.name === protagonistName)
    : 0
  const index = foundIndex >= 0 ? foundIndex : 0
  const chosen = loaded[index]!

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
 * La nota que viaja pegada al fragmento de una escena rechazada por
 * content-policy (v1.20.0 del origen, palabra por palabra — en español porque
 * es un mensaje AL MODELO del mismo idioma que el resto de la mecánica del
 * carril, no texto de UI). Nombra los motivos de rechazo más comunes con
 * todas las letras: famosos, violencia gráfica, sangre.
 */
export const CONTENT_POLICY_RETRY_NOTE =
  'El generador de imágenes rechazó la versión anterior de esta escena por sus políticas de contenido. Reescribe el prompt más neutro y family-friendly, sin nombres propios de personas reales ni de famosos, sin violencia gráfica, sangre ni matanzas explícitas (sugiere esas ideas con atmósfera y fuera de cuadro), manteniendo intacto el estilo visual.'

export interface VerbatimLaneOptions {
  /**
   * Nota de reintento POR ESCENA (E34, rescate por content-policy): cuando el
   * generador de imágenes rechaza una escena por contenido, la reescritura
   * también va por ESTE carril — el estilo del usuario nunca se pisa con el
   * de la casa — y la nota viaja pegada al fragmento, como mensaje de
   * usuario. La clave es el id de la escena.
   */
  retryNotes?: ReadonlyMap<number, string>
}

/**
 * La fase de prompts con el motor verbatim. Las escenas sin texto no llevan
 * prompt, y las que YA tienen prompt válido no se re-piden: en un resume o en
 * el rescate llegan 15 escenas con 8 prompts buenos y 7 agujeros —
 * re-escribir los 8 buenos gastaba tokens y podía CAMBIAR prompts que el
 * usuario ya vio. Quien quiere reescritura en serio primero vacía el
 * `imagePrompt` (el mismo gesto del flujo de regenerar).
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
      (scene.text?.trim().length ?? 0) > 0 && !isValidPrompt(scene.imagePrompt),
  )
  if (pending.length === 0) return { scenes, missing: [], written: new Set() }

  const fragments: VerbatimFragment[] = pending.map((scene) => {
    const retryNote = options.retryNotes?.get(scene.id)?.trim()
    const userNote = scene.userPrompt?.trim()
    const note = [userNote, retryNote].filter(Boolean).join(' ')
    return {
      n: scene.id,
      text: scene.text!.trim(),
      ...(note ? { note } : {}),
    }
  })

  const loadedCharacters = await loadPipelineCharacters(
    context.paths,
    context.options.characters,
  )
  const character = verbatimCharacterFor(
    loadedCharacters,
    context.options.characters,
  )

  const client = createVerbatimClient({
    apiKey,
    baseUrl: context.config.llm.baseUrl,
  })

  const result = await generateVerbatimPrompts(fragments, fullScript, {
    // La gema del usuario, VERBATIM: el snapshot del proyecto, sin los
    // ALLOWED SHOTS ni las GLOBAL_RULES del carril de la casa (paridad con el
    // origen: los planos solo gobiernan el carril del catálogo).
    gem: customStyle.systemPrompt,
    character: character.input,
    client,
    signal: context.signal,
    onLog: (message) =>
      context.emitter.emit({ type: 'log', level: 'info', message }),
    onWarn: (message) =>
      context.emitter.emit({ type: 'log', level: 'warn', message }),
    onProgress: (ready, total) => {
      context.emitter.emit({
        type: 'progress',
        stageId: 'scene-prompts',
        percent: total > 0 ? Math.round((ready / total) * 100) : 0,
        message: `${ready}/${total}`,
      })
    },
  })

  const written = new Set(result.prompts.keys())
  const withPrompts = scenes.map((scene) => {
    const prompt = result.prompts.get(scene.id)
    // Un prompt del motor nunca es fallback: si la escena traía uno, deja de
    // serlo.
    return prompt
      ? { ...scene, imagePrompt: prompt, promptIsFallback: false }
      : scene
  })

  return {
    scenes: markSubjectPresence(
      withPrompts,
      written,
      result.scenesWithSubject,
      character.index,
    ),
    missing: result.missing,
    written,
  }
}
