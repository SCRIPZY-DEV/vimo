import type { RouteObject } from 'react-router'
import { VoicesRoutes } from './constants'

export const voicesRoutes: RouteObject[] = [
  { path: VoicesRoutes.voices, lazy: () => import('./views/Voices') },
]
