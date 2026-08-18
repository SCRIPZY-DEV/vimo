import type { LlmTier } from '../types/llm.ts'

// Configuración del pipeline. Reemplaza al ConfigManager estático del origen:
// acá no se lee el entorno del proceso — Rust manda overrides dentro del
// PipelineJob y el sidecar los mezcla con estos defaults (ADR-0010).
export interface LlmConfig {
  baseUrl: string
  timeoutMs: number
  models: Record<LlmTier, string>
}

export interface PipelineConfig {
  llm: LlmConfig
}

export interface LlmConfigOverrides {
  baseUrl?: string
  timeoutMs?: number
  models?: Partial<Record<LlmTier, string>>
}

// Overrides parciales que llegan dentro del PipelineJob.
export interface PipelineConfigOverrides {
  llm?: LlmConfigOverrides
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
  }
}
