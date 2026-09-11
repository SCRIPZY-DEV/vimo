// Minutos que faltan para que un bloqueo venza, redondeados hacia arriba y
// nunca menos de 1: «vuelve en 0 min» miente mientras la tarjeta siga gris.
export function blockedMinutesLeft(blockedUntil: number): number {
  return Math.max(1, Math.ceil((blockedUntil - Date.now()) / 60_000))
}
