import { copyFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { avatarLookPreviewFile } from '../../avatar/clip-path.ts'
import { lookOrientationFit } from '../../avatar/look-orientation.ts'
import {
  AVATAR_GROUP_MISSING_CODE,
  assertValidAvatarId,
  avatarsRoot,
  isUsableLook,
  readAvatarMetadata,
  readAvatarPreview,
  readLookPreview,
  type StoredAvatarLook,
} from '../avatars/avatar-library.ts'
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
  type ProjectPaths,
} from '../../project/paths.ts'
import { assertFlowPlanProvider } from '../../providers/flow/execution-plan.ts'
import {
  BALANCE_UNAVAILABLE_CODE,
  createHeyGenClient,
} from '../../providers/avatar/heygen.ts'
import { HEYGEN_PROVIDER } from '../../providers/avatar/heygen-errors.ts'
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
import {
  AVATAR_ENGINES,
  AVATAR_LOOK_ORIENTATION_BY_FORMAT,
  AVATAR_LOOK_TYPES,
  AVATAR_MAX_APPEARANCES,
  AVATAR_MAX_APPEARANCE_SECONDS,
  AVATAR_MIN_APPEARANCES,
  AVATAR_MIN_APPEARANCE_SECONDS,
  AVATAR_PLACEMENTS,
  avatarEngineAvailable,
  avatarExpressiveAvailable,
  type ProjectAvatarOptions,
} from '../../types/avatar.ts'
import type { CharacterStyleId } from '../../types/characters.ts'
import type { DecodedImage } from '../../types/images.ts'
import { videoFormatOf } from '../../types/video-format.ts'
import type {
  CreateVideoProjectPayload,
  CreateVideoProjectResult,
  NewVideoProjectCharacter,
  ProjectCharacter,
  ProjectCustomStyle,
  VideoProjectMetadata,
  VideoProjectOptions,
} from '../../types/video-project.ts'
import { TTS_TEXT_CHAR_LIMIT } from '../../providers/tts/text-limits.ts'
import { ensureDirectory, writeFileAtomic } from '../../utils/atomic-fs.ts'
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
// El pre-vuelo de la cuenta no puede colgar «Crear»: un plazo corto y ningún
// reintento de un 429 (el cliente, por defecto, espera 30 s por pedido y
// repite tres veces). Al vencer, o con un 429, avisa y sigue.
const ACCOUNT_CHECK_TIMEOUT_MS = 8000
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
  const executionPlan = assertFlowPlanProvider(
    payload.options.executionPlan,
    payload.options.imageProvider,
  )

  const projectsRoot = projectsRootOf(context)
  // El avatar se valida contra la biblioteca, su vista previa se lee y la
  // cuenta de HeyGen se mira ANTES de crear la carpeta: un look que no sirve o
  // una clave muerta no dejan un proyecto a medias.
  const projectAvatar = await resolveProjectAvatar(context, payload.options)
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
  if (projectAvatar) await storeAvatarLookPreview(paths, projectAvatar.preview)

  const now = new Date().toISOString()
  const metadata: VideoProjectMetadata = {
    id: projectId,
    name: payload.name.trim(),
    createdAt: now,
    updatedAt: now,
    state: 'draft',
    options: {
      ...payload.options,
      characters,
      ...(executionPlan ? { executionPlan } : {}),
      ...(projectAvatar ? { avatar: projectAvatar.options } : {}),
    },
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
  if (!['fal', 'evolink', 'flow'].includes(options.imageProvider))
    throw new PipelineFailure(
      'invalid_payload',
      'options.imageProvider must be fal, evolink or flow',
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

  // Avatar presentador (ADR-0057): forma, rangos y enumerados acá; la
  // biblioteca, en `resolveProjectAvatar`, antes de crear la carpeta.
  if (options.avatar !== undefined)
    assertProjectAvatar(options.avatar, options.demo)

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

// El avatar presentador (ADR-0057, diseño §3.4 y §9): forma, rangos y
// enumerados, sin tocar el disco. La demo no tiene proveedores: un proyecto
// demo con avatar es un llamador roto. Los números son enteros, como los del
// formulario de Crear.
function assertProjectAvatar(avatar: unknown, demo: boolean | undefined): void {
  if (demo)
    throw new PipelineFailure(
      'invalid_payload',
      'options.avatar is not available in demo projects',
    )
  if (!avatar || typeof avatar !== 'object' || Array.isArray(avatar))
    throw new PipelineFailure(
      'invalid_payload',
      'options.avatar must be an object',
    )

  const value = avatar as Partial<Record<keyof ProjectAvatarOptions, unknown>>
  if (typeof value.avatarId !== 'string')
    throw new PipelineFailure(
      'invalid_payload',
      'options.avatar.avatarId is required',
    )
  assertValidAvatarId(value.avatarId)
  if (typeof value.lookId !== 'string' || !value.lookId.trim())
    throw new PipelineFailure(
      'invalid_payload',
      'options.avatar.lookId is required',
    )
  if (typeof value.lookName !== 'string' || !value.lookName.trim())
    throw new PipelineFailure(
      'invalid_payload',
      'options.avatar.lookName is required',
    )
  if (!AVATAR_LOOK_TYPES.some((type) => type === value.lookType))
    throw new PipelineFailure(
      'invalid_payload',
      'options.avatar.lookType is unknown',
    )
  // El motor que eligió la persona (entrega 2e, §21.3): cualquiera de los que
  // Vimo conoce. Que el look lo admita se mira contra la biblioteca
  // (resolveProjectAvatar).
  if (!AVATAR_ENGINES.some((engine) => engine === value.engine))
    throw new PipelineFailure(
      'invalid_payload',
      `options.avatar.engine must be one of ${AVATAR_ENGINES.join(', ')}`,
    )
  // «Movimiento más expresivo» (entrega 2e): si viene, booleano. Se guarda
  // solo si sirve (storedAvatarOptions).
  if (value.expressive !== undefined && typeof value.expressive !== 'boolean')
    throw new PipelineFailure(
      'invalid_payload',
      'options.avatar.expressive must be a boolean',
    )
  // «3 veces en 2 minutos» (entrega 2f, §22.2): si viene, booleano. Se guarda
  // solo en true (storedAvatarOptions).
  if (
    value.threeInFirstTwoMinutes !== undefined &&
    typeof value.threeInFirstTwoMinutes !== 'boolean'
  )
    throw new PipelineFailure(
      'invalid_payload',
      'options.avatar.threeInFirstTwoMinutes must be a boolean',
    )
  if (
    !isIntegerBetween(
      value.appearances,
      AVATAR_MIN_APPEARANCES,
      AVATAR_MAX_APPEARANCES,
    )
  )
    throw new PipelineFailure(
      'invalid_payload',
      `options.avatar.appearances must be an integer between ${AVATAR_MIN_APPEARANCES} and ${AVATAR_MAX_APPEARANCES}`,
    )
  if (
    !isIntegerBetween(
      value.secondsPerAppearance,
      AVATAR_MIN_APPEARANCE_SECONDS,
      AVATAR_MAX_APPEARANCE_SECONDS,
    )
  )
    throw new PipelineFailure(
      'invalid_payload',
      `options.avatar.secondsPerAppearance must be an integer between ${AVATAR_MIN_APPEARANCE_SECONDS} and ${AVATAR_MAX_APPEARANCE_SECONDS}`,
    )
  if (typeof value.startWithAvatar !== 'boolean')
    throw new PipelineFailure(
      'invalid_payload',
      'options.avatar.startWithAvatar must be a boolean',
    )
  if (!AVATAR_PLACEMENTS.some((placement) => placement === value.placement))
    throw new PipelineFailure(
      'invalid_payload',
      'options.avatar.placement must be auto or manual',
    )
}

function isIntegerBetween(
  value: unknown,
  minimum: number,
  maximum: number,
): boolean {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= minimum &&
    value <= maximum
  )
}

// Lo que `createVideoProject` toma del avatar elegido: las opciones que se
// persisten y la vista previa que se copia al proyecto, ya leída y validada.
interface ResolvedProjectAvatar {
  options: ProjectAvatarOptions
  preview: DecodedImage
}

// El look ELEGIDO tal como está en la biblioteca (ADR-0057, diseño §6.2 y §9,
// cuidados 1 y 4 de §16): el avatar existe y HeyGen todavía tiene su grupo; el
// look es uno de los suyos (Crear manda por defecto el principal, pero puede
// ser otro); sirve —listo y con el motor elegido, que el look tiene que admitir
// con tarifa (entrega 2e), nunca deducido de `status: 'ready'`—; tiene la
// orientación del video, porque HeyGen lo renderiza tal cual; y tiene una
// vista previa legible, la suya o, si no, la del avatar, porque es la imagen
// fija de sus escenas. Un look sin orientación conocida pasa con un aviso. Al
// final, la clave de HeyGen tiene que servir (`assertHeyGenAccount`). Nada se
// escribe: quien llama crea la carpeta recién cuando esto no lanzó.
async function resolveProjectAvatar(
  context: PipelineContext,
  options: VideoProjectOptions,
): Promise<ResolvedProjectAvatar | undefined> {
  const avatar = options.avatar
  if (!avatar) return undefined

  const entryDirectory = join(avatarsRoot(context), avatar.avatarId)
  const metadata = await readAvatarMetadata(entryDirectory)
  if (!metadata)
    throw new PipelineFailure(
      'avatar_not_found',
      `avatar "${avatar.avatarId}" is not in the library`,
    )

  // HeyGen ya no tiene el grupo del avatar: `avatar-refresh` lo deja `failed`
  // con este código, pero sus looks listos siguen listos, así que el look de
  // abajo pasaría. El render fallaría recién en la etapa AVATAR, después de
  // pagar las imágenes de las demás escenas. Se mira el código y no
  // `metadata.status`: ese estado sale del look PRINCIPAL, y un look que no lo
  // es puede estar listo bajo un avatar fallido o procesando.
  if (metadata.errorCode === AVATAR_GROUP_MISSING_CODE)
    throw new PipelineFailure(
      AVATAR_GROUP_MISSING_CODE,
      `avatar "${avatar.avatarId}" no longer exists in HeyGen`,
    )

  const look = metadata.looks.find(
    (candidate) => candidate.lookId === avatar.lookId,
  )
  if (
    !look ||
    !isUsableLook(look) ||
    !avatarEngineAvailable(avatar.engine, look)
  )
    throw new PipelineFailure(
      'avatar_look_unavailable',
      `look "${avatar.lookId}" of avatar "${avatar.avatarId}" is missing, not ready or without ${avatar.engine}`,
    )
  if (look.lookType !== avatar.lookType)
    throw new PipelineFailure(
      'invalid_payload',
      'options.avatar.lookType does not match the library look',
    )

  const videoFormat = videoFormatOf(options)
  const orientationFit = lookOrientationFit(look, videoFormat)
  if (orientationFit === 'mismatch')
    throw new PipelineFailure(
      'avatar_look_orientation_mismatch',
      `look "${avatar.lookId}" is ${look.preferredOrientation}; a ${videoFormat} video needs a ${AVATAR_LOOK_ORIENTATION_BY_FORMAT[videoFormat]} look`,
    )

  const lookPreview = await readLookPreview(entryDirectory, look.lookId)
  const preview =
    lookPreview ?? (await readAvatarPreview(entryDirectory, metadata))
  if (!preview)
    throw new PipelineFailure(
      'avatar_look_unavailable',
      `look "${avatar.lookId}" of avatar "${avatar.avatarId}" has no readable preview, and neither has the avatar`,
    )

  // La cuenta de HeyGen, recién con todo lo local validado: un rechazo local
  // no gasta ni un pedido.
  await assertHeyGenAccount(context)

  // Los avisos, recién cuando el look ya sirvió: un rechazo no deja ninguno.
  if (orientationFit === 'unknown')
    warn(
      context,
      'the chosen look has no known orientation: it may not fill the video frame',
    )
  if (!lookPreview)
    warn(
      context,
      "the chosen look has no readable preview in the library: the avatar's own preview is the still image of its scenes",
    )

  return { options: storedAvatarOptions(avatar, look), preview }
}

// El pre-vuelo de la cuenta (ADR-0057): UNA
// lectura gratis de `GET /v3/users/me` con la clave del usuario antes de crear
// un proyecto con avatar. Una clave que HeyGen rechaza (401 o 403), o que
// falta, se descubre acá y no en la fase `avatar`, después de pagar la voz y
// las imágenes. El saldo no frena acá: lo comparan Crear y la fase antes de
// cada pago. HeyGen caído, lento (más de ACCOUNT_CHECK_TIMEOUT_MS), con un 429
// o con una respuesta rara avisa y sigue: la fase vuelve a mirar la clave y el
// saldo antes de pagar.
async function assertHeyGenAccount(context: PipelineContext): Promise<void> {
  const apiKey = context.job.apiKeys.heygen
  if (!apiKey)
    throw new PipelineFailure('missing_api_key', 'HeyGen API key is missing')

  const client = createHeyGenClient(apiKey, context.signal, {
    requestTimeoutMs: ACCOUNT_CHECK_TIMEOUT_MS,
    rateLimitRetries: 0,
  })
  const balance = await client.getBalance()
  if (balance.available) return

  if (balance.errorCode === 'avatar_invalid_key')
    throw new PipelineFailure(
      'avatar_invalid_key',
      'HeyGen rejected the API key before the project was created',
      { provider: HEYGEN_PROVIDER },
    )

  // HeyGen respondió (la clave sirve), pero la cuenta no tiene una billetera
  // legible, como un plan de suscripción: nada que avisar.
  if (balance.errorCode === BALANCE_UNAVAILABLE_CODE) return

  warn(
    context,
    `HeyGen account could not be checked (${balance.errorCode ?? 'unknown'}): the avatar stage checks the key and the balance again before paying`,
  )
}

// Lo que se persiste: solo los campos del contrato (§3.4 + `avatarId`), con el
// nombre del look tal como está en la biblioteca (el de HeyGen no tiene tope de
// largo). Un campo de más en el payload no llega a project.json. `expressive`
// (entrega 2e) va al final, solo en true y solo si el motor y el look lo
// admiten; detrás, `threeInFirstTwoMinutes` (entrega 2f), solo en true: sin
// ellos, las opciones de antes, byte a byte.
function storedAvatarOptions(
  avatar: ProjectAvatarOptions,
  look: StoredAvatarLook,
): ProjectAvatarOptions {
  const expressive =
    avatar.expressive === true &&
    avatarExpressiveAvailable(avatar.engine, look.lookType)

  return {
    avatarId: avatar.avatarId,
    lookId: look.lookId,
    lookName: look.name,
    lookType: look.lookType,
    engine: avatar.engine,
    appearances: avatar.appearances,
    secondsPerAppearance: avatar.secondsPerAppearance,
    startWithAvatar: avatar.startWithAvatar,
    placement: avatar.placement,
    ...(expressive ? { expressive: true } : {}),
    ...(avatar.threeInFirstTwoMinutes === true
      ? { threeInFirstTwoMinutes: true }
      : {}),
  }
}

// Copia la vista previa ya validada al proyecto con su extensión REAL, leída de
// sus primeros bytes (cuidado 4 de §16): es la imagen fija de las escenas de
// avatar —miniatura y respaldo estático del render— y el proyecto queda
// autocontenido aunque la biblioteca cambie.
async function storeAvatarLookPreview(
  paths: ProjectPaths,
  preview: DecodedImage,
): Promise<void> {
  await ensureDirectory(paths.avatarDirectory)
  await writeFileAtomic(
    avatarLookPreviewFile(paths, preview.ext),
    preview.bytes,
  )
}

function warn(context: PipelineContext, message: string): void {
  context.emitter.emit({ type: 'log', level: 'warn', message })
}
