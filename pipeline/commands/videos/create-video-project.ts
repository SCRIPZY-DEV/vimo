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
  STYLE_NAME_LIMIT,
  SYSTEM_PROMPT_CHAR_LIMIT,
  assertColorFilter,
  assertGemSections,
  assertStyleCharacter,
  assertTemplateVersion,
  isCatalogStyleId,
} from '../styles/style-store.ts'
import {
  MAX_SECONDS_PER_SCENE,
  MIN_SECONDS_PER_SCENE,
} from '../../stages/scene-cuts/by-seconds.ts'
import type { CharacterStyleId } from '../../types/characters.ts'
import type {
  CreateVideoProjectPayload,
  CreateVideoProjectResult,
  NewVideoProjectCharacter,
  ProjectCharacter,
  ProjectCustomStyle,
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
// `options.styleId` de un proyecto con estilo propio o con una gema nueva del
// catálogo: el contrato exige un CharacterStyleId y el resolver prefiere el
// snapshot (pipeline/stages/shared/project-style.ts).
const CUSTOM_STYLE_PROJECT_STYLE_ID: CharacterStyleId = 'normal'

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
  if (
    options.animationMinutes !== undefined &&
    (!Number.isSafeInteger(options.animationMinutes) ||
      options.animationMinutes < 0 ||
      !Number.isSafeInteger(options.animationMinutes * 60))
  )
    throw new PipelineFailure(
      'invalid_payload',
      'animationMinutes must be a non-negative integer',
    )
  if (
    options.animateWholeVideo !== undefined &&
    (typeof options.animateWholeVideo !== 'boolean' ||
      (options.animateWholeVideo &&
        (options.videoFormat !== '9:16' ||
          (options.animationMinutes ?? 0) > 0)))
  )
    throw new PipelineFailure(
      'invalid_payload',
      'animateWholeVideo requires 9:16 and cannot be combined with animationMinutes',
    )
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
  // Modo demo (ADR-0029): solo booleano; cualquier otra cosa es un llamador
  // roto, no un modo nuevo.
  if (options.demo !== undefined && typeof options.demo !== 'boolean')
    throw new PipelineFailure(
      'invalid_payload',
      'options.demo must be a boolean',
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
  // se valida igual arriba — con customStyle la UI manda 'normal', o el id
  // heredado de una gema del catálogo.
  const customStyle = options.customStyle
  if (customStyle !== undefined)
    assertProjectCustomStyle(customStyle, options.styleId)

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

// El snapshot de la gema (ADR-0018, ADR-0048): vieja (`systemPrompt`) o de
// plantilla (`sections`), nunca las dos, con los mismos límites que la
// galería. Lo demás del snapshot se valida igual para los dos tipos.
function assertProjectCustomStyle(
  customStyle: ProjectCustomStyle,
  styleId: CharacterStyleId,
): void {
  if (!customStyle.name?.trim())
    throw new PipelineFailure(
      'invalid_payload',
      'options.customStyle needs a name',
    )
  if (customStyle.name.trim().length > STYLE_NAME_LIMIT)
    throw new PipelineFailure(
      'invalid_payload',
      `options.customStyle.name exceeds ${STYLE_NAME_LIMIT} characters`,
    )
  if (customStyle.sections !== undefined) {
    if (customStyle.systemPrompt !== undefined)
      throw new PipelineFailure(
        'invalid_payload',
        'options.customStyle takes systemPrompt or sections, never both',
      )
    assertGemSections(customStyle.sections, 'options.customStyle.sections')
    if (customStyle.templateVersion !== undefined)
      assertTemplateVersion(
        customStyle.templateVersion,
        'options.customStyle.templateVersion',
      )
  } else {
    if (!customStyle.systemPrompt?.trim())
      throw new PipelineFailure(
        'invalid_payload',
        'options.customStyle needs systemPrompt or sections',
      )
    if (customStyle.systemPrompt.length > SYSTEM_PROMPT_CHAR_LIMIT)
      throw new PipelineFailure(
        'invalid_payload',
        `options.customStyle.systemPrompt exceeds ${SYSTEM_PROMPT_CHAR_LIMIT} characters`,
      )
    if (customStyle.templateVersion !== undefined)
      throw new PipelineFailure(
        'invalid_payload',
        'options.customStyle.templateVersion only applies to sections',
      )
  }
  if ((customStyle.shots?.length ?? 0) > MAX_SHOTS)
    throw new PipelineFailure(
      'invalid_payload',
      `options.customStyle allows at most ${MAX_SHOTS} shots`,
    )
  if (customStyle.character !== undefined)
    assertStyleCharacter(customStyle.character, 'options.customStyle.character')
  if (customStyle.colorFilter !== undefined)
    assertColorFilter(
      customStyle.colorFilter,
      'options.customStyle.colorFilter',
    )
  if (customStyle.catalogStyleId === undefined) return
  if (!isCatalogStyleId(customStyle.catalogStyleId))
    throw new PipelineFailure(
      'invalid_payload',
      'options.customStyle.catalogStyleId is not a valid style id',
    )
  assertCatalogProjectStyle(customStyle, customStyle.catalogStyleId, styleId)
}

// Un proyecto de una gema del catálogo (spec §8, plan E2 §5.4): el snapshot
// lleva el id de la gema como `styleId` y como `catalogStyleId`, y
// `options.styleId` es ese mismo id si la gema es una de las 5 heredadas, o
// 'normal' si es nueva — el valor con el que viaja un estilo propio.
function assertCatalogProjectStyle(
  customStyle: ProjectCustomStyle,
  catalogStyleId: string,
  styleId: CharacterStyleId,
): void {
  if (customStyle.styleId !== catalogStyleId)
    throw new PipelineFailure(
      'invalid_payload',
      'options.customStyle.styleId must equal options.customStyle.catalogStyleId',
    )

  const legacy = isCharacterStyleId(catalogStyleId)
  if (legacy && styleId !== catalogStyleId)
    throw new PipelineFailure(
      'invalid_payload',
      'options.styleId must equal options.customStyle.catalogStyleId for a legacy catalog style',
    )
  if (!legacy && styleId !== CUSTOM_STYLE_PROJECT_STYLE_ID)
    throw new PipelineFailure(
      'invalid_payload',
      `options.styleId must be ${CUSTOM_STYLE_PROJECT_STYLE_ID} for a new catalog style`,
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

// Deja la foto de cada personaje «con foto» DENTRO del proyecto: el pipeline
// nunca vuelve a mirar la biblioteca, así el proyecto es autocontenido y la
// biblioteca puede cambiar.
async function storeCharacterReferences(
  projectsRoot: string,
  charactersDirectory: string,
  payload: CreateVideoProjectPayload,
): Promise<ProjectCharacter[] | undefined> {
  const incoming = payload.characters ?? []
  if (incoming.length === 0) return undefined

  await ensureDirectory(charactersDirectory)

  const stored: ProjectCharacter[] = []
  for (const [index, character] of incoming.entries()) {
    validateCharacter(character)
    const referenceImageFile = await storeReferenceImage(
      projectsRoot,
      charactersDirectory,
      character,
      index,
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
  if (!character.name?.trim())
    throw new PipelineFailure('invalid_payload', 'each character needs a name')
  if (character.mode !== 'photo' && character.mode !== 'text')
    throw new PipelineFailure(
      'invalid_payload',
      'character.mode must be photo or text',
    )
  // Sin foto la descripción ES la identidad; con foto es un refuerzo opcional.
  if (character.mode === 'text' && !character.description?.trim())
    throw new PipelineFailure(
      'invalid_payload',
      'text characters need a description',
    )
  if (
    character.mode === 'photo' &&
    !character.photoDataUri &&
    !character.characterId
  )
    throw new PipelineFailure(
      'invalid_payload',
      'photo characters need photoDataUri or a library characterId',
    )
  // El id de biblioteca queda en project.json aunque el personaje no busque
  // nada en ella (uno de texto ya no copia referencia): se valida siempre.
  if (character.characterId) assertValidCharacterId(character.characterId)
}

async function storeReferenceImage(
  projectsRoot: string,
  charactersDirectory: string,
  character: NewVideoProjectCharacter,
  index: number,
): Promise<string | undefined> {
  // Un personaje de identidad de prompt viaja SIEMPRE como texto, tenga o no
  // retrato del estilo (enmienda del 2026-10-02 a la ADR-0021): no lleva
  // referencia.
  if (character.mode !== 'photo') return undefined

  // La foto puede venir directa como data URI.
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

  if (!character.characterId) return undefined

  const libraryDirectory = join(
    projectsRoot,
    'characters',
    character.characterId,
  )
  const libraryMetadata = await readCharacterMetadata(libraryDirectory)

  // Personaje «con foto» de la biblioteca: la foto es su identidad y viaja
  // como referencia en TODOS los estilos (ADR-0033). Sin el archivo no hay
  // personaje que ofrecer — el listado ya lo esconde, así que llegar acá sin
  // foto es un payload inconsistente, no un caso a degradar.
  const photoFile = libraryMetadata?.photoFile
  if (!photoFile)
    throw new PipelineFailure(
      'invalid_payload',
      `character "${character.characterId}" has no photo in the library`,
    )

  const extension = photoFile.split('.').pop() ?? 'jpg'
  const file = `reference_${index + 1}.${extension}`
  await copyFile(
    join(libraryDirectory, photoFile),
    join(charactersDirectory, file),
  )
  return file
}
