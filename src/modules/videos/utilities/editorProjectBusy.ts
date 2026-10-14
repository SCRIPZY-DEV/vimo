// Si el editor tiene una tarea en curso en un proyecto: el avatar (cobra en
// HeyGen), un render, una exportación, una regeneración, una animación o un
// cambio de audio. Lo anota el store del editor al cargarse
// (useLibraryEditorTask) y lo lee Crear antes de lanzar el pipeline sobre un
// proyecto que ya existe (rejectIfBusy, en useCreateTask): el sidecar lo
// rechazaría con `animation_project_busy` y la tarea quedaría en error en vez
// de esperar (entrega 2d, M3 de la revisión final). Vive aparte porque el
// store del editor ya importa el de Crear: al revés, se importarían en
// círculo. Sin el editor cargado no hay tareas suyas.
let editorBusyCheck: (projectId: string) => boolean = () => false

export function setEditorProjectBusyCheck(
  check: (projectId: string) => boolean,
) {
  editorBusyCheck = check
}

export function isEditorProjectBusy(projectId: string) {
  return editorBusyCheck(projectId)
}
