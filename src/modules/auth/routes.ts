import type { RouteObject } from 'react-router'
import { AuthRoutesPaths } from './constants'

export const authRoutes: RouteObject[] = [
  {
    path: AuthRoutesPaths.login,
    lazy: () => import('./views/Login'),
  },
  {
    path: AuthRoutesPaths.accessDenied,
    lazy: () => import('./views/AccessDenied'),
  },
]
