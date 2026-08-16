import type { RouteObject } from 'react-router'
import { SettingsRoutes } from './constants'

export const settingsRoutes: RouteObject[] = [
  {
    path: SettingsRoutes.settings,
    lazy: () => import('./views/Settings'),
  },
]
