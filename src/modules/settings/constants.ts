export const SettingsRoutes = {
  settings: '/settings',
} as const

// Query param con la sección a enfocar al entrar a Ajustes (mismo patrón que
// api-keys): la vista hace scroll hasta ella y la resalta.
export const SETTINGS_FOCUS_PARAM = 'focus'
export const PROMPT_MODEL_FOCUS = 'promptModel'
export const VOICE_VENDOR_FOCUS = 'voiceVendor'
export const PROMPT_MODEL_SETTINGS_PATH = `${SettingsRoutes.settings}?${SETTINGS_FOCUS_PARAM}=${PROMPT_MODEL_FOCUS}`

export const settingsQueryKeys = {
  projectsRoot: ['settings', 'projectsRoot'],
  defaultSceneCount: ['settings', 'defaultSceneCount'],
  sceneDuration: ['settings', 'sceneDuration'],
  promptModel: ['settings', 'promptModel'],
  voiceVendor: ['settings', 'voiceVendor'],
} as const

export const SETTINGS_STORE_FILE = 'settings.json'
export const PROJECTS_ROOT_STORE_KEY = 'projectsRoot'
export const DEFAULT_SCENE_COUNT_STORE_KEY = 'defaultSceneCount'
export const SECONDS_PER_SCENE_STORE_KEY = 'secondsPerScene'
export const CONFIRM_SCENES_STORE_KEY = 'confirmScenes'
export const PROMPT_MODEL_STORE_KEY = 'promptModel'
export const PROMPT_MODEL_COMPACT_STORE_KEY = 'promptModelCompact'
// Proveedor de voces elegido (ADR-0024). Ausente = automático: DubVoice, o
// ElevenLabs si es la única clave de voz guardada.
export const VOICE_VENDOR_STORE_KEY = 'voiceVendor'

// El selector completo (todas las bandas de precio + simulador) es para
// comparar; una vez elegido el modelo, en Crear alcanza con verlo.
export const PROMPT_MODEL_COMPACT_DEFAULT = true

// Espejo de MAX_SCENE_COUNT del módulo videos: se duplica a propósito para no
// acoplar módulos. Si cambia allá, cambia acá.
export const SCENE_COUNT_MAX = 500
// 0 = el pipeline decide la cantidad (una escena cada ~3 segundos).
export const AUTOMATIC_SCENE_COUNT = 0

// Espejo del carril de segundos-por-escena de videos (mismo criterio: se
// duplica para no acoplar módulos).
export const SECONDS_PER_SCENE_MIN = 2
export const SECONDS_PER_SCENE_MAX = 15
export const SECONDS_PER_SCENE_DEFAULT = 3
// Valores de un click para no arrastrar el slider hasta los más usados.
export const SECONDS_PER_SCENE_SHORTCUTS = [3, 4, 5, 6, 8, 10]

// Espejo del límite del sidecar (create-video-project.ts): un id más largo no
// es un modelo, es basura en el store.
export const PROMPT_MODEL_ID_LIMIT = 200

export const DEFAULT_PROJECTS_FOLDER_NAME = 'Vimo'

export const WRITE_PROBE_FILE_NAME = 'vimo-write-probe.tmp'
