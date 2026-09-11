import {
  AUTO_SECONDS_PER_SCENE,
  BGM_CREDITS_ESTIMATE,
  COST_ESTIMATE_SAFETY_FACTOR,
  SPEECH_CHARS_PER_SECOND,
} from '@/modules/videos/constants'
import { estimateSceneCount } from '@/modules/videos/utilities/estimateSceneCount'
import { imageCostEstimate } from '@/modules/videos/utilities/imageCostEstimate'
import { VOICE_COST_FACTORS } from '@/modules/voices/constants'
import { vendorOfProvider } from '@/modules/voices/utilities/vendorOfProvider'
import type { CreateFormValue } from '@/modules/videos/types/create'
import type { CostEstimateLine } from '@/modules/common/types/credits'

// Cuánto va a gastar el formulario de Crear en cada proveedor, antes de
// arrancar (ADR-0031). Pura: sin saldo ni red. Estima del lado caro
// (COST_ESTIMATE_SAFETY_FACTOR): quedarse sin saldo a mitad es peor que
// pedir un poco más. Lo que no se puede estimar no aparece (audio propio sin
// cantidad de escenas: la duración recién se conoce al decodificar).
export function estimateCreateCost(form: CreateFormValue): CostEstimateLine[] {
  const lines: CostEstimateLine[] = []
  const script = form.script.trim()

  const voice = estimateVoiceLine(form, script)
  if (voice) lines.push(voice)

  const images = estimateImagesLine(form, script)
  if (images) lines.push(images)

  if (form.useBgm && form.bgmMode === 'evolink-ai')
    lines.push({
      domain: 'music',
      providerId: 'evolink',
      unit: 'credits',
      estimated: BGM_CREDITS_ESTIMATE,
      informative: true,
    })

  return lines
}

function estimateVoiceLine(
  form: CreateFormValue,
  script: string,
): CostEstimateLine | null {
  if (form.narrationMode !== 'tts' || !form.voice || !script) return null

  const vendor = vendorOfProvider(form.voice.provider)
  return {
    domain: 'voice',
    providerId: vendor,
    unit: vendor === 'elevenlabs' ? 'characters' : 'credits',
    estimated: Math.ceil(
      script.length *
        VOICE_COST_FACTORS[form.voice.provider] *
        COST_ESTIMATE_SAFETY_FACTOR,
    ),
  }
}

function estimateImagesLine(
  form: CreateFormValue,
  script: string,
): CostEstimateLine | null {
  return imageCostEstimate(
    form.imageProvider,
    form.imageQuality,
    estimatedSceneCount(form, script),
  )
}

// Con estilo de catálogo y cantidad fija, esa; si no, por duración: con
// narración por IA se aproxima desde el guion, con audio propio no hay dato.
function estimatedSceneCount(form: CreateFormValue, script: string): number {
  const usesCustomStyle = form.styleSource === 'custom'
  if (!usesCustomStyle && form.sceneCount > 0) return form.sceneCount
  if (form.narrationMode !== 'tts' || !script) return 0

  const durationSeconds = script.length / SPEECH_CHARS_PER_SECOND
  const secondsPerScene = usesCustomStyle
    ? form.secondsPerScene
    : AUTO_SECONDS_PER_SCENE
  return estimateSceneCount(durationSeconds, secondsPerScene)
}
