import {
  SCENE_TREATMENTS,
  type Scene,
  type SceneTreatment,
} from '../../../types/scenes.ts'

// El TRATAMIENTO de las escenas de una gema de plantilla con dinamismo
// (ADR-0048, spec §5.3): lo declara la etiqueta `[T:…]` de cada prompt y se
// guarda en `scene.treatment` para medir el reparto del video. Solo
// diagnóstico: no hay verificación por código (decisión F6).

/**
 * La escena con el tratamiento de su prompt NUEVO. Sin tratamiento se borra
 * el que hubiera (era de un prompt anterior); una escena que nunca tuvo queda
 * idéntica, así las gemas viejas no ven este campo.
 */
export function withTreatment(
  scene: Scene,
  treatment: SceneTreatment | undefined,
): Scene {
  if (treatment) return { ...scene, treatment }
  if (scene.treatment === undefined) return scene
  const next = { ...scene }
  delete next.treatment
  return next
}

/**
 * El reparto de las escenas escritas en esta pasada, para el log del cierre
 * de la fase: cuántas de cada tratamiento, cuántas sin etiqueta válida y el
 * porcentaje que nombró al protagonista.
 */
export function describeTreatmentMix(
  scenes: readonly Scene[],
  written: ReadonlySet<number>,
  scenesWithSubject: readonly number[],
): string {
  const writtenScenes = scenes.filter((scene) => written.has(scene.id))
  const total = writtenScenes.length
  const counts = SCENE_TREATMENTS.map((treatment): [string, number] => [
    treatment,
    writtenScenes.filter((scene) => scene.treatment === treatment).length,
  ]).filter(([, count]) => count > 0)
  const untagged = writtenScenes.filter((scene) => !scene.treatment).length
  if (untagged > 0) counts.push(['untagged', untagged])

  const withSubject = new Set(scenesWithSubject.filter((id) => written.has(id)))
    .size
  const percent = total > 0 ? Math.round((withSubject / total) * 100) : 0
  const mix = counts.map(([name, count]) => `${name} ${count}`).join(', ')
  return `treatment mix of the ${total} written scene(s): ${mix || 'none'} — protagonist in ${percent}% (${withSubject} of ${total})`
}
