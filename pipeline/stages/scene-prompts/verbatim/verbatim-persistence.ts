import {
  toSceneSummary,
  writeScenesOwned,
} from '../../../project/scenes-file.ts'
import type { Scene } from '../../../types/scenes.ts'
import type { CreateVideoContext } from '../../context.ts'
import type { VerbatimScenePrompt } from './verbatim-lane.ts'

/**
 * Persistencia incremental del carril verbatim: escribe `scenes.json` cada vez
 * que un lote cierra, en vez de una sola vez cuando la fase entera termina
 * bien. Un prompt cosechado ya se pagó en DeepInfra, así que perderlo porque
 * la corrida murió después es plata del usuario — y el reintento lo volvía a
 * comprar completo.
 *
 * Es el mismo patrón que el carril de la casa (`onSceneProcessed` en
 * `scene-prompts.ts`): un buffer con todas las escenas y una cadena de
 * promesas que serializa las escrituras, porque los grupos corren en paralelo
 * y comparten este objeto.
 */
export interface VerbatimPromptPersistence {
  onPrompts: (prompts: readonly VerbatimScenePrompt[]) => Promise<void>
  /** Espera las escrituras encoladas. Nunca rechaza. */
  flush: () => Promise<void>
}

export function createVerbatimPromptPersistence(
  context: CreateVideoContext,
  scenes: Scene[],
): VerbatimPromptPersistence {
  // Sembrado con las escenas TAL COMO vinieron, y solo se reemplazan los ids
  // que llegan por `onPrompts`. Eso es lo que hace imposible persistir un
  // prompt vaciado: la fase de imágenes le pasa a la lane un array con los
  // prompts a reescribir en blanco, y ese blanco nunca puede llegar al disco.
  const buffer = scenes.map((scene) => ({ ...scene }))
  let persistence = Promise.resolve()

  const apply = (prompt: VerbatimScenePrompt) => {
    const index = buffer.findIndex((scene) => scene.id === prompt.id)
    if (index < 0) return
    buffer[index] = {
      ...buffer[index]!,
      imagePrompt: prompt.imagePrompt,
      // Un prompt del motor nunca es relleno: si la escena traía uno, deja de serlo.
      promptIsFallback: false,
      ...(prompt.charactersPresent === undefined
        ? {}
        : { charactersPresent: prompt.charactersPresent }),
    }
    // Con prompt nuevo la escena deja de estar apartada para el editor.
    delete buffer[index].promptFailure
  }

  return {
    async onPrompts(prompts) {
      const next = persistence.then(async () => {
        // Una respuesta que llega DESPUÉS de la cancelación no se escribe.
        // Cancelar en el editor significa dejar la escena como estaba: su
        // imagen vieja sigue en disco y un prompt nuevo la contradiría.
        // Esto NO le quita valor al arreglo: los lotes que cerraron ANTES de
        // la cancelación ya están escritos, y eso es lo que antes se perdía
        // entero. Lo único que se resigna es el lote cuya respuesta llegó
        // tarde.
        if (context.signal.aborted) return
        for (const prompt of prompts) apply(prompt)
        await writeScenesOwned(
          context.paths,
          buffer,
          context.regenerateSceneIds,
        )
        for (const prompt of prompts) {
          const scene = buffer.find((item) => item.id === prompt.id)
          if (!scene) continue
          context.emitter.emit({
            type: 'scene-prompt-ready',
            scene: await toSceneSummary(context.paths, scene),
          })
        }
      })
      // La cadena sigue viva aunque ESTA escritura falle: sin el catch, una
      // rejection dejaba la promesa rota y los lotes siguientes ni se
      // intentaban. El error igual sube al llamador, que lo avisa.
      persistence = next.catch(() => undefined)
      await next
    },
    async flush() {
      await persistence.catch(() => undefined)
    },
  }
}
