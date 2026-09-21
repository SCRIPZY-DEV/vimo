import {
  DEFAULT_VIDEO_FORMAT,
  type VideoFormat,
} from '../types/video-format.ts'
import { VERBATIM_SCENE_WARDROBE } from './verbatim-messages.ts'

// Línea de anclaje de identidad para el carril de imagen CON referencia (port
// de lineaIdentidad / lineaIdentidadMulti de personaje_fal.ts). La REFERENCIA
// fija la IDENTIDAD (cara, pelo, rasgos); el prompt de la escena fija pose,
// cuerpo, ropa y fondo. El pelo queda anclado explícitamente (en tomas chicas
// el modelo lo soltaba y salían personajes calvos). Solo el nombre del frame
// depende del formato. El TONO DE PIEL también queda anclado: en el estilo
// realista el generador lo aclaraba según la luz de la escena.

// Cómo nombra el redactor a un personaje cuyo look viene SOLO de la foto (sin
// descripción canónica): el nombre más este ancla, sin rasgos inventados.
export const REFERENCE_PERSON_ANCHOR =
  'the person from the attached reference image'

export function buildReferenceIdentityLine(
  name: string,
  format: VideoFormat = DEFAULT_VIDEO_FORMAT,
): string {
  const trimmedName = name.trim() || 'the main character'
  return (
    `REFERENCE: the attached image defines the IDENTITY of "${trimmedName}" (face, skin tone, hair, distinctive features). ` +
    `Render THAT SAME character. ` +
    `${trimmedName}'s EXACT skin tone is part of that identity: reproduce the reference's skin tone and complexion in EVERY shot, never lighter or darker, whatever the scene's lighting or color grade. ` +
    `${trimmedName}'s EXACT hair is part of that identity: reproduce the reference's hair color, length and style (or bald head) in EVERY shot, no matter how small ${trimmedName} appears — never render ${trimmedName} bald or with different hair unless the reference itself shows it. ` +
    `Use the reference ONLY for who they are — follow the description below for the pose, full body, framing, clothing and scene. ` +
    `Do NOT copy the reference's crop, background or clothes unless the description says so. Keep ${trimmedName} perfectly consistent with the reference identity. ` +
    `Frame the shot exactly as the description dictates; when the scene calls for a full-body shot, fit the whole character inside the ${format} frame.\n\n`
  )
}

// Para 1 nombre devuelve EXACTAMENTE la línea simple; para 2, mapea cada
// imagen adjunta (en orden) a su personaje.
export function buildReferenceIdentityLineMulti(
  names: string[],
  format: VideoFormat = DEFAULT_VIDEO_FORMAT,
): string {
  const cleaned = names.map((name) => name.trim()).filter(Boolean)
  if (cleaned.length <= 1)
    return buildReferenceIdentityLine(cleaned[0] ?? '', format)

  const list = cleaned
    .map(
      (name, index) =>
        `attached image ${index + 1} defines the IDENTITY of "${name}"`,
    )
    .join('; ')
  const joinedNames = cleaned.join(' and ')
  return (
    `REFERENCE: ${list} (face, skin tone, hair, distinctive features). ` +
    `Render THOSE SAME characters together in this scene. ` +
    `Each character's EXACT skin tone is part of their identity: reproduce each reference's skin tone and complexion in EVERY shot, never lighter or darker, whatever the scene's lighting or color grade. ` +
    `Each character's EXACT hair is part of their identity: reproduce each reference's hair color, length and style (or bald head) in EVERY shot, no matter how small the characters appear — never render them bald or with different hair unless their own reference shows it. ` +
    `Use each reference ONLY for who that person is — follow the description below for the pose, full body, framing, clothing and scene. ` +
    `Do NOT copy the references' crops, backgrounds or clothes unless the description says so. Keep ${joinedNames} perfectly consistent with their reference identities, each one matching its OWN reference image. ` +
    `Frame the shot exactly as the description dictates; when the scene calls for a full-body shot, fit the whole characters inside the ${format} frame.\n\n`
  )
}

// Con ESTILO PROPIO la nota es otra (port de promptReferenciaEstiloPropio,
// personaje_fal.ts v1.48.2 del origen): la línea REFERENCE arriba, el prompt
// de la escena en el medio y el «APPEARANCE LOCK» abajo como un único párrafo.
// No lleva el formato del video: con gema el 16:9 / 9:16 viaja solo en el
// tamaño del pedido. El ancla del nombre DENTRO del prompt («X (the person
// from the attached reference image)») no la pone esta función: la teje el
// carril verbatim en la primera mención de cada escena.
//
// Desviación DECLARADA del port (2026-09-19): el candado suma «same skin tone»
// y «same distinctive accessories». El catálogo ancló el tono de piel en el
// fix del 2026-09-18 (el generador lo aclaraba con la luz de la escena) y el
// estilo propio se había quedado sin ese ancla. El fragmento «Apply the
// scene's art style only to the surroundings» es el marcador que el origen
// busca en su bundle; no reformular.
export function buildCustomStyleReferencePrompt(
  name: string,
  scenePrompt: string,
  sceneWardrobe: boolean = VERBATIM_SCENE_WARDROBE,
): string {
  const trimmedName = name.trim() || 'the main character'
  return (
    `REFERENCE: the attached image is "${trimmedName}", the main character of this video.\n\n` +
    `${scenePrompt.trim()}\n\n` +
    `APPEARANCE LOCK: ${trimmedName} must look exactly like the person in the attached reference image: ${lockedTraits(sceneWardrobe)}, in EVERY shot, even when ${trimmedName} appears small or far away. ` +
    `Apply the scene's art style only to the surroundings, never to ${trimmedName}. ` +
    `Ignore the reference image's background: place ${trimmedName} naturally in the scene, matching its lighting and perspective.`
  )
}

// Qué fija el candado. Con vestuario por escena, la ropa deja de estar
// atada a la foto: la manda la escena cuando la describe, y si no, la de la
// referencia.
function lockedTraits(sceneWardrobe: boolean): string {
  return sceneWardrobe
    ? "same face, same skin tone, same hair; when this scene describes other clothing, that clothing replaces the reference's, and the reference's signature hat, badge, coat and accessories stay on top of it wherever the scene allows it; otherwise the exact outfit of the reference"
    : 'same face, same skin tone, same hair, same distinctive accessories, same outfit'
}

// Para 1 nombre devuelve EXACTAMENTE la nota simple; para 2, cada imagen
// adjunta (en orden) es su personaje y el candado protege a los dos. Antes el
// texto nombraba y protegía solo al primero, y el editor SÍ arma grupos con
// dos fotos (`editorCharacterInput`): el segundo salía con otra cara.
export function buildCustomStyleReferencePromptMulti(
  names: string[],
  scenePrompt: string,
  sceneWardrobe: boolean = VERBATIM_SCENE_WARDROBE,
): string {
  const cleaned = names.map((name) => name.trim()).filter(Boolean)
  if (cleaned.length <= 1)
    return buildCustomStyleReferencePrompt(
      cleaned[0] ?? '',
      scenePrompt,
      sceneWardrobe,
    )

  const list = cleaned
    .map((name, index) => `attached image ${index + 1} is "${name}"`)
    .join('; ')
  const joinedNames = cleaned.join(' and ')
  return (
    `REFERENCE: ${list}, the main characters of this video.\n\n` +
    `${scenePrompt.trim()}\n\n` +
    `APPEARANCE LOCK: ${joinedNames} must each look exactly like the person in their OWN attached reference image: ${lockedTraits(sceneWardrobe)}, in EVERY shot, even when they appear small or far away. ` +
    `Apply the scene's art style only to the surroundings, never to ${joinedNames}. ` +
    `Ignore the reference images' backgrounds: place ${joinedNames} naturally in the scene, matching its lighting and perspective.`
  )
}
