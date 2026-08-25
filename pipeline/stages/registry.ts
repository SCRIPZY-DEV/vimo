import type { Stage } from '../runner/stage.ts'
import type { CreateVideoContext } from './context.ts'
import { imagesStage } from './images/images.ts'
import { renderStage } from './render/render.ts'
import { sceneCutsStage } from './scene-cuts/scene-cuts.ts'
import { scenePromptsStage } from './scene-prompts/scene-prompts.ts'
import { transcriptionStage } from './transcription/transcription.ts'
import { voiceStage } from './voice/voice.ts'

// Registro declarativo del pipeline de video (ADR-0010): agregar una fase =
// un archivo en stages/ + una línea acá. El orden ES la secuencia del video.
export const CREATE_VIDEO_STAGES: Stage<CreateVideoContext>[] = [
  voiceStage,
  transcriptionStage,
  sceneCutsStage,
  scenePromptsStage,
  imagesStage,
  renderStage,
]
