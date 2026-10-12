import type { RefObject } from 'react'
import { LookPlayerDialog } from '@/modules/avatars/components/LookPlayerDialog'
import type { LookPlayerAction } from '@/modules/avatars/components/LookPlayerDialog'
import type { SizedLibraryLook } from '@/modules/avatars/types/look'
import { LOOK_PLAYER_REASON_KEYS } from '@/modules/videos/constants'
import type { LookUnfitReason } from '@/modules/videos/utilities/selectableAvatar'

interface CreateLookPlayerProps {
  // El look con el formato que ya resolvió la grilla (sus chips lo leen).
  look: SizedLibraryLook
  imageUrl?: string
  videoUrl?: string
  // El video todavía se busca (el listado de HeyGen no llegó): el escenario
  // espera en vez de decir «sin video».
  videoLoading: boolean
  // Por qué no sirve para este video (`lookUnfitReason`); null = sirve.
  unfitReason: LookUnfitReason | null
  // Adónde vuelve el foco al cerrar el reproductor.
  returnFocusRef: RefObject<HTMLElement | null>
  onUse(): void
  onClose(): void
}

// Qué ofrece el pie: un look que sirve se usa («Usar»); uno que no, dice por
// qué y no ofrece nada.
function playerAction(
  unfitReason: LookUnfitReason | null,
  onUse: () => void,
): LookPlayerAction {
  if (unfitReason === null) return { kind: 'use', onUse }

  return { kind: 'unusable', reasonKey: LOOK_PLAYER_REASON_KEYS[unfitReason] }
}

// El reproductor de un look desde Crear (spec §9, entrega 2d): el mismo de la
// ruta Avatares (`LookPlayerDialog`, que muestra el nombre, los chips y el
// video entero) con la acción que corresponde a elegir un look para el video.
// «Usar» elige el look; si no sirve, el pie dice por qué (la misma regla que
// atenúa su ficha, `lookUnfitReason`). Presentacional: quien lo monta decide
// qué pasa al elegir y adónde vuelve el foco.
export function CreateLookPlayer({
  look,
  imageUrl,
  videoUrl,
  videoLoading,
  unfitReason,
  returnFocusRef,
  onUse,
  onClose,
}: CreateLookPlayerProps) {
  return (
    <LookPlayerDialog
      look={look}
      imageUrl={imageUrl}
      videoUrl={videoUrl}
      videoLoading={videoLoading}
      action={playerAction(unfitReason, onUse)}
      returnFocusRef={returnFocusRef}
      onClose={onClose}
    />
  )
}
