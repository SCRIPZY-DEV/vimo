import type { RouteObject } from 'react-router'
import { ApiKeysRoutes } from './constants'

export const apiKeysRoutes: RouteObject[] = [
  {
    path: ApiKeysRoutes.apiKeys,
    lazy: () => import('./views/ApiKeys'),
  },
]
