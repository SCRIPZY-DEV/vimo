import { lookOrientationFit } from '@pipeline/avatar/look-orientation.ts'
import {
  AVATAR_ENGINES,
  avatarEngineAvailable,
  avatarEngineFor,
} from '@pipeline/types/avatar.ts'
import type {
  AvatarLibraryRead,
  AvatarUsability,
  CreateFormValue,
  SelectedAvatar,
} from '@/modules/videos/types/create'
import type {
  AvatarEngine,
  AvatarLookSummary,
  AvatarSummary,
} from '@pipeline/types/avatar.ts'
import type { VideoFormat } from '@pipeline/types/video-format.ts'

// Por qué un look no sirve para un video en este formato (`lookUnfitReason`).
export type LookUnfitReason =
  'processing' | 'failed' | 'engine' | 'unknownOrientation' | 'otherFormat'

// Por qué un look no sirve para un video en este formato, o null si sirve
// (spec §6.2 y §9: HeyGen renderiza el look tal cual, con su fondo, así que
// tiene que tener la orientación del video). Es LA regla: con ella Crear
// ofrece los looks (`avatarLooksFor`) y la grilla del botón «Look» dice por
// qué uno no se elige, sin espejos que puedan divergir. En orden: listo (ni
// generándose ni fallido), con al menos un motor que admita y con tarifa para
// su tipo —mirado en `supportedEngines`, nunca deducido de `status: 'ready'`
// (cuidado 1 de §16); desde la entrega 2e cualquier motor sirve (§21.3: antes,
// solo Avatar III), porque la persona elige el motor en Crear— y con la
// orientación del formato según `lookOrientationFit`
// (pipeline/avatar/look-orientation.ts), la misma regla con la que
// create-video-project valida: un look sin orientación conocida (`unknown`)
// no se ofrece, porque el clip podría salir recortado y el render ya estaría
// pagado.
export function lookUnfitReason(
  look: AvatarLookSummary,
  videoFormat: VideoFormat,
): LookUnfitReason | null {
  if (look.status === 'processing') return 'processing'

  if (look.status === 'failed') return 'failed'

  if (!AVATAR_ENGINES.some((engine) => avatarEngineAvailable(engine, look)))
    return 'engine'

  const fit = lookOrientationFit(look, videoFormat)
  if (fit === 'unknown') return 'unknownOrientation'

  if (fit === 'mismatch') return 'otherFormat'

  return null
}

// ¿Este look sirve para un video en este formato?
function isLookFor(look: AvatarLookSummary, videoFormat: VideoFormat): boolean {
  return lookUnfitReason(look, videoFormat) === null
}

// Los looks de un avatar que sirven para el formato, con el principal
// primero (spec §9: por defecto, el principal).
export function avatarLooksFor(
  entry: AvatarSummary,
  videoFormat: VideoFormat,
): AvatarLookSummary[] {
  const looks = entry.looks.filter((look) => isLookFor(look, videoFormat))
  const main = looks.filter((look) => look.lookId === entry.mainLookId)
  const others = looks.filter((look) => look.lookId !== entry.mainLookId)

  return [...main, ...others]
}

// Si un avatar de la biblioteca sirve para un video en este formato y, si
// no, por qué. Un avatar que entrena o falló no se ofrece: entre los fallidos
// está el que HeyGen ya no tiene (`avatar_group_missing`), que
// create-video-project también rechaza.
export function avatarUsability(
  entry: AvatarSummary,
  videoFormat: VideoFormat,
): AvatarUsability {
  if (entry.status === 'processing') return 'training'

  if (entry.status === 'failed') return 'failed'

  if (avatarLooksFor(entry, videoFormat).length === 0) return 'noLook'

  return 'usable'
}

// La elección del formulario: un avatar y uno de sus looks, con los motores
// que el look admite (entrega 2e).
export function selectedAvatarFrom(
  entry: AvatarSummary,
  look: AvatarLookSummary,
): SelectedAvatar {
  return {
    id: entry.id,
    name: entry.name,
    lookId: look.lookId,
    lookName: look.name,
    lookType: look.lookType,
    supportedEngines: look.supportedEngines,
  }
}

// El motor con el que sale la elección del formulario (entrega 2e, §21.3): el
// que prefiere la persona si el look lo admite; si no, el primero que el look
// admite en el orden de reemplazo (III, IV, V: avatarEngineFor). Es una
// derivación: elegir otro look nunca toca la preferencia. null sin elección o
// si el look no admite ningún motor con tarifa (una elección vieja: CreateForm
// frena el envío).
export function selectedAvatarEngine(
  form: Pick<CreateFormValue, 'avatar' | 'avatarEngine'>,
): AvatarEngine | null {
  if (!form.avatar) return null

  return avatarEngineFor(form.avatarEngine, form.avatar)
}

// La elección por defecto de un avatar: su principal si sirve en el formato
// y, si no, su primer look que sirva. null = ninguno sirve.
export function defaultAvatarChoice(
  entry: AvatarSummary,
  videoFormat: VideoFormat,
): SelectedAvatar | null {
  if (avatarUsability(entry, videoFormat) !== 'usable') return null

  const [first] = avatarLooksFor(entry, videoFormat)
  if (!first) return null

  return selectedAvatarFrom(entry, first)
}

// El primero que sirve, con su look por defecto: el que la tarjeta elige sola
// al encenderse.
export function firstSelectableAvatar(
  entries: AvatarSummary[],
  videoFormat: VideoFormat,
): SelectedAvatar | null {
  for (const entry of entries) {
    const choice = defaultAvatarChoice(entry, videoFormat)
    if (choice) return choice
  }

  return null
}

// ¿La elección sigue valiendo contra la biblioteca de hoy y el formato del
// video? El avatar tiene que seguir ahí y el look elegido tiene que seguir
// siendo uno de los que sirven para el formato: cambiar de formato, borrar el
// look o un refresco que le quite todos sus motores la invalidan. Y desde la
// revisión de WP-V (entrega 2e), el look tiene que seguir admitiendo cada
// motor de la copia de la elección: uno que la biblioteca ya no admite la
// invalida —el selector lo dice, el envío se frena con esta misma regla y al
// elegirla de nuevo la copia trae los motores de hoy—, sin tocar el motor que
// prefiere la persona (`avatarEngine`); uno ganado no la invalida.
export function isSelectedAvatarCurrent(
  selected: SelectedAvatar,
  entries: AvatarSummary[],
  videoFormat: VideoFormat,
): boolean {
  const entry = entries.find((item) => item.id === selected.id)
  if (!entry || avatarUsability(entry, videoFormat) !== 'usable') return false

  return avatarLooksFor(entry, videoFormat).some(
    (look) =>
      look.lookId === selected.lookId &&
      look.lookType === selected.lookType &&
      selected.supportedEngines.every((engine) =>
        look.supportedEngines.includes(engine),
      ),
  )
}

// ¿El envío de Crear se frena porque la elección del avatar ya no sirve
// (spec §6.2 y §16)? Solo con el avatar encendido y algo elegido (sin
// elección, el bloqueo es otro), y solo con la lista leída: mientras carga o
// si no se pudo leer no se afirma nada (create-video-project vuelve a
// validar antes de pagar).
export function selectedAvatarUnavailable(
  form: Pick<CreateFormValue, 'useAvatar' | 'avatar' | 'videoFormat'>,
  library: AvatarLibraryRead,
): boolean {
  if (!form.useAvatar || form.avatar === null) return false

  if (library.isLoading || library.errorKey !== null) return false

  return !isSelectedAvatarCurrent(
    form.avatar,
    library.entries,
    form.videoFormat,
  )
}
