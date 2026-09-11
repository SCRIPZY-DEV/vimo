import { settingsForProvider } from '@/modules/voices/utilities/settingsToWire'
import type {
  CreateFormValue,
  CreateProjectPayloadOptions,
} from '@/modules/videos/types/create'
import type { StyleCharacterMode } from '@pipeline/types/styles.ts'
import type {
  CreateVideoProjectPayload,
  VideoProjectOptions,
} from '@pipeline/types/video-project.ts'

// Traduce el formulario al contrato del subcomando `create-video-project`.
// Solo viaja lo que el modo elegido usa: un BGM apagado no manda prompt ni
// URL.
export function createProjectPayload(
  form: CreateFormValue,
  { demo = false }: CreateProjectPayloadOptions = {},
): CreateVideoProjectPayload {
  // Con estilo propio, styleId viaja como 'normal' (sigue siendo un id de
  // catálogo válido para el contrato) y el snapshot va en customStyle.
  const usesCustomStyle = form.styleSource === 'custom' && form.customStyle
  const options: VideoProjectOptions = {
    styleId: usesCustomStyle ? 'normal' : form.styleId,
    // Con estilo propio el corte va por duración: la cantidad que quedó en el
    // formulario no aplica y viaja como automática para no mentir el metadata.
    sceneCount: usesCustomStyle ? 0 : form.sceneCount,
    narrationMode: form.narrationMode,
    imageProvider: form.imageProvider,
    imageQuality: form.imageQuality,
    useBgm: form.useBgm,
    useOverlay: form.useOverlay,
    // La pausa de escenas: con catálogo es la casilla del formulario; con
    // estilo propio no hay casilla y manda la preferencia «No preguntarme al
    // generar» de Ajustes, que decide si se pregunta la duración de escena.
    confirmScenes: usesCustomStyle
      ? form.confirmSceneDuration
      : form.confirmScenes,
    subtitles: form.subtitles,
    autoRender: form.autoRender,
    videoFormat: form.videoFormat,
  }

  // Modo demo (ADR-0027): el flag viaja al proyecto y la corrida nunca pausa
  // ni deja borrador — el video pre-hecho se materializa entero.
  if (demo) {
    options.demo = true
    options.confirmScenes = false
    options.autoRender = true
  }

  if (usesCustomStyle && form.customStyle) {
    options.customStyle = {
      styleId: form.customStyle.styleId,
      name: form.customStyle.name,
      systemPrompt: form.customStyle.systemPrompt,
      shots: form.customStyle.shots,
      ...(form.customStyle.character
        ? { character: form.customStyle.character }
        : {}),
    }
    // Carril de segundos-por-escena: el proyecto nace con la preferencia de
    // Ajustes. El diálogo de confirmación lo ajusta con el slider; sin
    // confirmación, este valor corta directo.
    options.secondsPerScene = form.secondsPerScene
    if (form.promptModel) options.promptModel = form.promptModel
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

  // v1.35.0 del origen: la galería propia arranca vacía y sin tarjeta
  // elegida no hay estilo con qué generar.
  if (form.styleSource === 'custom' && !form.customStyle)
    blockers.push('create.validation.styleRequired')

  // La gema pide TU personaje (ADR-0020): sin uno elegido — o con el fijo
  // del estilo ya borrado de la biblioteca — no hay con qué generar.
  if (styleCharacterModeOf(form) === 'own' && form.characters.length === 0)
    blockers.push('create.validation.characterRequired')

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

// Qué declaró la gema en uso sobre su protagonista; null sin estilo propio.
// Ausente en la gema = genérico (compat con las guardadas antes de ADR-0020).
export function styleCharacterModeOf(
  form: CreateFormValue,
): StyleCharacterMode | null {
  if (form.styleSource !== 'custom' || !form.customStyle) return null
  return form.customStyle.character?.mode ?? 'generic'
}
