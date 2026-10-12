import {
  AUTO_SECONDS_PER_SCENE,
  BGM_CREDITS_ESTIMATE,
  COST_ESTIMATE_SAFETY_FACTOR,
  SPEECH_CHARS_PER_SECOND,
} from '@/modules/videos/constants'
import {
  avatarCostEstimate,
  avatarSpansCostEstimate,
} from '@/modules/videos/utilities/avatarCostEstimate'
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
import { AVATAR_DEFAULT_ENGINE } from '@pipeline/types/avatar.ts'
import type { CostEstimateLine } from '@/modules/common/types/credits'
import type { AvatarSpanWindow } from '@pipeline/runner/events.ts'
import type { AvatarEngine } from '@pipeline/types/avatar.ts'
import type { SceneSummary } from '@pipeline/types/scenes.ts'
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

  // Terminada, la fase `avatar` no vuelve a correr al reanudar (entrega 2d,
  // ronda 1 de WP-P): lo que dejó con la imagen fija del look se regenera
  // desde el editor, con su propio costo. Sin terminar (una pausa de la
  // cuenta), cuenta lo pendiente como la fase.
  if (!completed.has('avatar')) {
    const avatar = pendingAvatarLine(status)
    if (avatar) lines.push(avatar)
  }

  if (hasAutomaticAnimation(options) && status.scenes.length > 0) {
    const plan = animationRangePlan(
      status.scenes,
      options.animationMinutes ?? 0,
      {
        durationSeconds: metadata.audioDurationSeconds,
        videoFormat: options.videoFormat,
        wholeVideo: animatesWholeVideo(options),
        pairPrefixScenes: true,
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
// sin texto: igual lleva imagen), salvo las de avatar, que no llevan imagen
// propia (ADR-0057 §6.2: el look es el escenario); antes del corte se
// aproxima como en Crear (cantidad fija, o duración real del audio si ya se
// transcribió, o el guion), sin las apariciones del avatar.
function pendingImageCount(status: VideoProjectStatusResult): number {
  const { metadata, scenes } = status
  const options = metadata.options
  if (scenes.length > 0)
    return scenes.filter((scene) => !scene.avatar && !scene.imagePath).length

  const avatarScenes = options.avatar?.appearances ?? 0
  const avatarSeconds = options.avatar
    ? options.avatar.appearances * options.avatar.secondsPerAppearance
    : 0
  const usesCustomStyle = options.customStyle !== undefined
  if (!usesCustomStyle && options.sceneCount > 0)
    return Math.max(1, options.sceneCount - avatarScenes)

  const durationSeconds =
    metadata.audioDurationSeconds ??
    (status.scriptCharCount ?? 0) / SPEECH_CHARS_PER_SECOND
  const secondsPerScene = usesCustomStyle
    ? (options.secondsPerScene ?? AUTO_SECONDS_PER_SCENE)
    : AUTO_SECONDS_PER_SCENE
  return estimateSceneCount(
    Math.max(0, durationSeconds - avatarSeconds),
    secondsPerScene,
  )
}

// ¿La fase `avatar` trabaja esta escena al reanudar? La regla de
// `isAvatarScenePending` (pipeline/avatar/render-scenes.ts), leída de la
// vista: pendiente si no quedó lista con su clip, salvo que esté
// desactualizada. Esa no se paga sola, tenga o no su clip (entrega 2d, §11.4):
// la regenera la persona desde el editor con el costo a la vista. La vista
// marca `stale` en toda escena lista, también en la que perdió su clip y se
// muestra fallida (toSceneAvatarView).
function isAvatarScenePending(scene: SceneSummary): boolean {
  const avatar = scene.avatar
  if (!avatar) return false

  if (avatar.stale) return false

  // Solo una escena lista trae su clip: la vista saca fallida a la que lo
  // perdió, y una planeada o fallida nunca lo tiene.
  return !avatar.clipPath
}

// Lo que falta cobrar del avatar (spec §8): los tramos de las escenas que la
// fase va a trabajar (isAvatarScenePending), contados como los cuenta la
// fase; antes del corte, lo que pidió Crear. Cada uno con la tarifa del motor
// con el que se cobra (entrega 2e): el de la escena si lo trae; si no, el de
// las opciones del proyecto; si no, Avatar III, el de antes de la 2e. Con
// escenas cortadas la cifra es un techo (`upperBound`): la vista no expone
// los recibos, y una escena con un pedido ya pagado se cosecha sin cobro
// nuevo, así que la fase puede pagar menos de lo que suman todas las
// pendientes. Si el corte no ubicó ninguna aparición (la narración no tenía
// frases donde entraran), la fase no tiene nada que cobrar: no hay línea, ni
// un saldo de HeyGen que pueda frenar «Reanudar».
function pendingAvatarLine(
  status: VideoProjectStatusResult,
): CostEstimateLine | null {
  const avatar = status.metadata.options.avatar
  if (!avatar) return null

  const projectEngine = avatar.engine ?? AVATAR_DEFAULT_ENGINE

  if (status.scenes.length === 0)
    return avatarCostEstimate(
      avatar.lookType,
      avatar.appearances * avatar.secondsPerAppearance,
      projectEngine,
    )

  const avatarScenes = status.scenes.filter(
    (scene) => scene.avatar !== undefined,
  )
  if (avatarScenes.length === 0) return null

  // Un video tiene casi siempre un solo motor; si algún día dos escenas
  // difieren, cada una se cuenta con su tarifa y se suman.
  const spansByEngine = new Map<AvatarEngine, AvatarSpanWindow[]>()
  for (const scene of avatarScenes.filter(isAvatarScenePending)) {
    const engine = scene.avatar?.engine ?? projectEngine
    spansByEngine.set(engine, [
      ...(spansByEngine.get(engine) ?? []),
      {
        startSeconds: scene.startSeconds ?? 0,
        endSeconds: scene.endSeconds ?? 0,
      },
    ])
  }

  const lines = [...spansByEngine].flatMap(([engine, spans]) => {
    const line = avatarSpansCostEstimate(avatar.lookType, spans, engine)
    return line ? [line] : []
  })
  if (lines.length === 0) return null

  const [first, ...rest] = lines
  const total = rest.reduce(
    (sum, line) => ({ ...sum, estimated: sum.estimated + line.estimated }),
    first,
  )

  return { ...total, upperBound: true }
}
