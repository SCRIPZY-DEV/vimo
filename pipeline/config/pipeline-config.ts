import type { LlmTier } from '../types/llm.ts'
import {
  DEFAULT_ANIMATION_RESOLUTION,
  type AnimationResolution,
} from '../types/video-provider.ts'

// Configuración del pipeline. Reemplaza al ConfigManager estático del origen:
// acá no se lee el entorno del proceso — Rust manda overrides dentro del
// PipelineJob y el sidecar los mezcla con estos defaults (ADR-0010).
export interface LlmConfig {
  baseUrl: string
  timeoutMs: number
  models: Record<LlmTier, string>
}

// Una parte del pack publicado: su URL, el SHA-256 de su zip y lo que pesa.
// Los bytes dan el tamaño que muestra la puerta, el avance total y el espacio
// libre que se exige antes de cada parte.
export interface DemoPackPart {
  url: string
  sha256: string
  bytes: number
}

// Pack pre-hecho del modo demo (ADR-0029; por partes desde el v4,
// docs/handoff/2026-10-14-demo-v4/design.md §3 «Descarga»). Versión y partes
// se cambian JUNTAS: subir la versión invalida el marcador `.ok` y el staging
// a medias, y fuerza una descarga limpia en todas las máquinas.
// `delayScale` multiplica las esperas de la simulación (1 = los ~40 s
// reales; el guard lo baja a 0). `diskMarginBytes` es el espacio libre que se
// exige además de lo que falta extraer y la parte más grande (el guard lo
// sube para simular un disco lleno).
// `downloadIdleMs` es el tope de inactividad de la descarga de cada parte:
// sin respuesta o sin bytes nuevos por ese tiempo, la parte falla con un
// código de la red y el próximo intento sigue desde ella (el guard lo baja).
// Rust nunca manda overrides de `demo`: solo el harness y el guard.
export interface DemoConfig {
  packVersion: string
  packParts: DemoPackPart[]
  delayScale: number
  diskMarginBytes: number
  downloadIdleMs: number
}

// Animación de los clips (demo v4, spec §5). `resolution` es un ajuste interno:
// solo el harness lo cambia (a '720p') por el config del job; Rust nunca manda
// `animation`, así que los usuarios siguen en 480p.
export interface AnimationConfig {
  resolution: AnimationResolution
}

export interface PipelineConfig {
  llm: LlmConfig
  demo: DemoConfig
  animation: AnimationConfig
}

export interface LlmConfigOverrides {
  baseUrl?: string
  timeoutMs?: number
  models?: Partial<Record<LlmTier, string>>
}

// Overrides parciales que llegan dentro del PipelineJob.
export interface PipelineConfigOverrides {
  llm?: LlmConfigOverrides
  demo?: Partial<DemoConfig>
  animation?: Partial<AnimationConfig>
}

// El margen de espacio libre de la descarga de la demo (spec v4 §3).
const DEMO_DISK_MARGIN_BYTES = 500 * 1024 * 1024
// El tope de inactividad de cada parte: holgado para una pausa pasajera (un
// cambio de red Wi-Fi, los reintentos de TCP) y muy por debajo de los 5
// minutos sin eventos con que la puerta da al job por mudo, así un cuelgue
// termina en un fallo retomable mientras el job todavía informa.
const DEMO_DOWNLOAD_IDLE_MS = 90_000

// Defaults portados del ConfigManager del origen (modelos DeepInfra por tier).
export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  llm: {
    baseUrl: 'https://api.deepinfra.com/v1/openai',
    timeoutMs: 120_000,
    models: {
      economy: 'mistralai/Mistral-Small-3.2-24B-Instruct-2506',
      balanced: 'Qwen/Qwen3-235B-A22B-Instruct-2507',
      premium: 'deepseek-ai/DeepSeek-V3.2',
    },
  },
  demo: {
    packVersion: 'v4',
    // Las partes del release demo-pack-v4 (URL, SHA-256 y bytes de cada una)
    // se cargan al publicarlo; hasta entonces no hay qué bajar.
    packParts: [],
    delayScale: 1,
    diskMarginBytes: DEMO_DISK_MARGIN_BYTES,
    downloadIdleMs: DEMO_DOWNLOAD_IDLE_MS,
  },
  animation: {
    resolution: DEFAULT_ANIMATION_RESOLUTION,
  },
}

export function resolvePipelineConfig(
  overrides?: PipelineConfigOverrides,
): PipelineConfig {
  if (!overrides) return DEFAULT_PIPELINE_CONFIG

  return {
    llm: {
      ...DEFAULT_PIPELINE_CONFIG.llm,
      ...overrides.llm,
      models: {
        ...DEFAULT_PIPELINE_CONFIG.llm.models,
        ...overrides.llm?.models,
      },
    },
    demo: {
      ...DEFAULT_PIPELINE_CONFIG.demo,
      ...overrides.demo,
    },
    animation: {
      ...DEFAULT_PIPELINE_CONFIG.animation,
      ...overrides.animation,
    },
  }
}
