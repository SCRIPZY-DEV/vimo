import { isLlmAuthFailure } from '../../providers/llm/auth-failure.ts'
import { isInsufficientCreditsFailure } from '../../utils/insufficient-credits.ts'
import {
  BIBLE_OUTPUT_LIMIT,
  buildVisualBibleSystemPrompt,
  buildVisualBibleUserPrompt,
} from '../../prompts/visual-bible.ts'
import { resolveProjectStyle } from './project-style.ts'
import { isValidFile } from '../../project/paths.ts'
import { readTextWithRetry, writeFileAtomic } from '../../utils/atomic-fs.ts'
import {
  bibleHasCurrentMarker,
  markBible,
  stripBibleMarker,
} from '../../utils/story-era.ts'
import type { CreateVideoContext } from '../context.ts'
import { createCatalogSceneLlm } from './catalog-llm.ts'

// Biblia visual global (port de cargarOGenerarContextoVisual): UNA llamada
// LLM premium por proyecto que fija los HECHOS style-neutral del mundo (y la
// línea ERA que gobierna el lock de época). Memoizada en visual-context.txt
// con marcador de versión: biblias con marcador viejo se regeneran (el
// contrato cambió). NUNCA rechaza: sin biblia, los prompts salen sin ella.
export async function loadOrGenerateVisualBible(
  context: CreateVideoContext,
  script: string,
): Promise<string | undefined> {
  const bibleFile = context.paths.visualContextFile

  if (await isValidFile(bibleFile)) {
    try {
      const stored = (await readTextWithRetry(bibleFile)).trim()
      if (stored.length >= 20 && bibleHasCurrentMarker(stored))
        return stripBibleMarker(stored)
      // Marcador viejo o ausente: se regenera abajo (en una generación
      // completa TODO se reconstruye coherente; la tolerancia a marcador
      // obsoleto es exclusiva de la regeneración puntual de Library).
    } catch {
      // Ilegible: se regenera abajo.
    }
  }

  try {
    context.emitter.emit({
      type: 'log',
      level: 'info',
      message: 'generating the global visual context (1 LLM call)',
    })

    const llm = createCatalogSceneLlm(context)
    const style = resolveProjectStyle(context.options)
    const referenceCharacters = (context.options.characters ?? [])
      .filter((character) => character.name?.trim())
      .map((character) => ({
        name: character.name,
        description: character.description ?? '',
      }))

    const content = await llm.generate({
      systemPrompt: buildVisualBibleSystemPrompt({
        style,
        referenceCharacters,
      }),
      userPrompt: buildVisualBibleUserPrompt(script),
      jsonOnly: false,
      tier: 'premium',
      validate: (content) => content.trim().length >= 40,
    })

    context.signal.throwIfAborted()
    const bible = content.trim().slice(0, BIBLE_OUTPUT_LIMIT)
    // Se persiste CON marcador; se devuelve limpia (el marcador jamás llega
    // a un prompt).
    await writeFileAtomic(bibleFile, markBible(bible))
    return bible
  } catch (error) {
    context.signal.throwIfAborted()
    // Clave rechazada: seguir «sin biblia» solo posterga el mismo 401 a la
    // fase de prompts. Se corta acá, que es lo más temprano posible.
    if (isLlmAuthFailure(error) || isInsufficientCreditsFailure(error))
      throw error
    context.emitter.emit({
      type: 'log',
      level: 'warn',
      message: `visual context generation failed (${error instanceof Error ? error.message : String(error)}); prompts will be written without it`,
    })
    return undefined
  }
}
