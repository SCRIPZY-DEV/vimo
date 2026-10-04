import type {
  StyleCloneAction,
  StyleCloneIdentity,
  StyleCloneServerImage,
  StyleCloneSession,
  StyleCloneTurn,
  StyleCloneTurnDraft,
  StyleCloneTurnResult,
} from '@/modules/videos/types/styleClone'
import type {
  StyleCloneCharacterMode,
  StyleCloneMaterialItem,
  StyleCloneOrigin,
} from '@pipeline/types/style-clone.ts'
import type { GemSectionKey, GemSections } from '@pipeline/types/styles.ts'

// El contrato de la app con el creador de estilo de vimo.click (ADR-0050):
// qué lleva cada turno y cómo se lee su respuesta. La respuesta es dato de
// afuera: lo que no cumple el contrato no se usa, nunca se completa a ojo.
// Puro, solo con `import type`: lo corre scripts/test/check-app-style-clone.mjs
// con Node pelado, por eso sus constantes viven acá y no en constants.ts.

type TurnAction = Exclude<StyleCloneAction, { kind: 'redraw' }>
type DraftSession = Pick<
  StyleCloneSession,
  'source' | 'replicateCharacter' | 'title' | 'history' | 'designs'
>

const SERVER_ACTIONS: Record<
  TurnAction['kind'],
  StyleCloneTurnDraft['accion']
> = {
  analyze: 'analizar',
  'adjust-character': 'ajustar-personaje',
  'choose-character': 'elegir-personaje',
  'adjust-scenes': 'ajustar-escenas',
  approve: 'aprobar',
}

// Las secciones que redacta el creador: sin `character` (el personaje clonado
// entra por la biblioteca) ni `promptStart`.
const CLONED_SECTION_KEYS: readonly GemSectionKey[] = [
  'visualStyle',
  'dynamism',
  'camera',
  'rules',
  'promptEnd',
]

// El turno que corresponde a una acción, sin las imágenes: el `api/` les suma
// el base64, la versión de la app y el idioma.
export function styleCloneTurnDraftOf(
  session: DraftSession,
  action: TurnAction,
): StyleCloneTurnDraft {
  const draft: StyleCloneTurnDraft = {
    accion: SERVER_ACTIONS[action.kind],
    origen:
      session.source.kind === 'youtube'
        ? { tipo: 'youtube', titulo: session.title }
        : { tipo: 'imagenes' },
    replicarPersonaje: session.replicateCharacter,
    historial: session.history,
  }

  if (action.kind === 'adjust-character' || action.kind === 'adjust-scenes')
    draft.comentario = action.comment.trim()
  if (action.kind === 'choose-character')
    draft.eleccion = {
      opcion: action.option,
      prompt:
        session.designs.find((design) => design.index === action.option)
          ?.prompt ?? '',
    }

  return draft
}

const SERVER_KINDS: Record<
  StyleCloneMaterialItem['kind'],
  StyleCloneServerImage['tipo']
> = {
  mosaic: 'mosaico',
  frame: 'fotograma',
  thumbnail: 'miniatura',
  image: 'imagen',
}

// Una imagen del material como la espera el servidor, con su base64.
export function styleCloneServerImageOf(
  item: StyleCloneMaterialItem,
  data: string,
): StyleCloneServerImage {
  return {
    tipo: SERVER_KINDS[item.kind],
    mimeType: item.mimeType,
    data,
    ...(item.rows ? { filas: item.rows } : {}),
    ...(item.columns ? { columnas: item.columns } : {}),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const isPosition = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1

// Qué imagen del material recrea una prueba. Lo que no se entiende es una
// escena nueva: nunca se muestra un original equivocado.
function readOrigin(value: unknown): StyleCloneOrigin {
  if (!isRecord(value)) return { kind: 'new' }
  if (
    value.tipo === 'mosaico' &&
    isPosition(value.mosaico) &&
    isPosition(value.fila) &&
    isPosition(value.columna)
  )
    return {
      kind: 'mosaic',
      mosaic: value.mosaico,
      row: value.fila,
      column: value.columna,
    }
  if (value.tipo === 'fotograma' && isPosition(value.numero))
    return { kind: 'frame', number: value.numero }
  if (value.tipo === 'imagen' && isPosition(value.numero))
    return { kind: 'image', number: value.numero }

  return { kind: 'new' }
}

function readTurns(value: unknown): StyleCloneTurn[] | null {
  if (!Array.isArray(value) || value.length === 0) return null

  const turns: StyleCloneTurn[] = []
  for (const turn of value) {
    if (!isRecord(turn)) return null
    if (turn.role !== 'user' && turn.role !== 'model') return null
    if (typeof turn.text !== 'string' || !turn.text) return null
    turns.push({ role: turn.role, text: turn.text })
  }
  return turns
}

function readPrompts(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0) return null
  if (value.some((prompt) => typeof prompt !== 'string' || !prompt.trim()))
    return null
  return value.map((prompt: string) => prompt.trim())
}

function readScenes(value: unknown): StyleCloneTurnResult['scenes'] | null {
  if (!Array.isArray(value) || value.length === 0) return null

  const scenes: NonNullable<StyleCloneTurnResult['scenes']> = []
  for (const scene of value) {
    if (!isRecord(scene)) return null
    if (typeof scene.prompt !== 'string' || !scene.prompt.trim()) return null
    scenes.push({
      prompt: scene.prompt.trim(),
      origin: readOrigin(scene.origen),
    })
  }
  return scenes
}

function readIdentity(value: unknown): StyleCloneIdentity | null {
  if (!isRecord(value)) return null
  if (typeof value.descripcion !== 'string' || !value.descripcion.trim())
    return null
  return {
    name: typeof value.nombre === 'string' ? value.nombre.trim() : '',
    description: value.descripcion.trim(),
  }
}

function readSections(value: unknown): GemSections | null {
  if (!isRecord(value)) return null
  const text = (key: GemSectionKey) => {
    const section = value[key]
    return typeof section === 'string' ? section.trim() : ''
  }
  // Sin estilo visual o sin cierre fijo no hay estilo clonado.
  if (!text('visualStyle') || !text('promptEnd')) return null

  const sections: GemSections = { visualStyle: text('visualStyle') }
  for (const key of CLONED_SECTION_KEYS) {
    if (key !== 'visualStyle' && text(key)) sections[key] = text(key)
  }
  return sections
}

// Cómo sugiere el servidor que quede el personaje de un estilo que no replicó
// uno: «Sin personaje» si el original no muestra ninguno. Lo que no se entiende
// no es una sugerencia: el estilo queda en «Personaje genérico», como siempre.
function readSuggestedCharacterMode(
  value: unknown,
): StyleCloneCharacterMode | null {
  if (!isRecord(value)) return null
  const mode = value.characterMode
  if (mode === 'none' || mode === 'generic') return mode

  return null
}

const readText = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : ''

// La línea `resultado` de un turno, validada y con los nombres de la app.
// null = no cumple el contrato de su acción.
export function readStyleCloneTurnResult(
  line: unknown,
): StyleCloneTurnResult | null {
  if (!isRecord(line) || line.tipo !== 'resultado') return null
  const turns = readTurns(line.turnos)
  if (!turns) return null

  if (line.accion === 'analizar') {
    const header = {
      turns,
      name: readText(line.nombre),
      description: readText(line.descripcion),
    }
    if (line.fase === 'personaje') {
      const designs = readPrompts(line.disenos)
      if (!designs) return null
      const characterIn = readOrigin(line.personajeEn)
      return {
        ...header,
        characterIn: characterIn.kind === 'new' ? null : characterIn,
        designs,
      }
    }
    const scenes = readScenes(line.escenas)
    return scenes ? { ...header, scenes } : null
  }

  if (line.accion === 'ajustar-personaje') {
    const designs = readPrompts(line.disenos)
    if (!designs) return null
    const characterIn = readOrigin(line.personajeEn)
    return {
      turns,
      characterIn: characterIn.kind === 'new' ? null : characterIn,
      designs,
    }
  }

  if (line.accion === 'elegir-personaje') {
    const identity = readIdentity(line.identidad)
    const scenes = readScenes(line.escenas)
    return identity && scenes ? { turns, identity, scenes } : null
  }

  if (line.accion === 'ajustar-escenas') {
    const scenes = readScenes(line.escenas)
    return scenes ? { turns, scenes } : null
  }

  if (line.accion === 'aprobar') {
    const sections = readSections(line.sections)
    if (!sections || !isPosition(line.templateVersion)) return null
    const characterMode = readSuggestedCharacterMode(line.suggestions)
    return {
      turns,
      sections,
      templateVersion: line.templateVersion,
      ...(characterMode ? { characterMode } : {}),
    }
  }

  return null
}

export type StyleCloneTurnOutcome =
  | { ok: true; result: StyleCloneTurnResult }
  // `code` es el del servidor (`modelo-fallo`, `modelo-timeout`…); null = la
  // respuesta se cortó antes de su última línea o no cumple el contrato.
  | { ok: false; code: string | null }

// Lo que dejó la respuesta por partes de un turno: su última línea es el
// resultado o el error; las anteriores (`inicio`, `latido`) solo mantienen
// viva la conexión.
export function styleCloneTurnOutcome(
  lines: readonly unknown[],
): StyleCloneTurnOutcome {
  const last = lines[lines.length - 1]
  if (isRecord(last) && last.tipo === 'error')
    return {
      ok: false,
      code: typeof last.code === 'string' && last.code ? last.code : null,
    }

  const result = readStyleCloneTurnResult(last)
  return result ? { ok: true, result } : { ok: false, code: null }
}
