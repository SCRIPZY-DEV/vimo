import type { VoiceSummary } from '@pipeline/types/voices.ts'
import type { VoiceTask } from '@/modules/voices/types/voices'

// La tarea de voz es un store global (sobrevive al remount del probador y al
// reinicio de la app), así que el error o el resultado guardado pueden ser de
// otra voz. Solo se muestran si la tarea se generó con la voz abierta.
export function taskBelongsToVoice(
  task: VoiceTask | null,
  voice: VoiceSummary,
): boolean {
  if (!task) return false
  if (task.request.provider !== voice.provider) return false

  // Una voz de la biblioteca pública de ElevenLabs se sintetiza con el id de
  // cuenta que devolvió addLibraryVoice, no con el de la biblioteca: el
  // nombre es lo único que comparten.
  if (voice.libraryOwnerId) return task.request.voiceName === voice.name

  return task.request.voiceId === voice.voiceId
}
