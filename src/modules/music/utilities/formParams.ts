import type { MusicFormValue } from '@/modules/music/types/music'
import type { MusicGenerationParams } from '@pipeline/types/music.ts'

/**
 * Arma el payload del job desde el formulario (port de valorMusicaABody).
 * Asimetría heredada del origen: negativeTags viaja aunque el modo avanzado
 * esté cerrado (un valor pegado antes de cerrarlo sigue aplicando).
 */
export function musicFormToParams(
  value: MusicFormValue,
): MusicGenerationParams {
  const params: MusicGenerationParams = {
    prompt: value.prompt.trim(),
    instrumental: value.instrumental,
    customMode: value.advanced,
  }
  if (value.advanced && value.style.trim()) params.style = value.style.trim()
  if (value.advanced && value.title.trim()) params.title = value.title.trim()
  if (value.negativeTags.trim()) params.negativeTags = value.negativeTags.trim()
  if (value.advanced && value.vocalGender)
    params.vocalGender = value.vocalGender
  return params
}
