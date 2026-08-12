import type { RouteObject } from 'react-router'
import { CommonRoutesPaths } from './constants'

export const commonRoutes: RouteObject[] = [
  {
    path: CommonRoutesPaths.notFound,
    lazy: () => import('./views/PageNotFound'),
  },
]
