import { mkdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'

import {
  toDataUri,
  validateImageBytes,
} from '../../providers/image/download.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type { CharacterSummary } from '../../types/characters.ts'
import type { DecodedImage } from '../../types/images.ts'
import type {
  StyleCloneCharacter,
  StyleCloneCharacterMode,
  StyleCloneSavePayload,
  StyleCloneSaveResult,
} from '../../types/style-clone.ts'
import type { AiCloneGemOrigin, GemSections } from '../../types/styles.ts'
import { ensureDirectory, writeFileAtomic } from '../../utils/atomic-fs.ts'
import {
  DESCRIPTION_LIMIT,
  MIN_DESCRIPTION_LENGTH,
  NAME_LIMIT,
  applyNewPreviews,
  charactersRoot,
  newCharacterId,
  toCharacterSummary,
  writeCharacterMetadata,
  writePhotoFile,
  type StoredCharacterMetadata,
} from '../characters/character-library.ts'
import { assertCloneCharacter } from './style-clone-draw.ts'
import {
  assertValidCloneFile,
  assertValidCloneSessionId,
  cloneSessionDirectory,
  readCloneMaterial,
  type StoredCloneMaterial,
} from './style-clone-store.ts'
import {
  STYLE_FILE,
  STYLE_NAME_LIMIT,
  assertGemSections,
  assertTemplateVersion,
  newCustomStyleId,
  readStyleEntry,
  styleDirectory,
  type StoredStyle,
} from './style-store.ts'

// Las muestras de un estilo de Mi estilo: las 4 escenas de prueba aprobadas.
const CLONE_SAMPLE_LIMIT = 4
// Cómo puede quedar un estilo clonado sin personaje replicado.
const CLONE_CHARACTER_MODES: readonly StyleCloneCharacterMode[] = [
  'generic',
  'none',
]

interface CloneSave {
  sessionId: string
  name: string
  sections: GemSections
  templateVersion: number
  samples: string[]
  character?: StyleCloneCharacter
  characterMode: StyleCloneCharacterMode
}

interface CreatedCharacter {
  id: string
  directory: string
  summary: CharacterSummary
}

// Guarda una clonación aprobada como un estilo NUEVO de Mi estilo (`st-…`),
// igual a cualquier estilo de plantilla (ADR-0048): las secciones que redactó
// el servidor, su versión, las clonaciones aprobadas como muestras y el origen
// `ai-clone` que lee la etiqueta de la tarjeta.
//
// Si la clonación replicó al personaje, se crea en la biblioteca y el estilo
// lo trae por defecto en «Mi personaje»: «con foto», con el diseño elegido
// como su foto (viaja como referencia en todos los estilos, ADR-0033);
// «identidad de prompt», sin foto y con el diseño como su retrato del estilo
// nuevo (se ve en su tarjeta y no viaja: ADR-0021, enmienda del 2026-10-02).
// Sin personaje replicado, el estilo queda en el modo que sugirió el servidor:
// «Sin personaje» si el original no muestra ninguno (un canal de diagramas: en
// genérico Vimo le sumaría un protagonista que el estilo no tiene) y, si no
// sugirió nada, «Personaje genérico». La sección `character` no se guarda
// nunca: «genérico» siempre significa diseñarlo desde el guion.
//
// Todo se valida y se lee antes de tocar el disco. Las muestras y el personaje
// se escriben primero y style.json al final (como catalog-style-copy): hasta
// que existe, la carpeta no es un estilo. Un guardado que falla a mitad borra
// lo que alcanzó a escribir y deja la sesión intacta para reintentar; uno que
// sale bien borra la carpeta de la sesión.
export async function styleCloneSave(
  context: PipelineContext,
): Promise<StyleCloneSaveResult> {
  const save = readPayload(context.job.payload)
  const sessionDirectory = cloneSessionDirectory(context, save.sessionId)
  const material = await readCloneMaterial(sessionDirectory)
  if (!material)
    throw new PipelineFailure(
      'style_clone_session_missing',
      `the style clone session "${save.sessionId}" is not on disk`,
    )

  const samples: DecodedImage[] = []
  for (const file of save.samples)
    samples.push(await readSessionImage(sessionDirectory, file))
  const design = save.character
    ? await readSessionImage(sessionDirectory, save.character.designFile)
    : null

  const id = newCustomStyleId()
  const directory = styleDirectory(context, id)
  let created: CreatedCharacter | null = null
  try {
    await ensureDirectory(directory)
    for (const [index, sample] of samples.entries())
      await writeFileAtomic(
        join(directory, `sample-${index + 1}.jpg`),
        sample.bytes,
      )

    if (save.character && design)
      created = await createCharacter(context, save.character, design, id)

    const now = new Date().toISOString()
    const stored: StoredStyle = {
      name: save.name,
      sections: save.sections,
      templateVersion: save.templateVersion,
      origin: originOf(material),
      shots: [],
      character: created
        ? { mode: 'own', defaultCharacterId: created.id }
        : { mode: save.characterMode },
      createdAt: now,
      updatedAt: now,
    }
    await writeFileAtomic(
      join(directory, STYLE_FILE),
      `${JSON.stringify(stored, null, 2)}\n`,
    )
  } catch (error) {
    await rm(directory, { recursive: true, force: true }).catch(() => {})
    if (created)
      await rm(created.directory, { recursive: true, force: true }).catch(
        () => {},
      )
    throw error
  }

  const entry = await readStyleEntry(context, id)
  if (!entry)
    throw new PipelineFailure('style_save_failed', 'style.json unreadable')

  // El estilo ya está guardado: si la carpeta de la sesión no se deja borrar,
  // queda huérfana y no rompe nada.
  await rm(sessionDirectory, { recursive: true, force: true }).catch(() => {})
  return { entry, ...(created ? { character: created.summary } : {}) }
}

function invalid(message: string): never {
  throw new PipelineFailure('invalid_payload', message)
}

function readPayload(value: unknown): CloneSave {
  const payload = value as Partial<StyleCloneSavePayload> | undefined
  assertValidCloneSessionId(payload?.sessionId)

  const name = typeof payload.name === 'string' ? payload.name.trim() : ''
  if (!name) invalid('payload.name is required')
  if (name.length > STYLE_NAME_LIMIT) invalid('payload.name is too long')

  // La sección `character` se descarta aunque llegue: el personaje clonado
  // entra por la biblioteca.
  const sections = assertGemSections(payload.sections, 'payload.sections')
  delete sections.character
  assertTemplateVersion(payload.templateVersion, 'payload.templateVersion')

  const samples = payload.samples
  if (
    !Array.isArray(samples) ||
    samples.length === 0 ||
    samples.length > CLONE_SAMPLE_LIMIT
  )
    invalid(`payload.samples must list 1 to ${CLONE_SAMPLE_LIMIT} files`)
  for (const file of samples) assertValidCloneFile(file, 'payload.samples[]')
  if (new Set(samples).size !== samples.length)
    invalid('payload.samples must not repeat a file')

  const character = payload.character
  if (character !== undefined) {
    assertCloneCharacter(character, 'payload.character')
    if (!character.name.trim()) invalid('payload.character.name is required')
    // Sin foto la identidad ES la descripción: el mismo piso que la biblioteca.
    if (
      character.travel === 'text' &&
      character.description.trim().length < MIN_DESCRIPTION_LENGTH
    )
      invalid(
        `payload.character.description must be at least ${MIN_DESCRIPTION_LENGTH} characters`,
      )
  }

  const characterMode = payload.characterMode ?? 'generic'
  if (!CLONE_CHARACTER_MODES.includes(characterMode))
    invalid(
      `payload.characterMode must be one of ${CLONE_CHARACTER_MODES.join(', ')}`,
    )

  return {
    sessionId: payload.sessionId,
    name,
    sections,
    templateVersion: payload.templateVersion,
    samples,
    ...(character ? { character } : {}),
    characterMode,
  }
}

// Una imagen de la sesión que nombró la app: tiene que existir y ser una
// imagen de verdad, porque pasa a ser una muestra o la foto de un personaje.
async function readSessionImage(
  sessionDirectory: string,
  file: string,
): Promise<DecodedImage> {
  let bytes: Buffer
  try {
    bytes = await readFile(join(sessionDirectory, file))
  } catch {
    throw new PipelineFailure(
      'style_clone_file_missing',
      `"${file}" is not in the style clone session`,
    )
  }

  const image = validateImageBytes(bytes)
  if (!image)
    throw new PipelineFailure(
      'style_clone_file_missing',
      `"${file}" of the style clone session is not an image`,
    )
  return image
}

// De dónde salió el estilo: lo dice el material de la sesión, que escribió el
// sidecar al prepararla, no el webview.
function originOf(material: StoredCloneMaterial): AiCloneGemOrigin {
  if (material.source === 'images')
    return { kind: 'ai-clone', source: 'images' }
  return {
    kind: 'ai-clone',
    source: 'youtube',
    ...(material.videoUrl ? { videoUrl: material.videoUrl } : {}),
  }
}

async function createCharacter(
  context: PipelineContext,
  character: StyleCloneCharacter,
  design: DecodedImage,
  styleId: string,
): Promise<CreatedCharacter> {
  const id = newCharacterId(character.name)
  const directory = join(charactersRoot(context), id)
  await mkdir(directory, { recursive: true })

  const metadata: StoredCharacterMetadata = {
    name: character.name.trim().slice(0, NAME_LIMIT),
    description: character.description.trim().slice(0, DESCRIPTION_LIMIT),
    createdAt: new Date().toISOString(),
    previews:
      character.travel === 'text'
        ? await applyNewPreviews(
            directory,
            [],
            [{ styleId, dataUri: toDataUri(design) }],
          )
        : [],
  }
  if (character.travel === 'photo')
    metadata.photoFile = await writePhotoFile(directory, design)
  await writeCharacterMetadata(directory, metadata)

  return {
    id,
    directory,
    summary: await toCharacterSummary(directory, id, metadata),
  }
}
