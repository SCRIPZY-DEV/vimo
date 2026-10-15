import { ANIMATION_MINUTES_DEFAULT } from '@/modules/videos/constants'
import { settingsForProvider } from '@/modules/voices/utilities/settingsToWire'
import { displayLaneOf, laneOf } from '@/modules/videos/utilities/formLane'
import { projectCustomStyleFrom } from '@/modules/videos/utilities/projectCustomStyle'
import { gemProjectStyleId } from '@/modules/videos/utilities/selectedCatalogStyle'
import {
  selectedAvatarEngine,
  selectedAvatarExpressiveAvailable,
} from '@/modules/videos/utilities/selectableAvatar'
import type {
  CreateFormValue,
  CreateProjectPayloadOptions,
  FormBlockersContext,
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
  // Mi estilo y un estilo del catálogo nuevo salen por el carril de las gemas
  // (plan E2 §5.4): el snapshot va en customStyle y styleId viaja como
  // 'normal' (sigue siendo un id de catálogo válido para el contrato), salvo
  // un estilo heredado del catálogo, que lleva su id. El catálogo viejo manda
  // lo de siempre.
  const gemStyle = laneOf(form) === 'legacy-catalog' ? null : form.customStyle
  const options: VideoProjectOptions = {
    styleId: gemStyle ? gemProjectStyleId(gemStyle) : form.styleId,
    // Con una gema el corte va por duración: la cantidad que quedó en el
    // formulario no aplica y viaja como automática para no mentir el metadata.
    sceneCount: gemStyle ? 0 : form.sceneCount,
    narrationMode: form.narrationMode,
    imageProvider: form.imageProvider,
    imageQuality: form.imageQuality,
    useBgm: form.useBgm,
    useOverlay: form.useOverlay,
    // La pausa de escenas: con el catálogo viejo es la casilla del formulario;
    // con una gema no hay casilla y manda la preferencia «No preguntarme al
    // generar» de Ajustes, que decide si se pregunta la duración de escena.
    confirmScenes: gemStyle ? form.confirmSceneDuration : form.confirmScenes,
    subtitles: form.subtitles,
    autoRender: form.autoRender,
    videoFormat: form.videoFormat,
  }

  // Modo demo (ADR-0029): el flag viaja al proyecto y la corrida nunca pausa
  // ni deja borrador — el video pre-hecho se materializa entero.
  if (demo) {
    options.demo = true
    options.confirmScenes = false
    options.autoRender = true
  }

  if (form.animateScenes && !demo) {
    // El formulario solo encarga el primer minuto, incluso si se recupera
    // un borrador con opciones anteriores de N minutos o video completo.
    options.animationMinutes = ANIMATION_MINUTES_DEFAULT
    options.animateWholeVideo = false
  }

  // El avatar presentador (spec §3.4, §9 y §16): el avatar de la biblioteca,
  // el look elegido (el escenario con el que sale) y el motor con el que sale
  // (entrega 2e, §21.3: el que prefiere la persona si el look lo admite; si
  // no, el de reemplazo); `placement: 'auto'` = Vimo elige los momentos al
  // cortar (el manual llega con la entrega 3). La demo nunca lo lleva: el
  // pack no tiene proveedores.
  if (form.useAvatar && form.avatar && !demo) {
    // Un look que no admite ningún motor (una elección vieja que CreateForm
    // no llegó a frenar) viaja con la preferencia: create-video-project lo
    // rechaza antes de pagar.
    const engine = selectedAvatarEngine(form) ?? form.avatarEngine
    // «Movimiento más expresivo» viaja solo prendido y solo con Avatar IV y un
    // look de foto (entrega 2g, §23.1: con V no existe, aunque la persona lo
    // haya prendido antes con IV), al final: con Avatar III y el interruptor
    // apagado, options.avatar queda byte a byte como antes de la 2e (los
    // recibos guardados se siguen cosechando con la misma huella). «3 veces en
    // 2 minutos» (entrega 2f, §22.2) cierra el objeto, también solo en true.
    const expressive =
      form.avatarExpressive &&
      selectedAvatarExpressiveAvailable(form.avatar, engine)
    options.avatar = {
      // El id de la biblioteca viaja como `avatarId` (ProjectAvatarOptions).
      avatarId: form.avatar.id,
      lookId: form.avatar.lookId,
      lookName: form.avatar.lookName,
      lookType: form.avatar.lookType,
      engine,
      appearances: form.avatarAppearances,
      secondsPerAppearance: form.avatarSecondsPerAppearance,
      startWithAvatar: form.avatarStartsVideo,
      placement: 'auto',
      ...(expressive ? { expressive: true } : {}),
      ...(form.avatarThreeInTwoMinutes ? { threeInFirstTwoMinutes: true } : {}),
    }
  }

  if (gemStyle) {
    // Por secciones si la gema es de plantilla (siempre, si es del catálogo,
    // con su `catalogStyleId`); si no, como siempre (ADR-0048).
    options.customStyle = projectCustomStyleFrom(gemStyle)
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

  // La frecuencia viaja solo con el catálogo viejo: el carril verbatim de las
  // gemas saltea el clasificador de presencia (ADR-0019) y la ignoraría, así
  // que mandarla dejaría en el proyecto una opción que nadie aplica.
  if (form.characters.length > 0 && !gemStyle) {
    options.characterFrequency = form.characterFrequency
  }

  const payload: CreateVideoProjectPayload = {
    name: form.name.trim(),
    options,
  }

  const script = form.script.trim()
  if (script) payload.script = script

  if (form.characters.length > 0) {
    // El sidecar resuelve la referencia por su cuenta: con `photo` copia la
    // foto de la biblioteca; con `text` no hay referencia, la identidad viaja
    // como texto.
    payload.characters = form.characters.map((character) => ({
      characterId: character.characterId,
      name: character.name,
      description: character.description,
      mode: character.mode,
    }))
  }

  return payload
}

// El formulario tal como se valida, se estima y se envía (spec §9): sin clave
// de HeyGen la tarjeta del avatar se dibuja apagada, así que el avatar también
// va apagado acá. Nunca hay un «cargá tu clave» con la tarjeta apagada ni un
// `options.avatar` sin con qué generarlo. La elección queda en el formulario
// guardado: vuelve con la clave. Sin avatar encendido, el mismo objeto.
export function withAvatarKey(
  form: CreateFormValue,
  heygenConfigured: boolean,
): CreateFormValue {
  if (!form.useAvatar || heygenConfigured) return form

  return { ...form, useAvatar: false }
}

// Motivos por los que el formulario todavía no puede enviarse. El contexto
// trae lo que no se deriva del formulario solo (ver FormBlockersContext).
export function formBlockers(
  form: CreateFormValue,
  {
    promptModelsBlocked = false,
    fixedCharacterMissing = false,
    animationKeyMissing = false,
    avatarUnavailable = false,
    newCatalog = false,
    demo = false,
  }: FormBlockersContext = {},
): string[] {
  const blockers: string[] = []
  // La pestaña Catálogo nueva cuenta como su carril aun sin tarjeta elegida.
  const lane = displayLaneOf(form, newCatalog)

  if (!form.name.trim()) blockers.push('create.validation.nameRequired')

  if (form.animateScenes) {
    if (animationKeyMissing)
      blockers.push('create.validation.animationKeyRequired')
  }

  // El avatar presentador (spec §9): encendido pide un avatar de la
  // biblioteca que siga sirviendo (la clave ya la resolvió withAvatarKey). En
  // la demo el avatar es el de la historia (spec demo v4 §2): no se pide nada.
  if (form.useAvatar && !demo) {
    if (!form.avatar) blockers.push('create.validation.avatarRequired')
    else if (avatarUnavailable)
      blockers.push('create.validation.avatarUnavailable')
  }

  // v1.35.0 del origen: la galería propia arranca vacía y sin tarjeta
  // elegida no hay estilo con qué generar. La del catálogo nuevo, también
  // (plan E2, P4): solo vale una tarjeta del catálogo.
  if (lane === 'custom' && !form.customStyle)
    blockers.push('create.validation.styleRequired')

  if (lane === 'catalog-gem' && laneOf(form) !== 'catalog-gem')
    blockers.push('create.validation.catalogStyleRequired')

  // Las gemas (de Mi estilo o del catálogo nuevo) escriben sus prompts con un
  // modelo: sin ninguno libre no hay video.
  if (lane !== 'legacy-catalog' && promptModelsBlocked)
    blockers.push('create.validation.promptModelsBlocked')

  // La gema pide TU personaje (ADR-0020): con el fijo del estilo ya borrado
  // de la biblioteca el remedio es editar el estilo (el chip rojo lo dice);
  // sin uno elegido, elegirlo.
  if (fixedCharacterMissing)
    blockers.push('create.validation.fixedCharacterMissing')
  else if (styleCharacterModeOf(form) === 'own' && form.characters.length === 0)
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

// Qué declaró la gema en uso (de Mi estilo o del catálogo nuevo) sobre su
// protagonista; null con el catálogo viejo o sin gema elegida. Ausente en la
// gema = genérico (compat con las guardadas antes de ADR-0020).
export function styleCharacterModeOf(
  form: CreateFormValue,
): StyleCharacterMode | null {
  if (laneOf(form) === 'legacy-catalog' || !form.customStyle) return null
  return form.customStyle.character?.mode ?? 'generic'
}
