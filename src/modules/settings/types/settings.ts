export type ChooseProjectsRootResult = string | null

// Con qué ritmo arrancan los videos de estilo propio. `confirmScenes` se
// guarda en positivo (igual que el campo del formulario de Crear); la sección
// de Ajustes lo invierte para mostrar «No preguntarme al generar».
export interface SceneDurationDefaults {
  secondsPerScene: number
  confirmScenes: boolean
}
