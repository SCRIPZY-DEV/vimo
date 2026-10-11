import { avatarRatePerMinute } from '@/modules/videos/utilities/avatarCostEstimate'
import { lookOrientationFit } from '@pipeline/avatar/look-orientation.ts'
import { AVATAR_DEFAULT_ENGINE } from '@pipeline/types/avatar.ts'
import type {
  AvatarLibraryRead,
  AvatarUsability,
  CreateFormValue,
  SelectedAvatar,
} from '@/modules/videos/types/create'
import type {
  AvatarLookSummary,
  AvatarSummary,
} from '@pipeline/types/avatar.ts'
import type { VideoFormat } from '@pipeline/types/video-format.ts'

// ¿Este look sirve para un video en este formato? (spec §6.2 y §9: HeyGen
// renderiza el look tal cual, con su fondo, así que tiene que tener la
// orientación del video). La orientación la decide `lookOrientationFit`
// (pipeline/avatar/look-orientation.ts), la misma regla con la que
// create-video-project valida: acá solo se ofrece `match`; un look sin
// orientación conocida (`unknown`) no se ofrece, porque el clip podría salir
// recortado y el render ya estaría pagado. Además: listo, con el motor de
// Vimo —mirado en `supportedEngines`, nunca deducido de `status: 'ready'`
// (cuidado 1 de §16)— y con tarifa para su tipo.
function isLookFor(look: AvatarLookSummary, videoFormat: VideoFormat): boolean {
  if (look.status !== 'ready') return false

  if (!look.supportedEngines.includes(AVATAR_DEFAULT_ENGINE)) return false

  if (avatarRatePerMinute(look.lookType) === null) return false

  return lookOrientationFit(look, videoFormat) === 'match'
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

// La elección del formulario: un avatar y uno de sus looks.
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
  }
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
// look o un refresco que le quite Avatar III la invalidan.
export function isSelectedAvatarCurrent(
  selected: SelectedAvatar,
  entries: AvatarSummary[],
  videoFormat: VideoFormat,
): boolean {
  const entry = entries.find((item) => item.id === selected.id)
  if (!entry || avatarUsability(entry, videoFormat) !== 'usable') return false

  return avatarLooksFor(entry, videoFormat).some(
    (look) =>
      look.lookId === selected.lookId && look.lookType === selected.lookType,
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
