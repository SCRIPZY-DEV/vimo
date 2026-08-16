export const SettingsRoutes = {
  settings: '/settings',
} as const

export const settingsQueryKeys = {
  projectsRoot: ['settings', 'projectsRoot'],
} as const

export const SETTINGS_STORE_FILE = 'settings.json'
export const PROJECTS_ROOT_STORE_KEY = 'projectsRoot'

export const DEFAULT_PROJECTS_FOLDER_NAME = 'Vimo'

export const WRITE_PROBE_FILE_NAME = 'vimo-write-probe.tmp'
