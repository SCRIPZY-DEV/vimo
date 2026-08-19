import type { RouteObject } from 'react-router'
import { VideosRoutes } from './constants'

export const videosRoutes: RouteObject[] = [
  {
    path: VideosRoutes.create,
    lazy: () => import('./views/Create'),
  },
]
