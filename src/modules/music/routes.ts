import type { RouteObject } from 'react-router'
import { MusicRoutes } from './constants'

export const musicRoutes: RouteObject[] = [
  { path: MusicRoutes.music, lazy: () => import('./views/Music') },
]
