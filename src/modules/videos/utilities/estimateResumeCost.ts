import {
  AUTO_SECONDS_PER_SCENE,
  BGM_CREDITS_ESTIMATE,
  COST_ESTIMATE_SAFETY_FACTOR,
  SPEECH_CHARS_PER_SECOND,
} from '@/modules/videos/constants'
import { estimateSceneCount } from '@/modules/videos/utilities/estimateSceneCount'
import { imageCostEstimate } from '@/modules/videos/utilities/imageCostEstimate'
import { animationCostEstimate } from '@/modules/videos/utilities/animationCostEstimate'
import {
  animatesWholeVideo,
  hasAutomaticAnimation,
} from '@pipeline/animation/scope.ts'
import { animationRangePlan } from '@/modules/videos/utilities/animationRangePlan'
import { VOICE_COST_FACTORS } from '@/modules/voices/constants'
import { vendorOfProvider } from '@/modules/voices/utilities/vendorOfProvider'
import type { CostEstimateLine } from '@/modules/common/types/credits'
import type { VideoProjectStatusResult } from '@pipeline/types/video-project.ts'

// Cuánto falta por gastar para terminar un proyecto que quedó a medias
// (ADR-0029): solo las fases que NO están en completedStages, y de las
// imágenes solo las escenas que aún no tienen archivo. Pura.
export function estimateResumeCost(
  status: VideoProjectStatusResult | null,
): CostEstimateLine[] {
  if (!status) return []

  const { metadata } = status
  const options = metadata.options
  const completed = new Set(metadata.completedStages)
  const lines: CostEstimateLine[] = []

  if (!completed.has('voice')) {
    const voice = pendingVoiceLine(status)
    if (voice) lines.push(voice)
    if (options.useBgm && options.bgmMode === 'evolink-ai')
      lines.push({
        domain: 'music',
        providerId: 'evolink',
        unit: 'credits',
        estimated: BGM_CREDITS_ESTIMATE,
        informative: true,
      })
  }

  if (!completed.has('images')) {
    const images = pendingImagesLine(status)
    if (images) lines.push(images)
  }

  if (hasAutomaticAnimation(options) && status.scenes.length > 0) {
    const plan = animationRangePlan(
      status.scenes,
      options.animationMinutes ?? 0,
      {
        durationSeconds: metadata.audioDurationSeconds,
        videoFormat: options.videoFormat,
        wholeVideo: animatesWholeVideo(options),
      },
    )
    const seconds = plan.requestedSeconds
    if (seconds > 0) lines.push(animationCostEstimate('kie', seconds))
  }

  return lines
}

function pendingVoiceLine(
  status: VideoProjectStatusResult,
): CostEstimateLine | null {
  const options = status.metadata.options
  const characters = status.scriptCharCount ?? 0
  if (options.narrationMode !== 'tts' || !options.voiceProvider) return null
  if (characters === 0) return null

  const vendor = vendorOfProvider(options.voiceProvider)
  return {
    domain: 'voice',
    providerId: vendor,
    unit: vendor === 'elevenlabs' ? 'characters' : 'credits',
    estimated: Math.ceil(
      characters *
        VOICE_COST_FACTORS[options.voiceProvider] *
        COST_ESTIMATE_SAFETY_FACTOR,
    ),
  }
}

function pendingImagesLine(
  status: VideoProjectStatusResult,
): CostEstimateLine | null {
  const options = status.metadata.options
  // Sin calidad persistida (proyecto viejo) no hay precio con qué estimar.
  if (!options.imageQuality) return null
  return imageCostEstimate(
    options.imageProvider,
    options.imageQuality,
    pendingImageCount(status),
  )
}

// Con escenas ya cortadas cuenta las que siguen sin imagen (también la muda,
// sin texto: igual lleva imagen); antes del corte se aproxima como en Crear
// (cantidad fija, o duración real del audio si ya se transcribió, o el guion).
function pendingImageCount(status: VideoProjectStatusResult): number {
  const { metadata, scenes } = status
  const options = metadata.options
  if (scenes.length > 0)
    return scenes.filter((scene) => !scene.imagePath).length

  const usesCustomStyle = options.customStyle !== undefined
  if (!usesCustomStyle && options.sceneCount > 0) return options.sceneCount

  const durationSeconds =
    metadata.audioDurationSeconds ??
    (status.scriptCharCount ?? 0) / SPEECH_CHARS_PER_SECOND
  const secondsPerScene = usesCustomStyle
    ? (options.secondsPerScene ?? AUTO_SECONDS_PER_SCENE)
    : AUTO_SECONDS_PER_SCENE
  return estimateSceneCount(durationSeconds, secondsPerScene)
}
