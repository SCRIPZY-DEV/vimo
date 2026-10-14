import type { AvatarLookSummary, HeyGenLook } from '@pipeline/types/avatar.ts'

// Un look de la biblioteca con las medidas de su imagen tomadas del listado de
// HeyGen (entrega 2c): la biblioteca guarda solo la orientación, y con las
// medidas su ficha dice el formato también cuando no la tiene (un look de 4:5
// o de 5:4). Sin las medidas es un look de la biblioteca cualquiera.
export type SizedLibraryLook = AvatarLookSummary &
  Pick<HeyGenLook, 'imageWidth' | 'imageHeight'>

// El look que muestran una ficha, su reproductor y sus chips: uno del stock de
// HeyGen o uno de la biblioteca.
export type DisplayedLook = HeyGenLook | SizedLibraryLook
