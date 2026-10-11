import type { ProjectRunOptions } from '@/modules/videos/types/create'
import type { ProjectAvatarOptions } from '@pipeline/types/avatar.ts'

// Lo que una corrida necesita saber del avatar pedido (`options.avatar` del
// payload de Crear o de project.json): si tiene la fase —la fila «Avatar»
// desde el arranque— y el tipo de look, cuya tarifa da el costo de la pausa.
// Un solo lugar para todos los sitios que arrancan o reanudan el pipeline.
export function avatarRunOptions(
  avatar: ProjectAvatarOptions | undefined,
): Pick<ProjectRunOptions, 'hasAvatar' | 'avatarLookType'> {
  return { hasAvatar: avatar !== undefined, avatarLookType: avatar?.lookType }
}
