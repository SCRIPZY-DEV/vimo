import type { RouteObject } from 'react-router'
import { AuthRoutesPaths } from './constants'
import { accessDeniedLoader, guestOnlyLoader, logoutLoader } from './guards'

export const authRoutes: RouteObject[] = [
  {
    path: AuthRoutesPaths.login,
    loader: guestOnlyLoader,
    lazy: () => import('./views/Login'),
  },
  {
    path: AuthRoutesPaths.callback,
    loader: guestOnlyLoader,
    lazy: () => import('./views/Callback'),
  },
  {
    path: AuthRoutesPaths.accessDenied,
    loader: accessDeniedLoader,
    lazy: () => import('./views/AccessDenied'),
  },
  {
    // Ruta-acción sin vista: el loader siempre redirige (ver logoutLoader).
    path: AuthRoutesPaths.logout,
    loader: logoutLoader,
  },
]
