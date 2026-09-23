import {
  SECONDS_PER_MINUTE,
  SPEECH_CHARS_PER_SECOND,
} from '@/modules/videos/constants'
import type { CreateFormValue } from '@/modules/videos/types/create'
import { animatesWholeVideo } from '@pipeline/animation/scope.ts'
import { ANIMATION_PREFIX_SCENE_SECONDS } from '@pipeline/types/video-provider.ts'

// En Crear cada imagen del prefijo encarga6s, incluida la cola incompleta.
// El archivo se ajusta al audio real sin alargar la narración.
export function estimateAnimationSeconds(form: CreateFormValue): number {
  const wholeVideo = animatesWholeVideo(form)
  if (!form.animateScenes) return 0
  if (
    !wholeVideo &&
    (!Number.isSafeInteger(form.animationMinutes) ||
      form.animationMinutes < 1 ||
      !Number.isSafeInteger(form.animationMinutes * SECONDS_PER_MINUTE))
  )
    return 0

  const limitSeconds = wholeVideo
    ? Number.POSITIVE_INFINITY
    : form.animationMinutes * SECONDS_PER_MINUTE
  const audioSeconds =
    form.narrationMode === 'tts' && form.script.trim()
      ? form.script.trim().length / SPEECH_CHARS_PER_SECOND
      : limitSeconds
  const seconds = Math.min(limitSeconds, audioSeconds)
  if (!Number.isFinite(seconds) || seconds <= 0) return 0

  return (
    Math.ceil(seconds / ANIMATION_PREFIX_SCENE_SECONDS - 1e-9) *
    ANIMATION_PREFIX_SCENE_SECONDS
  )
}
