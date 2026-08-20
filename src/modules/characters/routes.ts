import type { RouteObject } from 'react-router'
import { CharactersRoutes } from './constants'

export const charactersRoutes: RouteObject[] = [
  {
    path: CharactersRoutes.characters,
    lazy: () => import('./views/Characters'),
  },
]
