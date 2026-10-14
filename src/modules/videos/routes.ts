import type { RouteObject } from 'react-router'
import { VideosRoutes } from './constants'

export const videosRoutes: RouteObject[] = [
  {
    path: VideosRoutes.create,
    lazy: () => import('./views/Create'),
  },
  {
    path: VideosRoutes.library,
    lazy: () => import('./views/Library'),
  },
  {
    path: VideosRoutes.libraryPlayer,
    lazy: () => import('./views/LibraryPlayer'),
  },
  {
    path: VideosRoutes.libraryProgress,
    lazy: () => import('./views/LibraryProgress'),
  },
]

// El editor va a pantalla completa en su propio layout (ADR-0056): el router
// lo cuelga del EditorLayout, con el mismo path y el mismo guard.
export const libraryEditorRoute: RouteObject = {
  path: VideosRoutes.libraryEditor,
  lazy: () => import('./views/LibraryEditor'),
}

// La puerta de la demo se exporta aparte: el router le adjunta el guard de
// acceso, que vive en auth (un módulo no importa los guards de otro).
export const createDemoRoute: RouteObject = {
  path: VideosRoutes.createDemo,
  lazy: () => import('./views/CreateDemo'),
}
