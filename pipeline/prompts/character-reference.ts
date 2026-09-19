import {
  DEFAULT_VIDEO_FORMAT,
  type VideoFormat,
} from '../types/video-format.ts'

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

// Con ESTILO PROPIO la nota es otra (port byte a byte de
// promptReferenciaEstiloPropio, personaje_fal.ts v1.48.2 del origen): la línea
// REFERENCE arriba, el prompt de la escena en el medio y el «APPEARANCE LOCK»
// abajo como un único párrafo. No lleva el formato del video: con gema el
// 16:9 / 9:16 viaja solo en el tamaño del pedido. El ancla del nombre DENTRO
// del prompt («X (the person from the attached reference image)») no la pone
// esta función: la teje el carril verbatim en la primera mención de cada
// escena. Con dos referencias el texto nombra y protege solo a la primera,
// igual que allá (desde la UI no se llega: con gema el selector acepta una).
// El fragmento «Apply the scene's art style only to the surroundings» es el
// marcador que el origen busca en su bundle; no reformular.
export function buildCustomStyleReferencePrompt(
  name: string,
  scenePrompt: string,
): string {
  const trimmedName = name.trim() || 'the main character'
  return (
    `REFERENCE: the attached image is "${trimmedName}", the main character of this video.\n\n` +
    `${scenePrompt.trim()}\n\n` +
    `APPEARANCE LOCK: ${trimmedName} must look exactly like the person in the attached reference image: same face, same hair, same outfit, in EVERY shot, even when ${trimmedName} appears small or far away. ` +
    `Apply the scene's art style only to the surroundings, never to ${trimmedName}. ` +
    `Ignore the reference image's background: place ${trimmedName} naturally in the scene, matching its lighting and perspective.`
  )
}
