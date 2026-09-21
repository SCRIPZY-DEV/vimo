// Lectura de la respuesta a `PROTAGONIST_DESIGN_REQUEST`. Compartida por las
// muestras del estilo y por el último recurso de la Fase 1 del video.

// Presupuesto de contenido del pedido: una ficha de 40 a 110 palabras.
export const PROTAGONIST_TOKENS_BUDGET = 500

// Por debajo del mínimo no es una ficha (un "a man." no identifica a nadie);
// el máximo solo acota una respuesta desbocada.
const MIN_PROTAGONIST_LENGTH = 60
const MAX_PROTAGONIST_LENGTH = 1200

export function parseProtagonistDescription(content: string): string | null {
  const match = /\{[\s\S]*\}/.exec(content)
  if (!match) return null

  try {
    const parsed = JSON.parse(match[0]) as { description?: unknown }
    const description =
      typeof parsed.description === 'string' ? parsed.description.trim() : ''
    return description.length >= MIN_PROTAGONIST_LENGTH
      ? description.slice(0, MAX_PROTAGONIST_LENGTH)
      : null
  } catch {
    return null
  }
}
