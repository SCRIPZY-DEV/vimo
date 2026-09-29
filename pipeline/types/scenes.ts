// Dominio de escenas del pipeline de video (port renombrado de Escena /
// DireccionEscena / DeepgramWord del origen). Browser-safe: la UI importa
// estos tipos con `import type` (mismo criterio que image-provider.ts).
//
// ⚠️ Los nombres de campos de `Scene` son el formato persistido en
// scenes.json: Library (paso 7) lee este formato — no se retocan después.

import type { SceneAnimation, SceneAnimationView } from './animation.ts'

// Una palabra transcrita con sus timestamps (salida de Deepgram, Fase 2).
export interface TranscriptWord {
  word: string
  start: number
  end: number
}

// Tratamientos visuales que asigna el director de escenas (ADR-0013; port de
// la taxonomía TratamientoEscena del origen).
export const SCENE_TREATMENTS = [
  'action',
  'diagram',
  'metaphor',
  'bubble',
  'group',
  'object',
  'memory',
  'place',
] as const

export type SceneTreatment = (typeof SCENE_TREATMENTS)[number]

// La orden del director para UNA escena: qué se muestra y desde dónde.
export interface SceneDirection {
  treatment: SceneTreatment
  place: string
  emotion: string
  extras?: string
  labels?: string[]
  // true si salió del parche determinístico (sin LLM): la próxima corrida
  // del director la re-planifica.
  provisional?: boolean
}

// Tarea de imagen ya encargada (y potencialmente cobrada) a Evolink. Guard
// E26/E27 del origen: antes de re-encargar se consulta esta tarea — un
// reintento jamás re-crea a ciegas trabajo que el proveedor pudo cobrar.
export interface SceneImageTask {
  provider: 'evolink'
  taskId: string
  // Hash del pedido (modelo + prompt + calidad): si el pedido cambió, la
  // tarea vieja ya no aplica.
  hash: string
}

// Una escena del video. La ruta de su imagen NO se persiste: se deriva de
// `scenes/scene_<id>.jpg` dentro de la carpeta del proyecto.
export interface Scene {
  id: number
  // Fragmento de narración que cubre la escena; puede ser "" si el corte
  // cayó en un silencio (la escena igual lleva prompt e imagen: se ilustra
  // como pausa desde la narración vecina).
  text: string
  direction?: SceneDirection
  imagePrompt?: string
  // Prompt escrito a mano por el usuario en el editor (llega con Library).
  userPrompt?: string
  // El userPrompt desde el que se redactó el imagePrompt vigente. Si difiere
  // de `userPrompt`, la descripción está pendiente de aplicar (campo aditivo:
  // ausente en proyectos viejos = nunca se aplicó ninguna).
  appliedUserPrompt?: string
  // true si el prompt salió del fallback determinístico (sin LLM).
  promptIsFallback?: boolean
  startSeconds?: number
  endSeconds?: number
  // Fundido opcional al entrar desde otra imagen; los clips mantienen su fundido.
  staticTransitionIn?: boolean
  // Encargo previsto del prefijo animado; conserva6s incluso en la cola del audio.
  animationRequestedSeconds?: number
  // Overrides por escena del modelo/calidad de imagen (los usa Library).
  imageModel?: string
  imageQuality?: string
  // Índices dentro de options.characters de los personajes presentes.
  charactersPresent?: number[]
  // El proveedor de imagen rechazó el prompt por contenido: solo estas
  // escenas se reescriben en las pasadas de recuperación.
  contentRejected?: boolean
  imageTask?: SceneImageTask
  // Animación de la escena (ADR-0047). Presente solo en la escena que
  // ENCABEZA un clip; la ruta del clip no se persiste, se deriva igual que la
  // de la imagen. Ausente = escena estática, que es como renderizan todos los
  // proyectos anteriores: sin estos campos el video sale byte-idéntico.
  animation?: SceneAnimation
  // El candidato nunca reemplaza un clip pagado antes de validarse.
  animations?: SceneAnimation[]
  animationPending?: SceneAnimation[]
  animationHistory?: SceneAnimation[]
  visualSourceSceneId?: number
  // Id de la escena que encabeza el clip que cubre a esta. Una escena
  // absorbida no se renderiza sola ni se edita por su cuenta.
  absorbedBy?: number
}

export type SceneImageStatus = 'pending' | 'generating' | 'ok' | 'error'

// Vista de una escena para la UI (viaja en eventos y en el status del
// proyecto): sin campos internos del pipeline, con el estado de su imagen.
export interface SceneSummary {
  id: number
  text: string
  imagePrompt?: string
  startSeconds?: number
  endSeconds?: number
  animationRequestedSeconds?: number
  staticTransitionIn?: boolean
  // Ruta absoluta para mostrarla vía convertFileSrc(); solo si existe.
  imagePath?: string
  imageStatus: SceneImageStatus
  // Animación de la escena que encabeza un clip (ADR-0047); ausente en las
  // escenas estáticas. `absorbedBy` apunta a la que encabeza el clip que
  // cubre a esta: la UI la muestra plegada dentro de él.
  animation?: SceneAnimationView
  animations?: SceneAnimationView[]
  animationPending?: SceneAnimationView[]
  visualSourceSceneId?: number
  absorbedBy?: number
}
