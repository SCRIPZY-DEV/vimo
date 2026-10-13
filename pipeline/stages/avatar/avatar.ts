import {
  isAccountFailureCode,
  pendingAvatarScenes,
  renderAvatarScenes,
} from '../../avatar/render-scenes.ts'
import { readScenes } from '../../project/scenes-file.ts'
import { HEYGEN_PROVIDER } from '../../providers/avatar/heygen-errors.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type { Stage } from '../../runner/stage.ts'
import type { CreateVideoContext } from '../context.ts'

// Fase `avatar` (ADR-0057, diseño §8): entre las imágenes y la animación de
// Kie. Cada escena de avatar se genera con HeyGen —el look con su propio
// fondo, en el formato del proyecto— y reanudar retoma solo lo que falta: los
// recibos viven en cada escena y nunca se paga dos veces. Una escena lista
// pero desactualizada no se regenera sola: cuesta, y lo decide la persona
// desde el editor (`avatar-render-scenes`).
// Desde la entrega 2d (pregunta 6 del dueño, 2026-10-11) una aparición que
// falla no frena el video: la fase termina y el render la muestra con la
// imagen fija del look (§10.1). Solo la cuenta (la clave, el saldo) la frena.
// Y una vez terminada no vuelve a correr al reanudar por otra fase: lo que
// dejó con la imagen fija se regenera desde el editor, con el costo a la
// vista (ruling de la ronda 1 de WP-P).
// Desde la entrega 2h (diseño §24.1) corre junto con las imágenes: no usa nada
// de los prompts ni de las imágenes (la narración, el tramo de cada escena y el
// look copiado al crear el proyecto), así que arranca con ellas. El runner le
// da su propia señal: si las imágenes fallan, la corta (los recibos quedan
// guardados); si falla ella, las imágenes terminan igual. Lo único del
// contexto que cambia es `metadata.videoOutdated`, compartido a propósito.
export const avatarStage: Stage<CreateVideoContext> = {
  id: 'avatar',
  runsAlongside: 'images',
  async skip(context) {
    if (context.options.demo || context.regenerateSceneIds) return true

    // Terminada una vez (el pipeline la anota en `completedStages` solo si
    // `run` terminó: una pausa de la cuenta no la completa), reanudar por otra
    // fase no la vuelve a correr: no reintenta ni paga las apariciones que
    // quedaron con la imagen fija, ni cosecha sus recibos. Eso lo hace el
    // «Regenerar» del editor (`avatar-render-scenes`).
    if (context.metadata.completedStages.includes('avatar')) return true

    const scenes = await readScenes(context.paths)
    if (!scenes) return true

    return (
      (await pendingAvatarScenes(context.paths, scenes, context.metadata))
        .length === 0
    )
  },
  async run(context) {
    context.signal.throwIfAborted()
    if (context.regenerateSceneIds) return undefined

    const outcome = await renderAvatarScenes(context)
    context.signal.throwIfAborted()
    if (outcome.failed.length === 0) return undefined

    const dominant = outcome.dominantCode
    // La cuenta frenó la corrida (la clave dejó de servir a mitad, con un 401
    // al consultar o al pedir; o el saldo): la fase sale con ESE código, que
    // la persona sabe resolver y que el saldo convierte en pausa con recarga
    // (diseño §14). `dominantCode` ya lo prefiere a cualquier otro fallo de la
    // corrida: sin la cuenta arreglada no se cosecha ni se paga nada.
    if (dominant && isAccountFailureCode(dominant))
      throw new PipelineFailure(
        dominant,
        `avatar scenes without a clip: ${outcome.failed.join(', ')} (the HeyGen account stopped them: ${dominant})`,
        { provider: HEYGEN_PROVIDER },
      )

    // Las demás fallaron por sí mismas (render fallido, plazo vencido,
    // moderación, un look que no sirve, la descarga, HeyGen caído): la fase
    // termina y el video sale igual, con la imagen fija del look en esas
    // escenas (entrega 2d; el render ya las deja estáticas, §10.1). La
    // pantalla de progreso lo dice con los `avatar-scene-failed` de la
    // corrida y el editor las regenera con el costo a la vista. Los recibos
    // quedan guardados: uno `pending` que venció el plazo se cosecha sin pagar
    // cuando el editor regenera la escena (terminada, la fase no vuelve a
    // correr al reanudar).
    context.emitter.emit({
      type: 'log',
      level: 'warn',
      message: `avatar scenes without a clip: ${outcome.failed.join(', ')} (most frequent failure: ${dominant ?? 'unknown'}): the video shows the look's still image there`,
    })
    return undefined
  },
}
