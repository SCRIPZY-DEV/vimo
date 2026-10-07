import { join } from 'node:path'

import { readImageAsDataUri } from '../../project/characters.ts'
import { DESCRIPTION_HEADER } from '../../prompts/verbatim-identity.ts'
import type { PipelineContext } from '../../runner/context.ts'
import {
  descriptionFromUserPrompt,
  fallbackUserDescription,
  pointSubjectToImage,
  removeSubject,
  weaveSubject,
} from '../../stages/scene-prompts/verbatim/subject-weaver.ts'
import type { CustomStyleSummary } from '../../types/styles.ts'
import {
  assertValidCharacterId,
  charactersRoot,
  readCharacterMetadata,
} from '../characters/character-library.ts'

// Con qué protagonista salen las muestras de una gema (mismo reparto que el
// video, ADR-0020):
//  - none      — la gema va «sin personaje»: pedidos como siempre.
//  - design    — no hay personaje del usuario (genérico, «Mi personaje» sin
//                predeterminado, o el predeterminado ya no está): lo define
//                la gema — el que ella describe, o uno diseñado — y se usa el
//                MISMO en las cuatro muestras.
//  - reference — personaje de la biblioteca con foto: la identidad viaja
//                adjunta, como en el carril de personaje del video. Lleva igual
//                la descripción, que es a donde se cae si la referencia falla.
//  - text      — personaje de identidad de prompt (con o sin retrato): la
//                identidad viaja como texto, idéntica en las cuatro.
export type SampleCharacter =
  | { mode: 'none' }
  | { mode: 'text'; name: string; description: string }
  | {
      mode: 'reference'
      name: string
      description: string
      imageDataUri: string
    }

// Lo que sale de mirar la gema y la biblioteca: `design` todavía necesita que
// la gema defina a su protagonista (lo hace generate-style-samples).
export type ResolvedSampleCharacter = SampleCharacter | { mode: 'design' }

export async function resolveSampleCharacter(
  context: PipelineContext,
  style: CustomStyleSummary,
): Promise<ResolvedSampleCharacter> {
  if (style.character?.mode === 'none') return { mode: 'none' }

  const characterId = style.character?.defaultCharacterId
  if (style.character?.mode !== 'own' || !characterId) return { mode: 'design' }

  const warn = (message: string) => {
    context.emitter.emit({ type: 'log', level: 'warn', message })
  }

  try {
    assertValidCharacterId(characterId)
  } catch {
    warn(`style "${style.id}" points to an invalid character id`)
    return { mode: 'design' }
  }

  // El puntero puede haber quedado huérfano (personaje borrado): la UI ya lo
  // avisa en el modal; acá las muestras salen con el de la gema, igual que un
  // video de esta gema al que no le llega personaje.
  const libraryDirectory = join(charactersRoot(context), characterId)
  const metadata = await readCharacterMetadata(libraryDirectory)
  if (!metadata?.name?.trim()) {
    warn(
      `style "${style.id}" points to character "${characterId}", which is not in the library — samples use the style's own protagonist`,
    )
    return { mode: 'design' }
  }

  const name = metadata.name.trim()
  const description = metadata.description?.trim() ?? ''

  // Misma elección que al crear un video: solo la foto viaja como imagen, en
  // todos los estilos (ADR-0033). Un personaje de identidad de prompt sale
  // dibujado desde su texto aunque tenga retrato en esta gema (enmienda del
  // 2026-10-02 a la ADR-0021).
  const imageDataUri = metadata.photoFile
    ? await readImageAsDataUri(join(libraryDirectory, metadata.photoFile))
    : undefined

  if (imageDataUri)
    return { mode: 'reference', name, description, imageDataUri }
  if (description) return { mode: 'text', name, description }

  warn(
    `character "${characterId}" has neither a usable image nor a description — samples use the style's own protagonist`,
  )
  return { mode: 'design' }
}

// La identidad en texto, tejida con las mismas funciones que el video:
// `[subject]` pasa a ser el rol y la descripción se pega AL FINAL, idéntica en
// las cuatro muestras. En una muestra el protagonista está SIEMPRE en escena:
// si el modelo no escribió ni la etiqueta ni una mención, la descripción se
// pega igual. La poda quita el estado de retrato; si no deja nada usable
// viaja la descripción apenas limpia (la misma red que el video).
export function weaveSampleIdentity(
  imagePrompt: string,
  description: string,
  name?: string,
): string {
  const identity =
    descriptionFromUserPrompt(description) ||
    fallbackUserDescription(description)
  const woven = weaveSubject(imagePrompt, identity || undefined, name)
  if (!identity || woven.includes(DESCRIPTION_HEADER)) return woven

  const separator = /[.!?]$/.test(woven) ? ' ' : '. '
  return `${woven}${separator}${DESCRIPTION_HEADER} ${identity}`
}

// La identidad en la imagen adjunta: `[subject]` pasa a ser el nombre, atado
// a la referencia en su primera mención (mismo tejido que el video).
export function pointSampleToReference(
  imagePrompt: string,
  name: string,
): string {
  return pointSubjectToImage(imagePrompt, name)
}

// Muestra sin protagonista: si la etiqueta aparece igual, se degrada a una
// persona sin identidad fija (misma red que el video sin personaje).
export function neutralizeSampleSubject(imagePrompt: string): string {
  return removeSubject(imagePrompt)
}
