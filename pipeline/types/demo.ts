import type { AvatarEngine, ProjectAvatarOptions } from './avatar.ts'
import type { VideoFormat } from './video-format.ts'
import type { VoiceProviderId } from './voices.ts'

// Contrato del modo demo (ADR-0029; historias por formato y audio por
// historia en ADR-0030; pack v4 en docs/handoff/2026-10-14-demo-v4/design.md
// §3). Browser-safe: la UI lo consume solo con `import type`. El manifest ya
// viene traducido al formato nativo — el pack publicado (claves en español)
// se lee en commands/demo/pack.ts y nunca cruza este borde crudo.

export interface DemoVoice {
  provider: VoiceProviderId
  voiceId: string
  name: string
}

// Con qué personaje se generó la historia: el del estilo (los estilos del
// catálogo con personaje fijo) o ninguno.
export type DemoCharacterMode = 'generic' | 'none'

// El avatar presentador de una historia, como lo muestra Crear. Solo lo trae
// la historia de una gema: la vista del look vive en la carpeta de la gema.
export interface DemoAvatar {
  name: string
  engine: AvatarEngine
  appearances: number
  secondsPerAppearance: number
  // Ruta absoluta de la vista del look dentro del pack instalado.
  previewFile: string
  // Las opciones del proyecto del que salió la historia: la simulación las
  // copia a `options.avatar` (en la demo el avatar nunca viene del payload).
  options: ProjectAvatarOptions
}

// Una historia del pack: la de un estilo del catálogo o la de una gema.
export interface DemoStyleEntry {
  // Catálogo: el id del estilo (catalogStyleId). Gema: el id de la gema.
  id: string
  suggestedName: string
  // Contenido de guion.txt: el formulario lo muestra tal cual.
  script: string
  sceneCount: number
  audioDurationSeconds: number
  // Ruta absoluta del audio.mp3 de la historia dentro del pack instalado:
  // «Subir mi audio» lo muestra ya cargado en demo (ADR-0030).
  audioFile: string
  character: DemoCharacterMode
  // Trae la variante animada (video_animado.mp4 y los clips del primer
  // minuto) además del video sin animar.
  animated: boolean
  avatar?: DemoAvatar
}

// Una gema de «Mi estilo» que trae el pack.
export interface DemoGem {
  // Carpeta de la gema en el pack y de sus historias (storytelling,
  // jardineria).
  id: string
  // Id con el que se siembra en la galería, `_styles/<styleId>/`
  // (demo-storytelling, demo-jardineria).
  styleId: string
  name: string
}

// Las historias de un formato, en el orden del manifest.
export interface DemoStories {
  // Las de los estilos del catálogo.
  styles: DemoStyleEntry[]
  // Las de las gemas que tienen historia en este formato.
  gems: DemoStyleEntry[]
}

// Historias por formato. Un formato sin historias en el pack no tiene clave:
// Crear lo muestra en «Próximamente».
export type DemoStoriesByFormat = Partial<Record<VideoFormat, DemoStories>>

export interface DemoManifest {
  version: string
  voice: DemoVoice
  gems: DemoGem[]
  stories: DemoStoriesByFormat
}

export interface DemoStatusResult {
  ready: boolean
  version: string
  // Solo con ready: lo que Crear necesita para pre-llenarse.
  manifest?: DemoManifest
  // Lo que pesa el pack configurado (la suma de sus partes) y cuánto ya
  // quedó bajado: las partes con marca en el staging de esta versión, o todo
  // si el pack ya está instalado. La puerta muestra el tamaño y sigue sola si
  // ya había empezado.
  downloadBytes: number
  downloadedBytes: number
  // El espacio libre que pide lo que falta instalar, con la misma cuenta que
  // demo-prepare antes de cada parte (lo que falta extraer + la parte más
  // grande de las que faltan + el margen); 0 con el pack instalado. Son los
  // GB del aviso de `demo_disk_full`.
  requiredFreeBytes: number
  // Si un demo-prepare vivo tiene el lock de la instalación en esta raíz (su
  // proceso existe y latió hace poco). La puerta que espera lo usa para
  // distinguir «alguien baja» de «nadie baja»: sin nadie y sin el pack
  // listo, relanza demo-prepare, que sigue desde la primera parte sin marca.
  installing: boolean
}

export interface DemoPrepareResult {
  manifest: DemoManifest
}
