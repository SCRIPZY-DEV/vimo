import type { CharacterStyleId } from '@pipeline/types/characters.ts'
import type {
  FalImageModelId,
  ImageProviderId,
} from '@pipeline/types/image-provider.ts'
import type { CharacterFormValue, LabelledOption } from './types/characters'

export const CharactersRoutes = {
  characters: '/characters',
} as const

export const charactersQueryKeys = {
  list: ['characters', 'list'],
} as const

// Espejo de los límites del sidecar (pipeline/commands/characters)
export const NAME_LIMIT = 80
export const DESCRIPTION_LIMIT = 1200
export const MIN_DESCRIPTION_LENGTH = 10
export const AGE_LIMIT = 40
export const ROLE_LIMIT = 80

// Estilos del preview de la imagen, en el orden del origen
export const PREVIEW_STYLES: LabelledOption<CharacterStyleId>[] = [
  { id: 'normal', labelKey: 'characters.styles.normal' },
  { id: 'pov_stickman', labelKey: 'characters.styles.stickman' },
  { id: 'cartoon', labelKey: 'characters.styles.cartoon' },
  { id: 'fantasia', labelKey: 'characters.styles.fantasy' },
  { id: 'terror', labelKey: 'characters.styles.terror' },
]

// Proveedores del preview (Evolink y Fal); las etiquetas son marcas, no se traducen
export const PREVIEW_PROVIDERS: { id: ImageProviderId; label: string }[] = [
  { id: 'evolink', label: 'Evolink' },
  { id: 'fal', label: 'Fal' },
]

export const FAL_PREVIEW_MODELS: { id: FalImageModelId; label: string }[] = [
  { id: 'gpt-image-2', label: 'GPT-Image 2' },
  { id: 'flux-schnell', label: 'Flux Schnell' },
]

// Evolink por defecto: con Fal el preview salía en FLUX y no se parecía al video
export const DEFAULT_PREVIEW_PROVIDER: ImageProviderId = 'evolink'
export const DEFAULT_FAL_PREVIEW_MODEL: FalImageModelId = 'gpt-image-2'

export const CHARACTER_FORM_INITIAL_VALUE: CharacterFormValue = {
  name: '',
  age: '',
  role: '',
  description: '',
}

// Código de error del sidecar/Rust → clave i18n del mensaje
export const CHARACTERS_ERROR_MESSAGE_KEYS: Record<string, string> = {
  image_network: 'characters.errors.imageNetwork',
  image_invalid_api_key: 'characters.errors.imageInvalidApiKey',
  image_provider_error: 'characters.errors.imageProviderError',
  image_task_not_found: 'characters.errors.imageProviderError',
  image_content_policy: 'characters.errors.imageContentPolicy',
  image_timeout: 'characters.errors.imageTimeout',
  image_download_failed: 'characters.errors.imageDownloadFailed',
  llm_network: 'characters.errors.llmNetwork',
  llm_timeout: 'characters.errors.llmTimeout',
  llm_rate_limited: 'characters.errors.llmRateLimited',
  llm_provider_error: 'characters.errors.llmProviderError',
  llm_empty_response: 'characters.errors.llmProviderError',
  character_not_found: 'characters.errors.notFound',
  invalid_payload: 'characters.errors.invalid',
  missing_api_key: 'characters.errors.missingApiKey',
  missing_projects_root: 'characters.errors.missingProjectsRoot',
  cancelled: 'characters.errors.cancelled',
  sidecar_missing: 'characters.errors.sidecar',
  sidecar_spawn: 'characters.errors.sidecar',
  sidecar_write: 'characters.errors.sidecar',
}

export const UNKNOWN_CHARACTERS_ERROR_KEY = 'characters.errors.unknown'
export const INTERRUPTED_ERROR_KEY = 'characters.errors.interrupted'
