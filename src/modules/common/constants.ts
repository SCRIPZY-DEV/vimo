import type {
  FlowToolsExecutionPlan,
  FlowToolsCoordinatorCapability,
} from '@pipeline/types/flow-execution-plan.ts'
import type { VoiceVendorId } from '@pipeline/types/voices.ts'

export const CommonRoutesPaths = {
  notFound: '*',
} as const

// vimo.click: el servidor de Vimo (acceso y agente reconstructor). La ruta de
// cada endpoint vive en el constants.ts de su módulo (ADR-0006, enmienda
// 2026-09-30).
export const VIMO_SERVER_BASE_URL = 'https://vimo.click'
// Tope por defecto de un pedido a vimo.click; un endpoint lento pide el suyo.
export const VIMO_SERVER_TIMEOUT_MS = 15_000

export const TOAST_LIMIT = 1
export const TOAST_REMOVE_DELAY = 1000000

// Espera antes de mostrar un tooltip: los 700 ms de Radix se sentían lentos.
export const TOOLTIP_DELAY_MS = 300

export const commonQueryKeys = {
  // Veredicto de acceso de vimo.click (ADR-0006): lo verifica y lo cachea
  // auth (`authQueryKeys.access` es esta misma clave); los demás módulos solo
  // leen sus interruptores con useAccessFeature, sin verificar.
  access: ['auth', 'access'],
  promptModels: ['common', 'promptModels'],
  imageCredits: ['common', 'imageCredits'],
  videoCredits: ['common', 'videoCredits'],
  flowStatus: ['common', 'flowStatus'],
  flowDiscovery: ['common', 'flowDiscovery'],
  flowCapacityRoot: ['common', 'flowCapacity'],
  flowRefresh: ['common', 'flowRefresh'],
  flowPause: ['common', 'flowPause'],
  flowPauseCommand: ['common', 'flowPauseCommand'],
  flowCapacity: (count: number, executionPlan?: FlowToolsExecutionPlan) => {
    if (executionPlan === undefined) return ['common', 'flowCapacity', count]
    return ['common', 'flowCapacity', count, executionPlan]
  },
} as const

// Bloqueo temporal de un proveedor de animación que el sidecar dio por caído
// (evento animation-provider-trouble, ADR-0047). Mismo criterio que los
// modelos de prompts: estado transitorio con vencimiento en localStorage,
// no una preferencia. Más corto que el de los modelos porque ningún
// proveedor publica cuándo vuelve y probar de nuevo cuesta un solo encargo.
export const ANIMATION_PROVIDER_BLOCKS_STORAGE_KEY =
  'vimo:animationProviderBlocks:v1'
export const ANIMATION_PROVIDER_BLOCK_DURATION_MS = 30 * 60 * 1000

// Bloqueo temporal de un modelo de prompts que se trabó o falló (carril
// verbatim). Vive en localStorage y no en settings.json: es estado transitorio
// con vencimiento, no una preferencia (ADR-0028).
export const PROMPT_MODEL_BLOCKS_STORAGE_KEY = 'vimo:promptModelBlocks:v1'
export const PROMPT_MODEL_BLOCK_DURATION_MS = 60 * 60 * 1000
// Cada cuánto se refresca el «vuelve en N min» de las tarjetas bloqueadas.
export const PROMPT_MODEL_BLOCK_TICK_MS = 60 * 1000

// El proveedor de imágenes tarda unos segundos en reflejar el gasto: el
// refetch de saldos tras una generación se difiere (mismo criterio que el
// origen).
export const CREDITS_REFRESH_DELAY_MS = 4000

// Códigos del saldo (get-image-credits) que para la persona significan una
// sola cosa: falta configurar la clave — no hay clave, o el proveedor la
// rechazó (Fal responde 401/403 también cuando la clave no es de admin;
// Evolink, cuando es inválida). Cualquier otro código es un error de red o
// del proveedor y se muestra como tal.
export const NOT_CONFIGURED_CREDITS_CODES: ReadonlySet<string> = new Set([
  'missing_api_key',
  'fal_admin_key_required',
  'music_invalid_api_key',
  'animation_invalid_api_key',
])

// Proveedores de voces (ADR-0024). Etiquetas de marca: no se traducen.
export const VOICE_VENDOR_IDS = ['dubvoice', 'elevenlabs'] as const
export const VOICE_VENDOR_LABELS: Record<VoiceVendorId, string> = {
  dubvoice: 'DubVoice',
  elevenlabs: 'ElevenLabs',
}
export const VOICE_VENDOR_DEFAULT: VoiceVendorId = 'dubvoice'

// Desde cuántos caracteres un texto a narrar merece el aviso de «puede
// tardar» (Voces y Crear): a partir de acá el sidecar lo sintetiza en varias
// partes o en un job largo.
export const LONG_TEXT_WARNING_THRESHOLD = 10_000

// Mínimo de producto; un coordinador puede exigir más, nunca menos.
export const FLOW_MINIMUM_PROFILES = 5
export const FLOW_REFERENCE_LENGTH = 8
export const FLOW_STATUS_INTERVAL_MS = 3000
export const FLOW_PAUSE_POLL_INTERVAL_MS = 500
export const FLOW_PAUSE_CONFIRMATION_TIMEOUT_MS = 15_000
export const FLOW_PAIRING_TTL_MS = 5 * 60 * 1000
export const FLOW_DEFAULT_QUALITY = 'flow-lite'

// Espejo browser-safe del contrato acordado; no importa runtime del pipeline.
export const FLOW_TOOLS_EXECUTION_PLAN = Object.freeze({
  version: 1,
  kind: 'flow-tools',
  toolId: 'e42285e2-1038-4e24-adc1-ed30c690ab29',
  seedMode: 'provider',
} as const satisfies FlowToolsExecutionPlan)

export const FLOW_TOOLS_COORDINATOR_CAPABILITY = Object.freeze({
  version: 1,
  toolId: FLOW_TOOLS_EXECUTION_PLAN.toolId,
  seedSupported: false,
  requestHashVersion: 1,
} as const satisfies FlowToolsCoordinatorCapability)

export const FLOW_ERROR_KEYS: Readonly<Record<string, string>> = {
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
  flow_store_in_use: 'extension.storeInUse',
  flow_origin_untrusted: 'extension.trustRequired',
  flow_discovery_expired: 'extension.discoveryExpired',
  flow_not_connected: 'extension.notReady',
  flow_capacity_required: 'extension.notReady',
  flow_accounts_exhausted: 'extension.accountsExhausted',
  flow_paid_consent_required: 'extension.paidConsentRequired',
  flow_command_invalid: 'extension.actionFailed',
  flow_cancel_incomplete: 'extension.cancelIncomplete',
}

export const FLOW_PHASE_KEYS: Readonly<Record<string, string>> = {
  recovering: 'extension.phaseAutoRecovering',
  queued: 'extension.queued',
  awaiting_sync: 'extension.awaitingSync',
  assigned: 'extension.phaseAssigned',
  received: 'extension.phaseReceived',
  uploading: 'extension.phaseUploading',
  generating: 'extension.phaseGenerating',
  running: 'extension.phaseGenerating',
  downloading: 'extension.phaseDownloading',
  ready: 'extension.phaseDownloading',
  awaiting_url: 'extension.phaseAwaitingUrl',
  preparing_token: 'extension.phasePreparingToken',
  submitting: 'extension.phaseSubmitting',
  unknown: 'extension.phaseReview',
}

export const FLOW_RESULT_RECOVERY_KEYS: ReadonlySet<string> = new Set([
  'extension.downloadFailed',
  'extension.resultInvalid',
  'extension.reviewRequired',
  'extension.submissionUnknown',
])
