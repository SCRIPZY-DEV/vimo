import {
  ANIMATION_MINUTES_DEFAULT,
  AUTO_SECONDS_PER_SCENE,
  BGM_CREDITS_ESTIMATE,
  COST_ESTIMATE_SAFETY_FACTOR,
  SPEECH_CHARS_PER_SECOND,
} from '@/modules/videos/constants'
import {
  avatarCostEstimate,
  createAvatarSeconds,
} from '@/modules/videos/utilities/avatarCostEstimate'
import { estimateSceneCount } from '@/modules/videos/utilities/estimateSceneCount'
import { imageCostEstimate } from '@/modules/videos/utilities/imageCostEstimate'
import { animationCostEstimate } from '@/modules/videos/utilities/animationCostEstimate'
import { estimateAnimationSeconds } from '@/modules/videos/utilities/estimateAnimationSeconds'
import { laneOf } from '@/modules/videos/utilities/formLane'
import { selectedAvatarEngine } from '@/modules/videos/utilities/selectableAvatar'
import { planPrefixSceneWindows } from '@pipeline/animation/prefix-scenes.ts'
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

  const animationSeconds = estimateAnimationSeconds(form)
  if (animationSeconds > 0)
    lines.push(animationCostEstimate('kie', animationSeconds))

  const avatar = estimateAvatarLine(form)
  if (avatar) lines.push(avatar)

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

// La línea de HeyGen: segundos de avatar × la tarifa del motor con el que sale
// el look elegido (spec §9 y §21.3: el que prefiere la persona si el look lo
// admite; si no, el de reemplazo). Sin avatar elegido, o con un look que no
// admite ningún motor (una elección vieja: el envío se frena), no hay tarifa.
function estimateAvatarLine(form: CreateFormValue): CostEstimateLine | null {
  if (!form.avatar) return null

  const engine = selectedAvatarEngine(form)
  if (!engine) return null

  return avatarCostEstimate(
    form.avatar.lookType,
    createAvatarSeconds(form),
    engine,
  )
}

// Usa el mismo corte puro del sidecar: imágenes cada3s en el primer minuto
// y el resto con la duración configurada.
// El audio propio conserva su cantidad manual hasta medir la duración.
// Un estilo del catálogo nuevo corta como Mi estilo: por segundos por escena,
// sin cantidad fija (plan E2 §5.4).
// Las escenas de avatar no generan imagen (spec §6.2: el look es el
// escenario): se cuenta solo el tiempo libre y, con cantidad fija, la
// confirmada menos las apariciones (la cantidad incluye los pines, §6.1).
function estimatedSceneCount(form: CreateFormValue, script: string): number {
  const usesGemLane = laneOf(form) !== 'legacy-catalog'
  const hasFixedCount = !usesGemLane && form.sceneCount > 0
  const avatarScenes = form.useAvatar ? form.avatarAppearances : 0
  const freeCount = Math.max(1, form.sceneCount - avatarScenes)
  if (form.narrationMode !== 'tts' || !script)
    return hasFixedCount ? freeCount : 0

  const durationSeconds = script.length / SPEECH_CHARS_PER_SECOND
  const freeSeconds = Math.max(0, durationSeconds - createAvatarSeconds(form))
  const secondsPerScene = usesGemLane
    ? form.secondsPerScene
    : AUTO_SECONDS_PER_SCENE
  const count = hasFixedCount
    ? freeCount
    : estimateSceneCount(freeSeconds, secondsPerScene)
  if (!form.animateScenes) return count
  return planPrefixSceneWindows({
    totalSeconds: freeSeconds,
    minutes: ANIMATION_MINUTES_DEFAULT,
    secondsPerScene: usesGemLane ? form.secondsPerScene : undefined,
    sceneCount: hasFixedCount ? freeCount : undefined,
  }).length
}
