import type { RouteObject } from 'react-router'
import { AvatarsRoutes } from './constants'

export const avatarsRoutes: RouteObject[] = [
  {
    path: AvatarsRoutes.avatars,
    lazy: () => import('./views/AvatarLibrary'),
  },
]
