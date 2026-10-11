import type { HeyGenAvatarGroup, HeyGenLook } from '@pipeline/types/avatar.ts'

// El video del «look de portada» de un avatar de HeyGen, para la tarjeta del
// stock cuando el grupo no trae video propio (Dante, Brody, Hayes…: diseño
// §18): el look cuya imagen es la portada del grupo y tiene video; si ninguno
// coincide, el primero con video; sin videos, ninguno. Una portada que falta
// no coincide con un look sin imagen.
export function coverLookVideoUrl(
  group: Pick<HeyGenAvatarGroup, 'previewImageUrl'>,
  looks: readonly HeyGenLook[],
): string | undefined {
  const withVideo = looks.filter((look) => look.previewVideoUrl)
  const cover = group.previewImageUrl
    ? withVideo.find((look) => look.previewImageUrl === group.previewImageUrl)
    : undefined

  return (cover ?? withVideo[0])?.previewVideoUrl
}
