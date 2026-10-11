import type { CreditsDomain } from '@/modules/common/types/credits'

// Familia de un código de saldo agotado por su prefijo (voice_*, image_*…).
export function creditsDomainOf(code: string): CreditsDomain | null {
  if (code.startsWith('voice_')) return 'voice'
  if (code.startsWith('image_')) return 'image'
  if (code.startsWith('llm_')) return 'llm'
  if (code.startsWith('transcription_')) return 'transcription'
  if (code.startsWith('music_')) return 'music'
  if (code.startsWith('animation_')) return 'animation'
  if (code.startsWith('avatar_')) return 'avatar'
  return null
}
