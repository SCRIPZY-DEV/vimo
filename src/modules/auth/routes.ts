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
    path: AuthRoutesPaths.logout,
    loader: logoutLoader,
  },
]

export const authShellRoutes: RouteObject[] = [
  {
    path: AuthRoutesPaths.license,
    lazy: () => import('./views/License'),
  },
]
