// El pedido de PROTAGONISTA a una gema sin personaje del usuario. Lo comparten
// las muestras del estilo (donde nació) y el video, que lo usa como ÚLTIMO
// recurso cuando la Fase 1 del carril verbatim no deja ninguna ficha usable:
// mejor una identidad pedida en formato formulario que un video entero con
// "the main character".

/**
 * La gema dice quién es su protagonista. Si lo trae escrito, es ESE (las
 * muestras y el video tienen que salir con el personaje del estilo); si no,
 * diseña uno coherente. La descripción vuelve neutra de estilo, pose y fondo:
 * se pega igual en todas las imágenes.
 */
export const PROTAGONIST_DESIGN_REQUEST =
  'PROTAGONIST DESIGN (platform technical request — do NOT write scene prompts now). ' +
  'Define the single protagonist of the script below. If your style already describes its own recurring character, narrator or subject, return THAT character exactly as your style defines it. ' +
  'If it does not, design one coherent with the script and with the world of your style. ' +
  'Return JSON only: {"description":"..."}. The description is the protagonist\'s permanent physical appearance in ENGLISH, 40 to 110 words, starting with who they are, then head/hair, one distinctive feature and the outfit with its colors. ' +
  'No pose, no framing, no expression, no background, no art style or technique words.'

/** El turno de usuario completo: el pedido y el guion del que sale el personaje. */
export function buildProtagonistDesignMessage(script: string): string {
  return `${PROTAGONIST_DESIGN_REQUEST}\n\nSCRIPT: ${script}`
}
