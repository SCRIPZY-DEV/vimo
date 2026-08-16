import type { RouteObject } from 'react-router'
import { CostsRoutes } from './constants'

export const costsRoutes: RouteObject[] = [
  {
    path: CostsRoutes.costs,
    lazy: () => import('./views/Costs'),
  },
]
