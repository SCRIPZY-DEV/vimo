import type { RouteObject } from 'react-router'
import { SetupRoutesPaths } from './constants'
import { Splash } from './views/Splash'

export const setupMainRoute: RouteObject[] = [
  {
    path: SetupRoutesPaths.root,
    Component: Splash,
  },
]
