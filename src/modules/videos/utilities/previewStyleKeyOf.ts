import type { CreateFormValue } from '@/modules/videos/types/create'

// Con qué clave se busca el preview de un personaje para este formulario: el
// id de galería del estilo propio en uso, o el id del catálogo. Es la misma
// regla que aplica create-video-project al copiar la referencia.
export function previewStyleKeyOf(form: CreateFormValue): string {
  if (form.styleSource === 'custom' && form.customStyle)
    return form.customStyle.styleId
  return form.styleId
}
