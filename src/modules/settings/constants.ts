export const SettingsRoutes = {
  settings: '/settings',
} as const

export const settingsQueryKeys = {
  projectsRoot: ['settings', 'projectsRoot'],
  defaultSceneCount: ['settings', 'defaultSceneCount'],
} as const

export const SETTINGS_STORE_FILE = 'settings.json'
export const PROJECTS_ROOT_STORE_KEY = 'projectsRoot'
export const DEFAULT_SCENE_COUNT_STORE_KEY = 'defaultSceneCount'

// Espejo de MAX_SCENE_COUNT del módulo videos: se duplica a propósito para no
// acoplar módulos. Si cambia allá, cambia acá.
export const SCENE_COUNT_MAX = 500
// 0 = el pipeline decide la cantidad (una escena cada ~3 segundos).
export const AUTOMATIC_SCENE_COUNT = 0

export const DEFAULT_PROJECTS_FOLDER_NAME = 'Vimo'

export const WRITE_PROBE_FILE_NAME = 'vimo-write-probe.tmp'
