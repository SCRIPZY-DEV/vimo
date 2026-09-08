export type ChooseProjectsRootResult = string | null

// Con qué ritmo arrancan los videos de estilo propio. `confirmScenes` se
// guarda en positivo (igual que el campo del formulario de Crear); la sección
// de Ajustes lo invierte para mostrar «No preguntarme al generar».
export interface SceneDurationDefaults {
  secondsPerScene: number
  confirmScenes: boolean
}

// Con qué modelo se redactan los prompts de imagen de los videos de estilo
// propio, y cómo se muestra el selector en Crear. Van juntos porque comparten
// la sección de Ajustes y siempre se leen de a dos.
export interface PromptModelDefaults {
  // null = el modelo de la casa.
  modelId: string | null
  // true = en Crear solo se ve la tarjeta del modelo elegido.
  compact: boolean
}
