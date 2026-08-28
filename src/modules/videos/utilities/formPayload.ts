import { settingsForProvider } from '@/modules/voices/utilities/settingsToWire'
import type { CreateFormValue } from '@/modules/videos/types/create'
import type {
  CreateVideoProjectPayload,
  VideoProjectOptions,
} from '@pipeline/types/video-project.ts'

// Traduce el formulario al contrato del subcomando `create-video-project`.
// Solo viaja lo que el modo elegido usa: un BGM apagado no manda prompt ni
// URL.
export function createProjectPayload(
  form: CreateFormValue,
): CreateVideoProjectPayload {
  const options: VideoProjectOptions = {
    styleId: form.styleId,
    sceneCount: form.sceneCount,
    narrationMode: form.narrationMode,
    imageProvider: form.imageProvider,
    imageQuality: form.imageQuality,
    useBgm: form.useBgm,
    useOverlay: form.useOverlay,
    confirmScenes: form.confirmScenes,
  }

  if (form.narrationMode === 'tts' && form.voice) {
    options.voiceProvider = form.voice.provider
    options.voiceId = form.voice.voiceId
    options.voiceName = form.voice.name
    options.voiceSettings = settingsForProvider(
      form.voice.provider,
      form.voiceSettings,
    )
  }

  if (form.useBgm) {
    options.bgmMode = form.bgmMode
    if (form.bgmMode === 'youtube') {
      options.bgmUrl = form.bgmUrl.trim()
    } else {
      options.bgmMusic = {
        prompt: form.bgmPrompt.trim(),
        instrumental: form.bgmInstrumental,
      }
    }
  }

  if (form.useOverlay) options.overlayUrl = form.overlayUrl.trim()

  if (form.characters.length > 0) {
    options.characterFrequency = form.characterFrequency
  }

  const payload: CreateVideoProjectPayload = {
    name: form.name.trim(),
    options,
  }

  const script = form.script.trim()
  if (script) payload.script = script

  if (form.characters.length > 0) {
    payload.characters = form.characters.map((character) => ({
      characterId: character.characterId,
      name: character.name,
      description: character.description,
      mode: 'text',
    }))
  }

  return payload
}

// Motivos por los que el formulario todavía no puede enviarse.
export function formBlockers(form: CreateFormValue): string[] {
  const blockers: string[] = []

  if (!form.name.trim()) blockers.push('create.validation.nameRequired')

  if (form.narrationMode === 'tts') {
    if (!form.script.trim()) blockers.push('create.validation.scriptRequired')
    if (!form.voice) blockers.push('create.validation.voiceRequired')
  } else if (!form.narrationFilePath) {
    blockers.push('create.validation.audioRequired')
  }

  if (form.useBgm) {
    if (form.bgmMode === 'youtube' && !form.bgmUrl.trim())
      blockers.push('create.validation.bgmUrlRequired')
    if (form.bgmMode === 'evolink-ai' && !form.bgmPrompt.trim())
      blockers.push('create.validation.bgmPromptRequired')
  }

  if (form.useOverlay && !form.overlayUrl.trim())
    blockers.push('create.validation.overlayUrlRequired')

  return blockers
}
