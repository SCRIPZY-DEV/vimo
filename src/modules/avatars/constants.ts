import { Ban, UserCheck, UserX } from 'lucide-react'
import type { AvatarAspectRatio, AvatarEngine } from '@pipeline/types/avatar.ts'

export const AvatarsRoutes = {
  avatars: '/avatars',
} as const

// Abrir la biblioteca desde otro módulo con el panel de un avatar y su ficha
// «Crear escenario» abierta en un formato: la tarjeta del avatar de Crear,
// cuando el avatar no tiene un look para el formato del video (ADR-0057 §9).
export const AVATAR_PANEL_PARAM = 'avatar'
export const AVATAR_SCENARIO_PARAM = 'scenario'

export function avatarScenarioPath(
  id: string,
  aspectRatio: AvatarAspectRatio,
): string {
  const params = new URLSearchParams({
    [AVATAR_PANEL_PARAM]: id,
    [AVATAR_SCENARIO_PARAM]: aspectRatio,
  })
  return `${AvatarsRoutes.avatars}?${params.toString()}`
}

export const avatarsQueryKeys = {
  list: ['avatars', 'list'],
  stockGroups: ['avatars', 'stockGroups'],
  stockLooks: ['avatars', 'stockLooks'],
  balance: ['avatars', 'balance'],
} as const

// Espejo de los límites del sidecar (pipeline/commands/avatars).
export const AVATAR_NAME_LIMIT = 80

// Espejo de AVATAR_PHOTO_CREATION_USD (pipeline/types/avatar.ts): el precio
// que muestra el diálogo de la foto.
export const AVATAR_PHOTO_CREATION_USD = 1.32

// Espejos de pipeline/types/avatar.ts para el look generado desde un prompt
// (la UI importa del sidecar solo tipos; `satisfies` ata cada formato al
// contrato). HeyGen no publica el precio por look (2026-10-09): null = la UI
// no promete una cifra y muestra el saldo actualizado.
export const AVATAR_ASPECT_RATIOS = [
  'auto',
  '16:9',
  '9:16',
  '1:1',
  '4:5',
  '5:4',
] as const satisfies readonly AvatarAspectRatio[]
export const AVATAR_PROMPT_LIMIT = 1000
export const AVATAR_REFERENCE_IMAGES_MAX = 3
export const AVATAR_LOOK_GENERATION_USD: number | null = null

// Selector de formato de «Crear escenario»: la etiqueta de cada formato (la
// clave no lleva «:», que i18next lee como separador de namespace) y el
// rectángulo que lo dibuja a escala, con el lado mayor en 28 px (`auto` va con
// un ícono). Atados al tipo del contrato: un formato nuevo en el sidecar no
// compila sin su etiqueta.
export const AVATAR_ASPECT_RATIO_LABEL_KEYS: Record<AvatarAspectRatio, string> =
  {
    auto: 'avatars.generar.ratios.auto',
    '16:9': 'avatars.generar.ratios.r16x9',
    '9:16': 'avatars.generar.ratios.r9x16',
    '1:1': 'avatars.generar.ratios.r1x1',
    '4:5': 'avatars.generar.ratios.r4x5',
    '5:4': 'avatars.generar.ratios.r5x4',
  }
export const AVATAR_ASPECT_RATIO_FRAME_CLASSES: Record<
  AvatarAspectRatio,
  string | null
> = {
  auto: null,
  '16:9': 'h-4 w-7',
  '9:16': 'h-7 w-4',
  '1:1': 'h-6 w-6',
  '4:5': 'h-7 w-[22px]',
  '5:4': 'h-[22px] w-7',
}

// El único motor de HeyGen con el que Vimo genera por ahora: espejo de la
// decisión del dueño del 2026-10-09 (la entrega 2 la lleva al sidecar). Las
// tarjetas muestran solo esta etiqueta, o «No compatible con Vimo» si falta.
export const VIMO_AVATAR_ENGINE = 'avatar_iii' satisfies AvatarEngine

// Los tres puntos de la tarjeta «Antes de crear tu avatar» del diálogo de la
// foto (lo que el proveedor no permite), en el orden en que se leen.
export const PHOTO_CONSENT_POINTS = [
  { labelKey: 'avatars.foto.permisos.propia', Icon: UserCheck },
  { labelKey: 'avatars.foto.permisos.famosos', Icon: UserX },
  { labelKey: 'avatars.foto.permisos.contenido', Icon: Ban },
] as const

// Formatos que ofrece el dialog de la foto (y el de las imágenes de
// referencia de un look); el sidecar valida por magic bytes. Sin WEBP a
// propósito: la subida de assets de HeyGen (`POST /v3/assets`) solo acepta
// JPEG y PNG entre las imágenes.
export const PHOTO_EXTENSIONS = ['jpg', 'jpeg', 'png']

// Cada cuántos ms se vuelve a leer la biblioteca mientras HeyGen entrena un
// avatar desde foto o genera uno de sus looks (la ficha pasa sola a lista).
export const PROCESSING_REFRESH_INTERVAL_MS = 15_000

// Los únicos errores del refresco que hacen que el sondeo deje de preguntar
// por un avatar, de inmediato y hasta que se vuelve a abrir la vista: el
// avatar ya no está en la biblioteca o el pedido no es válido. Un grupo que
// HeyGen ya no tiene no es un error del refresco: vuelve como una entrada
// `failed` (`avatar_group_missing`), que ya no procesa, y el sondeo la suelta
// solo. Un error pasajero (red, 429, 5xx, la clave) nunca lo abandona: se
// reintenta en la ronda siguiente.
export const PROCESSING_REFRESH_GIVE_UP_CODES: readonly string[] = [
  'avatar_not_found',
  'invalid_payload',
]

// El código con el que el sidecar marca un avatar que no pudo entrenar (la
// foto): su tarjeta muestra el texto del entrenamiento. Un avatar `failed` con
// otro código (`avatar_no_compatible_look`, `avatar_group_missing`) muestra el
// mensaje de ese código (AVATARS_ERROR_MESSAGE_KEYS).
export const AVATAR_TRAINING_FAILED_CODE = 'avatar_training_failed'

// El código con el que el sidecar avisa que HeyGen aceptó (y cobró) un look
// pero su grupo todavía no lo muestra: la mutación lo vuelve a buscar.
export const AVATAR_LOOK_NOT_LISTED_CODE = 'avatar_look_not_listed'

// Cuánto recuerda el diálogo de stock una página ya leída (de avatares o de
// looks): cada página es un proceso del sidecar contra HeyGen.
export const STOCK_LOOKS_STALE_TIME_MS = 5 * 60_000

// Saldo de HeyGen en la cabecera: cuánto vale una lectura y cuándo se vuelve
// a mirar tras un cobro (HeyGen puede descontar con retraso, así que se relee
// al instante y otra vez a los 20 s).
export const BALANCE_STALE_TIME_MS = 2 * 60_000
export const BALANCE_RECHECK_MS = 20_000

// Cuándo se vuelve a buscar, con un refresco del avatar, un look que HeyGen
// aceptó (y cobró) pero que su grupo todavía no mostraba
// (`avatar_look_not_listed`): una sola vez, a los 20 s.
export const LOOK_NOT_LISTED_RECHECK_MS = 20_000

// Filtro de género del stock, del lado del cliente sobre las páginas ya
// cargadas: un avatar sin género solo entra en «Todos».
export const STOCK_GENDER_FILTERS = ['all', 'male', 'female'] as const
export type StockGenderFilter = (typeof STOCK_GENDER_FILTERS)[number]
export const STOCK_GENDER_LABEL_KEYS: Record<StockGenderFilter, string> = {
  all: 'avatars.stock.genero.todos',
  male: 'avatars.stock.genero.hombres',
  female: 'avatars.stock.genero.mujeres',
}

// Grilla de avatares y de looks: el stock, sus esqueletos y el detalle de un
// avatar comparten el layout para que nada salte al llegar los datos.
export const STOCK_GRID_CLASS =
  'grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4'

// Fichas de esqueleto mientras carga una grilla: dos filas de cuatro.
export const STOCK_SKELETON_COUNT = 8

// Miniaturas de otros looks a la derecha de la principal en la tarjeta de la
// biblioteca. El sidecar baja AVATAR_CARD_LOOK_PREVIEWS (3) vistas previas al
// agregar: la principal y estas dos.
export const CARD_SIDE_LOOKS = 2

// Código de error del sidecar/Rust → clave i18n del mensaje.
export const AVATARS_ERROR_MESSAGE_KEYS: Record<string, string> = {
  avatar_invalid_key: 'avatars.errors.invalidKey',
  avatar_insufficient_credits: 'avatars.errors.insufficientCredits',
  avatar_rate_limited: 'avatars.errors.rateLimited',
  avatar_moderation_rejected: 'avatars.errors.moderationRejected',
  // El 400 de HeyGen a un look o motor; «este avatar no tiene un look que
  // Vimo pueda usar» es `avatar_no_compatible_look`.
  avatar_look_unsupported: 'avatars.errors.lookUnsupported',
  avatar_no_compatible_look: 'avatars.errors.noCompatibleLook',
  avatar_group_missing: 'avatars.errors.groupMissing',
  // HeyGen aceptó un look pero su grupo todavía no lo muestra: la mutación
  // lo vuelve a buscar (LOOK_NOT_LISTED_RECHECK_MS).
  avatar_look_not_listed: 'avatars.errors.lookNotListed',
  avatar_main_look_not_ready: 'avatars.errors.mainLookNotReady',
  avatar_invalid_request: 'avatars.errors.providerError',
  avatar_provider_error: 'avatars.errors.providerError',
  avatar_network: 'avatars.errors.network',
  avatar_photo_invalid: 'avatars.errors.photoInvalid',
  avatar_not_found: 'avatars.errors.notFound',
  avatar_training_failed: 'avatars.errors.trainingFailed',
  image_download_failed: 'avatars.errors.providerError',
  invalid_payload: 'avatars.errors.invalid',
  missing_api_key: 'avatars.errors.missingApiKey',
  missing_projects_root: 'avatars.errors.missingProjectsRoot',
  cancelled: 'avatars.errors.cancelled',
  sidecar_missing: 'avatars.errors.sidecar',
  sidecar_spawn: 'avatars.errors.sidecar',
  sidecar_write: 'avatars.errors.sidecar',
}

export const UNKNOWN_AVATARS_ERROR_KEY = 'avatars.errors.unknown'

// «Crear escenario» cambia el texto de algunos códigos: ahí un
// `avatar_photo_invalid` es de una de las imágenes de referencia, no de la
// foto de un avatar.
export const GENERATE_LOOK_ERROR_MESSAGE_KEYS: Record<string, string> = {
  avatar_photo_invalid: 'avatars.errors.referenceInvalid',
}
