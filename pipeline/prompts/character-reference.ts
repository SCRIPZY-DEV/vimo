// Línea de anclaje de identidad para el carril de imagen CON referencia (port
// de lineaIdentidad / lineaIdentidadMulti de personaje_fal.ts). La REFERENCIA
// fija la IDENTIDAD (cara, pelo, rasgos); el prompt de la escena fija pose,
// cuerpo, ropa y fondo. El pelo queda anclado explícitamente (en tomas chicas
// el modelo lo soltaba y salían personajes calvos).

export function buildReferenceIdentityLine(name: string): string {
  const trimmedName = name.trim() || 'the main character'
  return (
    `REFERENCE: the attached image defines the IDENTITY of "${trimmedName}" (face, hair, distinctive features). ` +
    `Render THAT SAME character. ` +
    `${trimmedName}'s EXACT hair is part of that identity: reproduce the reference's hair color, length and style (or bald head) in EVERY shot, no matter how small ${trimmedName} appears — never render ${trimmedName} bald or with different hair unless the reference itself shows it. ` +
    `Use the reference ONLY for who they are — follow the description below for the pose, full body, framing, clothing and scene. ` +
    `Do NOT copy the reference's crop, background or clothes unless the description says so. Keep ${trimmedName} perfectly consistent with the reference identity. ` +
    `Frame the shot exactly as the description dictates; when the scene calls for a full-body shot, fit the whole character inside the 16:9 frame.\n\n`
  )
}

// Para 1 nombre devuelve EXACTAMENTE la línea simple; para 2, mapea cada
// imagen adjunta (en orden) a su personaje.
export function buildReferenceIdentityLineMulti(names: string[]): string {
  const cleaned = names.map((name) => name.trim()).filter(Boolean)
  if (cleaned.length <= 1) return buildReferenceIdentityLine(cleaned[0] ?? '')

  const list = cleaned
    .map(
      (name, index) =>
        `attached image ${index + 1} defines the IDENTITY of "${name}"`,
    )
    .join('; ')
  const joinedNames = cleaned.join(' and ')
  return (
    `REFERENCE: ${list} (face, hair, distinctive features). ` +
    `Render THOSE SAME characters together in this scene. ` +
    `Each character's EXACT hair is part of their identity: reproduce each reference's hair color, length and style (or bald head) in EVERY shot, no matter how small the characters appear — never render them bald or with different hair unless their own reference shows it. ` +
    `Use each reference ONLY for who that person is — follow the description below for the pose, full body, framing, clothing and scene. ` +
    `Do NOT copy the references' crops, backgrounds or clothes unless the description says so. Keep ${joinedNames} perfectly consistent with their reference identities, each one matching its OWN reference image. ` +
    `Frame the shot exactly as the description dictates; when the scene calls for a full-body shot, fit the whole characters inside the 16:9 frame.\n\n`
  )
}
