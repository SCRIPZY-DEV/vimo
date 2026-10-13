import {
  flowExecutionPlansEqual,
  normalizeFlowExecutionPlan,
  supportsFlowToolsCoordinator,
} from '@/modules/common/utilities/flowExecutionPlan'
import type { FlowToolsExecutionPlan } from '@pipeline/types/flow-execution-plan.ts'
import { invoke } from '@tauri-apps/api/core'
import type {
  FlowStatus,
  FlowDiscoveryResult,
  FlowPairing,
  FlowCapacity,
  FlowRetryRequest,
} from '@/modules/common/types/flow'
import { runPipelineJob } from '@/modules/common/fetcher/pipeline'
import { isNative } from '@/modules/common/utilities/isNative'
import type { VideoCreditsResult } from '@pipeline/types/animation.ts'
import type { ListPromptModelsResult } from '@pipeline/types/llm-models.ts'
import type { ImageCreditsResult } from '@pipeline/types/video-project.ts'
import type {
  AddLibraryVoicePayload,
  AddLibraryVoiceResult,
} from '@pipeline/types/voices.ts'

// Lo que hablan con el exterior varios módulos a la vez: el catálogo de
// modelos del carril verbatim, que usan tanto Crear (elección por video) como
// Ajustes (el predeterminado); el alta de una voz de la biblioteca pública,
// que se dispara tanto desde Voces como desde el selector de Crear; y el saldo
// de los proveedores de imagen, que muestran Crear, el editor, el modal de
// estilo propio y el modal de personaje.
export const commonApi = {
  async flowStatus(): Promise<FlowStatus> {
    return invoke('flow_command', { command: { type: 'status' } })
  },
  async discoverFlow(): Promise<FlowDiscoveryResult> {
    return invoke('flow_command', { command: { type: 'discovery.list' } })
  },
  async linkFlow(discoveryId: string): Promise<void> {
    await invoke('flow_command', {
      command: { type: 'discovery.link', discoveryId },
    })
  },
  async pairFlow(): Promise<FlowPairing> {
    return invoke('flow_command', { command: { type: 'pairing.new' } })
  },
  async revokeFlow(connectionId: string): Promise<void> {
    await invoke('flow_command', { command: { type: 'revoke', connectionId } })
  },
  async pauseFlow(paused: boolean): Promise<void> {
    await invoke('flow_command', { command: { type: 'pause', paused } })
  },
  async flowCapacity(
    requestedCount: number,
    executionPlan?: FlowToolsExecutionPlan,
  ): Promise<FlowCapacity> {
    const plan = normalizeFlowExecutionPlan(executionPlan)
    if (plan) {
      // También protege callers directos: un vendor viejo nunca recibe el plan.
      const status = await commonApi.flowStatus()
      if (!supportsFlowToolsCoordinator(status.capabilities?.flowTools))
        throw new Error('flow_tools_coordinator_upgrade_required')
    }
    const result = await invoke<FlowCapacity>('flow_command', {
      command: {
        type: 'capacity.check',
        requestedCount,
        ...(plan ? { executionPlan: plan, autoRecoveryVersion: 1 } : {}),
      },
    })
    if (!flowExecutionPlansEqual(result.executionPlan, plan))
      throw new Error('execution_plan_invalid')
    return result
  },
  async retryFlowGeneration(request: FlowRetryRequest): Promise<void> {
    await invoke('flow_command', {
      command: { type: 'generation.retry', ...request },
    })
  },
  async downloadFlowImage(imageJobId: string): Promise<void> {
    await invoke('flow_command', { command: { type: 'download', imageJobId } })
  },
  async cancelFlowImage(imageJobId: string): Promise<void> {
    await invoke('flow_command', { command: { type: 'cancel', imageJobId } })
  },
  async deleteFlowImage(imageJobId: string): Promise<void> {
    await invoke('flow_command', {
      command: { type: 'image.delete', imageJobId },
    })
  },
  async cancelFlowBatch(batchId: string): Promise<void> {
    await invoke('flow_command', { command: { type: 'batch.cancel', batchId } })
  },
  async deleteFlowBatch(batchId: string): Promise<void> {
    await invoke('flow_command', { command: { type: 'batch.delete', batchId } })
  },
  isNative() {
    return isNative()
  },
  async listPromptModels(): Promise<ListPromptModelsResult> {
    return runPipelineJob<ListPromptModelsResult>('list-prompt-models')
  },
  async addLibraryVoice(payload: AddLibraryVoicePayload): Promise<string> {
    const result = await runPipelineJob<AddLibraryVoiceResult>(
      'add-library-voice',
      payload,
    )
    return result.voiceId
  },
  async getImageCredits(): Promise<ImageCreditsResult> {
    return runPipelineJob<ImageCreditsResult>('get-image-credits')
  },
  async getVideoCredits(): Promise<VideoCreditsResult> {
    return runPipelineJob<VideoCreditsResult>('get-video-credits')
  },
}
