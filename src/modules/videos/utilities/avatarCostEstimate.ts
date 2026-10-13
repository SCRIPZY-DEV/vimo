import { slotDurationSeconds } from '@pipeline/animation/timing.ts'
import {
  AVATAR_DEFAULT_ENGINE,
  AVATAR_EARLY_APPEARANCES,
  AVATAR_EARLY_MAX_SECONDS,
  avatarUsdPerMinute,
  estimateAvatarUsd,
} from '@pipeline/types/avatar.ts'
import type { CostEstimateLine } from '@/modules/common/types/credits'
import type { CreateFormValue } from '@/modules/videos/types/create'
import type { AvatarSpanWindow } from '@pipeline/runner/events.ts'
import type {
  AvatarEngine,
  AvatarLookType,
  ProjectAvatarOptions,
} from '@pipeline/types/avatar.ts'

// Decimales del estimado en la UI: solo sacan el ruido de la coma flotante.
const AVATAR_USD_DECIMALS = 6

// Tarifa de HeyGen en USD por minuto para un tipo de look y un motor (desde la
// entrega 2e, el que eligió la persona; sin motor, AVATAR_DEFAULT_ENGINE). La
// tabla y la fórmula viven en pipeline/types/avatar.ts. null = el motor no
// aplica a ese tipo de look.
export function avatarRatePerMinute(
  lookType: AvatarLookType,
  engine: AvatarEngine = AVATAR_DEFAULT_ENGINE,
): number | null {
  return avatarUsdPerMinute(engine, lookType)
}

// Dólares por `seconds` de avatar, exactos (spec §9: segundos / 60 × tarifa),
// con el estimador de pipeline/types/avatar.ts (el mismo que usa la fase).
// Sin factor de seguridad (spec §8, saldo antes de cada escena): desde la
// entrega 2g cada aparición termina en la pausa más cercana a lo elegido, así
// que el tramo real queda a ±0,5 s (diseño §23.2; salvo las tres primeras de
// «3 veces en 2 minutos» en su tope, que pueden quedar hasta ~1 s más cortas)
// y la fase vuelve a comparar con el saldo antes de pagar. El redondeo a 6
// decimales solo saca el ruido de la coma flotante: 10 s a 0,99 US$/min son
// 0,165, no 0,16499999…
export function avatarUsd(
  lookType: AvatarLookType,
  seconds: number,
  engine: AvatarEngine = AVATAR_DEFAULT_ENGINE,
): number | null {
  const usd = estimateAvatarUsd(seconds, engine, lookType)
  if (usd === null) return null

  return Number(usd.toFixed(AVATAR_USD_DECIMALS))
}

// Lo que decide cuántas apariciones y cuántos segundos de avatar salen, con la
// forma de las opciones del proyecto (ProjectAvatarOptions): Crear lo arma del
// formulario (createAvatarAppearances y createAvatarSeconds) y reanudar lo lee
// de project.json (estimateResumeCost). Es UNA cuenta para los dos (entrega
// 2f): así el costo que ve la persona al crear y al reanudar no diverge.
export type AvatarAppearancesChoice = Pick<
  ProjectAvatarOptions,
  'appearances' | 'secondsPerAppearance' | 'threeInFirstTwoMinutes'
>

// Apariciones que salen. Con «3 veces en 2 minutos» (entrega 2f, diseño §22.2,
// R-2f-2) al menos AVATAR_EARLY_APPEARANCES aunque se hayan pedido menos: el
// planificador del sidecar (pipeline/avatar/planner.ts) las sube a ese mínimo
// y lee la opción igual que acá (solo `true` la prende).
export function avatarRequestedAppearances(
  choice: AvatarAppearancesChoice,
): number {
  if (choice.threeInFirstTwoMinutes !== true) return choice.appearances

  return Math.max(choice.appearances, AVATAR_EARLY_APPEARANCES)
}

// Segundos de avatar que salen. Con «3 veces en 2 minutos» cuenta lo que sale
// de verdad (R-2f-3): las tres primeras apuntan a lo sumo a
// AVATAR_EARLY_MAX_SECONDS para entrar en los 2 minutos y las demás usan los
// segundos elegidos. Apagada, apariciones × segundos, como siempre.
export function avatarRequestedSeconds(
  choice: AvatarAppearancesChoice,
): number {
  const seconds = choice.secondsPerAppearance
  if (choice.threeInFirstTwoMinutes !== true)
    return choice.appearances * seconds

  const earlySeconds =
    AVATAR_EARLY_APPEARANCES * Math.min(seconds, AVATAR_EARLY_MAX_SECONDS)
  const laterAppearances =
    avatarRequestedAppearances(choice) - AVATAR_EARLY_APPEARANCES

  return earlySeconds + laterAppearances * seconds
}

// Apariciones del avatar que va a pedir el formulario; 0 con el avatar
// apagado.
export function createAvatarAppearances(form: CreateFormValue): number {
  if (!form.useAvatar) return 0

  return avatarRequestedAppearances(formChoice(form))
}

// Segundos de avatar que va a pedir el formulario; 0 con el avatar apagado.
export function createAvatarSeconds(form: CreateFormValue): number {
  if (!form.useAvatar) return 0

  return avatarRequestedSeconds(formChoice(form))
}

// La elección del formulario con la forma de las opciones del proyecto.
function formChoice(form: CreateFormValue): AvatarAppearancesChoice {
  return {
    appearances: form.avatarAppearances,
    secondsPerAppearance: form.avatarSecondsPerAppearance,
    threeInFirstTwoMinutes: form.avatarThreeInTwoMinutes,
  }
}

// La línea de HeyGen del pre-check (ADR-0031, spec §9): dólares contra el
// saldo de su billetera.
export function avatarCostEstimate(
  lookType: AvatarLookType,
  seconds: number,
  engine: AvatarEngine = AVATAR_DEFAULT_ENGINE,
): CostEstimateLine | null {
  if (seconds <= 0) return null

  const usd = avatarUsd(lookType, seconds, engine)
  if (usd === null) return null

  return { domain: 'avatar', providerId: 'heygen', unit: 'usd', estimated: usd }
}

// Segundos de unos tramos de avatar (los `avatarSpans` de la pausa de
// confirmación, con la cola ya absorbida, o las escenas de avatar de un
// proyecto), contados en cuadros como los cuenta la fase `avatar` al
// compararse con el saldo (slotDurationSeconds): así la cifra que ve la
// persona es la que la fase va a pagar. Los tramos de Crear no pasan por acá:
// su cuenta es apariciones × segundos (createAvatarSeconds).
export function avatarSpansSeconds(spans: readonly AvatarSpanWindow[]): number {
  return spans.reduce(
    (total, span) =>
      total + slotDurationSeconds(span.startSeconds, span.endSeconds),
    0,
  )
}

// La línea de HeyGen de unos tramos concretos (entrega 2, pantalla de
// confirmación): lo que cuestan de verdad, con la misma tarifa y el mismo
// redondeo que la estimación de Crear.
export function avatarSpansCostEstimate(
  lookType: AvatarLookType,
  spans: readonly AvatarSpanWindow[],
  engine: AvatarEngine = AVATAR_DEFAULT_ENGINE,
): CostEstimateLine | null {
  return avatarCostEstimate(lookType, avatarSpansSeconds(spans), engine)
}
