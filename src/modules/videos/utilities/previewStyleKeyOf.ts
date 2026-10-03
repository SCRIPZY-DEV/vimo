import { laneOf } from '@/modules/videos/utilities/formLane'
import type { CreateFormValue } from '@/modules/videos/types/create'

// Con qué clave se busca el preview de un personaje para este formulario: el
// id de galería del estilo propio en uso, el id del estilo del catálogo nuevo
// en uso (el sidecar genera ese preview con la gema del catálogo o, si es uno
// de los 5 heredados, con la plantilla fija de siempre) o el id del catálogo
// viejo. Es la misma regla que aplica create-video-project al copiar la
// referencia.
export function previewStyleKeyOf(form: CreateFormValue): string {
  if (laneOf(form) !== 'legacy-catalog' && form.customStyle)
    return form.customStyle.styleId
  return form.styleId
}
