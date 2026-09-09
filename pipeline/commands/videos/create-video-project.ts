import { copyFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  readCharacterMetadata,
  assertValidCharacterId,
} from '../characters/character-library.ts'
import { writeProjectMetadata } from '../../project/metadata.ts'
import {
  RESERVED_ROOT_DIRECTORIES,
  isValidFile,
  projectsRootOf,
  resolveProjectPaths,
} from '../../project/paths.ts'
import { decodeImageDataUri } from '../../providers/image/download.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import { isCharacterStyleId } from '../../prompts/visual-styles.ts'
import {
  MAX_SHOTS,
  SYSTEM_PROMPT_CHAR_LIMIT,
  assertStyleCharacter,
} from '../styles/style-store.ts'
import {
  MAX_SECONDS_PER_SCENE,
  MIN_SECONDS_PER_SCENE,
} from '../../stages/scene-cuts/by-seconds.ts'
import type {
  CreateVideoProjectPayload,
  CreateVideoProjectResult,
  NewVideoProjectCharacter,
  ProjectCharacter,
  VideoProjectMetadata,
} from '../../types/video-project.ts'
import { TTS_TEXT_CHAR_LIMIT } from '../../providers/tts/text-limits.ts'
import { ensureDirectory } from '../../utils/atomic-fs.ts'
import { slugifyProjectName } from '../../utils/slug.ts'

// Límites del formulario, espejados en src/modules/videos/constants.ts.
export const PROJECT_NAME_LIMIT = 80
// El guion no puede superar lo que la voz puede narrar (una sola fuente:
// providers/tts/text-limits.ts).
export const SCRIPT_CHAR_LIMIT = TTS_TEXT_CHAR_LIMIT
export const MAX_PROJECT_CHARACTERS = 2
export const MAX_SCENE_COUNT = 500
// Un id de modelo es `autor/nombre`; el más largo del catálogo ronda los 45.
export const PROMPT_MODEL_ID_LIMIT = 200

const MAX_REFERENCE_IMAGE_BYTES = 8 * 1024 * 1024
const MAX_SLUG_ATTEMPTS = 50

// Crea la carpeta del proyecto (ADR-0009) con project.json en estado draft,
// el guion y las referencias de personajes resueltas. El pipeline en sí se
// lanza aparte con run-video-pipeline: crear es barato y reversible.
export async function createVideoProject(
  context: PipelineContext,
): Promise<CreateVideoProjectResult> {
  const payload = context.job.payload as CreateVideoProjectPayload | undefined
  validatePayload(payload)

  const projectsRoot = projectsRootOf(context)
  const projectId = await resolveAvailableSlug(projectsRoot, payload.name)
  const paths = resolveProjectPaths(join(projectsRoot, projectId), projectId)

  await ensureDirectory(paths.root)
  await ensureDirectory(paths.scenesDirectory)

  if (payload.script) await writeFile(paths.scriptFile, payload.script, 'utf8')

  const characters = await storeCharacterReferences(
    context,
    projectsRoot,
    paths.charactersDirectory,
    payload,
  )

  const now = new Date().toISOString()
  const metadata: VideoProjectMetadata = {
    id: projectId,
    name: payload.name.trim(),
    createdAt: now,
    updatedAt: now,
    state: 'draft',
    options: { ...payload.options, characters },
    completedStages: [],
  }
  await writeProjectMetadata(paths, metadata)

  return { projectId, projectDir: paths.root }
}

function validatePayload(
  payload: CreateVideoProjectPayload | undefined,
): asserts payload is CreateVideoProjectPayload {
  if (!payload?.name?.trim())
    throw new PipelineFailure('invalid_payload', 'payload.name is required')
  if (payload.name.trim().length > PROJECT_NAME_LIMIT)
    throw new PipelineFailure('invalid_payload', 'payload.name is too long')

  const options = payload.options
  if (!options)
    throw new PipelineFailure('invalid_payload', 'payload.options is required')
  if (!isCharacterStyleId(options.styleId))
    throw new PipelineFailure(
      'invalid_payload',
      `unknown styleId "${String(options.styleId)}"`,
    )
  if (options.narrationMode !== 'tts' && options.narrationMode !== 'own-audio')
    throw new PipelineFailure(
      'invalid_payload',
      'options.narrationMode must be tts or own-audio',
    )
  if (options.imageProvider !== 'fal' && options.imageProvider !== 'evolink')
    throw new PipelineFailure(
      'invalid_payload',
      'options.imageProvider must be fal or evolink',
    )
  if (options.subtitles !== undefined && typeof options.subtitles !== 'boolean')
    throw new PipelineFailure(
      'invalid_payload',
      'options.subtitles must be a boolean',
    )
  if (
    options.autoRender !== undefined &&
    typeof options.autoRender !== 'boolean'
  )
    throw new PipelineFailure(
      'invalid_payload',
      'options.autoRender must be a boolean',
    )
  // Whitelist estricta (espejo del origen): cualquier otro valor es un
  // payload inválido, no un fallback silencioso a 16:9.
  if (
    options.videoFormat !== undefined &&
    options.videoFormat !== '16:9' &&
    options.videoFormat !== '9:16'
  )
    throw new PipelineFailure(
      'invalid_payload',
      'options.videoFormat must be 16:9 or 9:16',
    )

  // Estilo propio inline (snapshot): mismos límites que la galería. styleId
  // se valida igual arriba — con customStyle la UI manda 'normal'.
  const customStyle = options.customStyle
  if (customStyle !== undefined) {
    if (!customStyle.name?.trim() || !customStyle.systemPrompt?.trim())
      throw new PipelineFailure(
        'invalid_payload',
        'options.customStyle needs name and systemPrompt',
      )
    if (customStyle.systemPrompt.length > SYSTEM_PROMPT_CHAR_LIMIT)
      throw new PipelineFailure(
        'invalid_payload',
        `options.customStyle.systemPrompt exceeds ${SYSTEM_PROMPT_CHAR_LIMIT} characters`,
      )
    if ((customStyle.shots?.length ?? 0) > MAX_SHOTS)
      throw new PipelineFailure(
        'invalid_payload',
        `options.customStyle allows at most ${MAX_SHOTS} shots`,
      )
    if (customStyle.character !== undefined)
      assertStyleCharacter(
        customStyle.character,
        'options.customStyle.character',
      )
  }

  const sceneCount = options.sceneCount
  if (
    !Number.isInteger(sceneCount) ||
    sceneCount < 0 ||
    sceneCount > MAX_SCENE_COUNT
  )
    throw new PipelineFailure(
      'invalid_payload',
      `options.sceneCount must be an integer between 0 and ${MAX_SCENE_COUNT}`,
    )

  // Segundos-por-escena: solo tiene sentido con estilo propio (el carril por
  // segundos vive en la Fase 3 detrás de customStyle) y dentro del rango del
  // slider. Whitelist estricta: un valor fuera de rango es un llamador roto,
  // no una preferencia.
  const secondsPerScene = options.secondsPerScene
  if (secondsPerScene !== undefined) {
    if (customStyle === undefined)
      throw new PipelineFailure(
        'invalid_payload',
        'options.secondsPerScene requires options.customStyle',
      )
    if (
      !Number.isInteger(secondsPerScene) ||
      secondsPerScene < MIN_SECONDS_PER_SCENE ||
      secondsPerScene > MAX_SECONDS_PER_SCENE
    )
      throw new PipelineFailure(
        'invalid_payload',
        `options.secondsPerScene must be an integer between ${MIN_SECONDS_PER_SCENE} and ${MAX_SECONDS_PER_SCENE}`,
      )
  }

  // Modelo de prompts: solo con estilo propio (el carril de la casa no lo
  // lee). Sin whitelist contra el catálogo a propósito — la degradación con
  // aviso vive en resolveVerbatimModel; acá solo se rechaza basura.
  const promptModel = options.promptModel
  if (promptModel !== undefined) {
    if (customStyle === undefined)
      throw new PipelineFailure(
        'invalid_payload',
        'options.promptModel requires options.customStyle',
      )
    if (
      typeof promptModel !== 'string' ||
      !promptModel.trim() ||
      promptModel.length > PROMPT_MODEL_ID_LIMIT
    )
      throw new PipelineFailure(
        'invalid_payload',
        `options.promptModel must be a non-empty string of at most ${PROMPT_MODEL_ID_LIMIT} characters`,
      )
  }

  // Con narración TTS el guion es obligatorio; con audio propio es opcional
  // (si falta, la Fase 3 lo reconstruye desde la transcripción).
  const script = payload.script?.trim() ?? ''
  if (options.narrationMode === 'tts' && !script)
    throw new PipelineFailure('invalid_payload', 'payload.script is required')
  if (script.length > SCRIPT_CHAR_LIMIT)
    throw new PipelineFailure('invalid_payload', 'payload.script is too long')

  if ((payload.characters?.length ?? 0) > MAX_PROJECT_CHARACTERS)
    throw new PipelineFailure(
      'invalid_payload',
      `at most ${MAX_PROJECT_CHARACTERS} characters per project`,
    )
}

// Slug único bajo la raíz: colisión (u otro nombre reservado) → -2, -3, …
async function resolveAvailableSlug(
  projectsRoot: string,
  name: string,
): Promise<string> {
  const base = slugifyProjectName(name) || 'video'

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`
    if (RESERVED_ROOT_DIRECTORIES.has(candidate)) continue
    const metadataFile = join(projectsRoot, candidate, 'project.json')
    if (!(await isValidFile(metadataFile))) return candidate
  }

  throw new PipelineFailure(
    'project_exists',
    `could not find a free slug for "${name}"`,
  )
}

// Deja cada referencia visual DENTRO del proyecto (foto subida o preview de
// la biblioteca del estilo actual): el pipeline nunca vuelve a mirar la
// biblioteca, así el proyecto es autocontenido y la biblioteca puede cambiar.
async function storeCharacterReferences(
  context: PipelineContext,
  projectsRoot: string,
  charactersDirectory: string,
  payload: CreateVideoProjectPayload,
): Promise<ProjectCharacter[] | undefined> {
  const incoming = payload.characters ?? []
  if (incoming.length === 0) return undefined

  await ensureDirectory(charactersDirectory)

  // Con estilo propio el preview se busca por el id de galería de la gema
  // (options.styleId viaja como 'normal' solo para el contrato).
  const previewStyleKey =
    payload.options.customStyle?.styleId ?? payload.options.styleId

  const stored: ProjectCharacter[] = []
  for (const [index, character] of incoming.entries()) {
    validateCharacter(character)
    const referenceImageFile = await storeReferenceImage(
      context,
      projectsRoot,
      charactersDirectory,
      character,
      index,
      previewStyleKey,
    )

    const entry: ProjectCharacter = {
      name: character.name.trim(),
      description: character.description.trim(),
      mode: character.mode,
    }
    if (character.characterId) entry.characterId = character.characterId
    if (referenceImageFile) entry.referenceImageFile = referenceImageFile
    if (character.isProtagonist) entry.isProtagonist = true
    stored.push(entry)
  }

  return stored
}

function validateCharacter(character: NewVideoProjectCharacter): void {
  if (!character.name?.trim() || !character.description?.trim())
    throw new PipelineFailure(
      'invalid_payload',
      'each character needs name and description',
    )
  if (character.mode !== 'photo' && character.mode !== 'text')
    throw new PipelineFailure(
      'invalid_payload',
      'character.mode must be photo or text',
    )
  if (character.mode === 'photo' && !character.photoDataUri)
    throw new PipelineFailure(
      'invalid_payload',
      'photo characters need photoDataUri',
    )
}

async function storeReferenceImage(
  context: PipelineContext,
  projectsRoot: string,
  charactersDirectory: string,
  character: NewVideoProjectCharacter,
  index: number,
  previewStyleKey: string,
): Promise<string | undefined> {
  // La foto (o el preview ya generado) puede venir directa como data URI.
  if (character.photoDataUri) {
    const image = decodeImageDataUri(
      character.photoDataUri,
      MAX_REFERENCE_IMAGE_BYTES,
    )
    if (!image)
      throw new PipelineFailure(
        'invalid_payload',
        `character ${index + 1} photoDataUri is not a valid image`,
      )

    const file = `reference_${index + 1}.${image.ext}`
    await writeFile(join(charactersDirectory, file), image.bytes)
    return file
  }

  // Modo texto con personaje de biblioteca: se copia el preview del estilo
  // ACTUAL (regla E20: jamás el de otro estilo). Si no existe, el personaje
  // viaja sin referencia — su identidad va solo como texto — y queda un
  // aviso en el log; la UI ya lo anticipa en el picker.
  if (!character.characterId) return undefined
  assertValidCharacterId(character.characterId)

  const libraryDirectory = join(
    projectsRoot,
    'characters',
    character.characterId,
  )
  const libraryMetadata = await readCharacterMetadata(libraryDirectory)
  const preview = libraryMetadata?.previews?.find(
    (item) => item.styleId === previewStyleKey,
  )
  if (!preview) {
    context.emitter.emit({
      type: 'log',
      level: 'warn',
      message: `character "${character.characterId}" has no preview for style "${previewStyleKey}" — its identity travels as text only`,
    })
    return undefined
  }

  const extension = preview.file.split('.').pop() ?? 'jpg'
  const file = `reference_${index + 1}.${extension}`
  await copyFile(
    join(libraryDirectory, preview.file),
    join(charactersDirectory, file),
  )
  return file
}
