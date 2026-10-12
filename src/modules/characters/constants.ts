import type { CharacterStyleId } from '@pipeline/types/characters.ts'
import type { ImageProviderId } from '@pipeline/types/image-provider.ts'
import type {
  CharacterFormValue,
  CharacterIdentitySource,
  LabelledOption,
} from './types/characters'

export const CharactersRoutes = {
  characters: '/characters',
} as const

export const charactersQueryKeys = {
  list: ['characters', 'list'],
  customStyles: ['characters', 'customStyles'],
} as const

// Espejo de los límites del sidecar (pipeline/commands/characters)
export const NAME_LIMIT = 80
export const DESCRIPTION_LIMIT = 1200
export const MIN_DESCRIPTION_LENGTH = 10
export const AGE_LIMIT = 40
export const ROLE_LIMIT = 80

// Las dos sub-pestañas del modal al crear (v0.41.0 del origen): primero la
// foto, como allá
export const IDENTITY_SOURCES: {
  id: CharacterIdentitySource
  titleKey: string
  hintKey: string
}[] = [
  {
    id: 'photo',
    titleKey: 'characters.identity.photo',
    hintKey: 'characters.identity.photoHint',
  },
  {
    id: 'text',
    titleKey: 'characters.identity.text',
    hintKey: 'characters.identity.textHint',
  },
]

// Pestañas de la biblioteca: filtran por cómo se fijó la identidad, en el
// mismo orden que las sub-pestañas del modal
export const CHARACTER_FILTERS: {
  id: CharacterIdentitySource
  labelKey: string
}[] = [
  { id: 'photo', labelKey: 'characters.filter.photo' },
  { id: 'text', labelKey: 'characters.filter.text' },
]

// Formatos que ofrece el dialog de la foto; el sidecar valida por magic bytes
export const PHOTO_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp']

// Estilos del catálogo para el preview, en el orden del origen; los estilos
// propios de la galería se agregan a continuación en el modal
export const PREVIEW_STYLES: LabelledOption<CharacterStyleId>[] = [
  { id: 'normal', labelKey: 'characters.styles.normal' },
  { id: 'pov_stickman', labelKey: 'characters.styles.stickman' },
  { id: 'cartoon', labelKey: 'characters.styles.cartoon' },
  { id: 'fantasia', labelKey: 'characters.styles.fantasy' },
  { id: 'terror', labelKey: 'characters.styles.terror' },
]

// Proveedores del preview (Evolink y Fal); las etiquetas son marcas, no se traducen
export const PREVIEW_PROVIDERS: { id: ImageProviderId; labelKey: string }[] = [
  { id: 'evolink', labelKey: 'extension.engineEvolink' },
  { id: 'fal', labelKey: 'extension.engineFal' },
  { id: 'flow', labelKey: 'extension.engineFlow' },
]

// Evolink por defecto: es el proveedor con el que se generan los videos
export const DEFAULT_PREVIEW_PROVIDER: ImageProviderId = 'evolink'

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
  flow_not_connected: 'extension.notReady',
  flow_capacity_required: 'extension.notReady',
  flow_transport_unknown: 'extension.reviewRequired',
  flow_review_required: 'extension.reviewRequired',
  flow_account_review_required: 'extension.accountReviewRequired',
  flow_submission_unknown: 'extension.submissionUnknown',
  flow_restart_required: 'extension.restartRequired',
  flow_download_failed: 'extension.downloadFailed',
  flow_result_invalid: 'extension.resultInvalid',
  flow_result_obsolete: 'extension.resultObsolete',
  flow_intent_conflict: 'extension.intentConflict',
  batch_execution_plan_mixed: 'extension.intentConflict',
  execution_plan_mismatch: 'extension.intentConflict',
  batch_execution_plan_conflict: 'extension.intentConflict',
  batch_id_conflict: 'extension.intentConflict',
  job_hash_mismatch: 'extension.intentConflict',
  store_execution_plan_invalid: 'extension.intentConflict',
  flow_tools_coordinator_upgrade_required: 'extension.toolsUpgradeRequired',
  execution_plan_invalid: 'extension.toolsIntentInvalid',
  seed_invalid: 'extension.toolsIntentInvalid',
  flow_tools_model_or_aspect_invalid: 'extension.toolsIntentInvalid',
  execution_plan_unavailable: 'extension.toolsUnavailable',
  retry_execution_plan_unavailable: 'extension.toolsUnavailable',
  flow_unavailable: 'extension.unavailable',
  flow_port_in_use: 'extension.portInUse',
  flow_command_failed: 'extension.actionFailed',
  image_provider_error: 'characters.errors.imageProviderError',
  image_task_not_found: 'characters.errors.imageProviderError',
  image_content_policy: 'characters.errors.imageContentPolicy',
  image_timeout: 'characters.errors.imageTimeout',
  image_download_failed: 'characters.errors.imageDownloadFailed',
  image_insufficient_credits: 'characters.errors.imageInsufficientCredits',
  llm_network: 'characters.errors.llmNetwork',
  llm_timeout: 'characters.errors.llmTimeout',
  llm_rate_limited: 'characters.errors.llmRateLimited',
  llm_provider_error: 'characters.errors.llmProviderError',
  llm_empty_response: 'characters.errors.llmProviderError',
  llm_insufficient_credits: 'characters.errors.llmInsufficientCredits',
  character_not_found: 'characters.errors.notFound',
  character_photo_invalid: 'characters.errors.photoInvalid',
  style_not_found: 'characters.errors.styleNotFound',
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
