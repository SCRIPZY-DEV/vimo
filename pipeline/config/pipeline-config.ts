import type { LlmTier } from '../types/llm.ts'

// Configuración del pipeline. Reemplaza al ConfigManager estático del origen:
// acá no se lee el entorno del proceso — Rust manda overrides dentro del
// PipelineJob y el sidecar los mezcla con estos defaults (ADR-0010).
export interface LlmConfig {
  baseUrl: string
  timeoutMs: number
  models: Record<LlmTier, string>
}

// Pack pre-hecho del modo demo (ADR-0027). Versión, URL y SHA-256 se cambian
// JUNTOS: subir la versión invalida el marcador `.ok` y fuerza una descarga
// limpia en todas las máquinas. `delayScale` multiplica las esperas de la
// simulación (1 = los ~40 s reales; el guard lo baja a 0). Rust nunca manda
// overrides de `demo`: solo el harness y el guard.
export interface DemoConfig {
  packVersion: string
  packUrl: string
  packSha256: string
  delayScale: number
}

export interface PipelineConfig {
  llm: LlmConfig
  demo: DemoConfig
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
}

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
    packVersion: 'v2',
    packUrl:
      'https://github.com/otd20071-cloud/vimo-releases/releases/download/demo-pack-v2/vimo-demo-pack-v2.zip',
    packSha256:
      'cae7f0bb96d18d630b820d9476363cf7db20077980ba533480aa15bd1e2a95b2',
    delayScale: 1,
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
  }
}
