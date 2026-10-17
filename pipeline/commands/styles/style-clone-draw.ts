import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

import {
  canRestartFlowBatch,
  flowCommand,
  flowReference,
  generateFlowBatch,
} from '../../providers/flow/client.ts'
import { assertFlowPlanProvider } from '../../providers/flow/execution-plan.ts'
import {
  imageFileHash,
  importFlowImage,
} from '../../providers/flow/import-image.ts'
import { flowHash, readFlowBatch } from '../../providers/flow/storage.ts'
import type {
  FlowBatchOptions,
  FlowImageRequest,
  FlowStatus,
} from '../../providers/flow/types.ts'

import { readImageAsDataUri } from '../../project/characters.ts'
import { buildCustomStyleReferencePrompt } from '../../prompts/character-reference.ts'
import {
  generateEvolinkImage,
  uploadEvolinkReference,
} from '../../providers/image/evolink.ts'
import { generateFalImage } from '../../providers/image/fal.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure, toPipelineFailure } from '../../runner/failure.ts'
import type { DecodedImage } from '../../types/images.ts'
import type { PaidImageProviderId } from '../../types/image-provider.ts'
import type {
  StyleCloneCharacter,
  StyleCloneDrawItem,
  StyleCloneDrawKind,
  StyleCloneDrawPayload,
  StyleCloneDrawProgressDetail,
  StyleCloneDrawResult,
  StyleCloneDrawnItem,
  StyleCloneOrigin,
} from '../../types/style-clone.ts'
import { writeFileAtomic } from '../../utils/atomic-fs.ts'
import { applySafetyReplacements } from '../../utils/content-safety.ts'
import { requireFfmpegPath, runFfmpeg } from '../../utils/ffmpeg.ts'
import { isInsufficientCreditsCode } from '../../utils/insufficient-credits.ts'
import { createProviderFailureReporter } from '../../utils/provider-failure.ts'
import { NAME_LIMIT } from '../characters/character-library.ts'
import { MAX_WOVEN_IDENTITY_CHARS } from '../../stages/scene-prompts/verbatim/subject-weaver.ts'
import {
  neutralizeSampleSubject,
  pointSampleToReference,
  weaveSampleIdentity,
} from './sample-character.ts'
import { jpegSize } from './style-clone-material.ts'
import {
  assertValidCloneFile,
  assertValidCloneSessionId,
  cloneSessionDirectory,
  findMaterialItem,
  readCloneMaterial,
  type StoredCloneMaterial,
} from './style-clone-store.ts'

// Cuántas pruebas trae una ronda (las que devuelve el servidor): 3 diseños
// del personaje o 4 escenas, que son las 4 muestras del estilo.
const MAX_ITEMS: Record<StyleCloneDrawKind, number> = { designs: 3, scenes: 4 }
const MAX_ROUND = 999
// Un prompt de prueba ronda los 1 000 a 2 000 caracteres (lleva la ficha de
// estilo entera); más que esto no lo escribió el modelo del creador.
const DRAW_PROMPT_CHAR_LIMIT = 6_000
const POLL_INTERVAL_MS = 1000

type SendImage = (
  prompt: string,
  references?: string[],
) => Promise<DecodedImage>

// Dibuja una ronda de pruebas de una clonación con el proveedor de imágenes
// del usuario, en la calidad de las muestras de Mi estilo. Los diseños del
// personaje y las escenas sin personaje van con su prompt tal cual; las
// escenas de un estilo con personaje lo llevan de la forma que eligió el
// usuario: tejido como texto («identidad de prompt») o con el diseño adjunto
// («con foto»), con las mismas funciones que las muestras y el video.
//
// Cada escena trae además el «Original» que recrea. Una imagen que falla no
// tumba la ronda (su tarjeta ofrece reintentar); saldo agotado y clave
// rechazada sí cortan el job, después de anunciar las que salieron.
export async function styleCloneDraw(
  context: PipelineContext,
): Promise<StyleCloneDrawResult> {
  const payload = readPayload(context.job.payload)
  const apiKey =
    payload.imageProvider === 'flow'
      ? undefined
      : context.job.apiKeys[payload.imageProvider]
  if (payload.imageProvider !== 'flow' && !apiKey)
    throw new PipelineFailure(
      'missing_api_key',
      `${payload.imageProvider} API key is missing`,
    )

  const directory = cloneSessionDirectory(context, payload.sessionId)
  if (
    payload.imageProvider === 'flow' &&
    !(await stat(directory).catch(() => null))?.isDirectory()
  )
    throw new PipelineFailure(
      'style_clone_file_missing',
      'The style clone session no longer exists',
    )
  const designDataUri = payload.character
    ? await readDesign(directory, payload.character)
    : undefined
  const material =
    payload.kind === 'scenes' ? await readCloneMaterial(directory) : null

  // Publicar todas las tarjetas antes del primer encargo.
  for (const item of payload.items)
    report(context, { index: item.index, status: 'processing' })

  const references =
    payload.imageProvider === 'flow'
      ? []
      : await referenceUrls(
          context,
          payload.imageProvider,
          apiKey!,
          designDataUri,
        )
  const prefix = payload.kind === 'designs' ? 'design' : 'scene'

  const results = await Promise.allSettled(
    payload.items.map(async (item): Promise<StyleCloneDrawnItem> => {
      const originalPath = material
        ? await originalOf(context, directory, material, item, payload.round)
        : undefined
      const drawn: StyleCloneDrawnItem = {
        index: item.index,
        ...(originalPath ? { originalPath } : {}),
      }

      try {
        const file = `${prefix}-r${payload.round}-${item.index}.jpg`
        const path = join(directory, file)
        if (payload.imageProvider === 'flow')
          await drawFlowItem(
            context,
            payload,
            item,
            directory,
            path,
            designDataUri,
          )
        else {
          const image = await drawItem(
            context,
            payload,
            apiKey!,
            item,
            references,
          )
          await writeFileAtomic(path, image.bytes)
        }
        const { mtimeMs } = await stat(path)
        Object.assign(drawn, { file, path, mtimeMs: Math.round(mtimeMs) })
        report(context, { ...drawn, status: 'completed' })
        return drawn
      } catch (error) {
        context.signal.throwIfAborted()
        const failure = toPipelineFailure(error)
        drawn.errorCode = failure.code
        report(context, { ...drawn, status: 'failed' })
        // La cuenta no puede pagar o no entra: repetir el encargo falla igual.
        if (isAccountFailure(failure)) throw failure
        context.emitter.emit({
          type: 'log',
          level: 'warn',
          message: `style clone ${prefix} ${item.index} failed (${failure.code}): ${failure.message}`,
        })
        return drawn
      }
    }),
  )
  context.signal.throwIfAborted()

  const failure = results.find((result) => result.status === 'rejected')
  if (failure?.status === 'rejected') throw failure.reason
  return {
    items: results.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    ),
  }
}

function isAccountFailure(failure: PipelineFailure): boolean {
  return (
    isInsufficientCreditsCode(failure.code) ||
    failure.code === 'image_invalid_api_key'
  )
}

function report(
  context: PipelineContext,
  detail: StyleCloneDrawProgressDetail,
): void {
  context.emitter.emit({
    type: 'progress',
    percent: detail.status === 'completed' ? 100 : 0,
    detail: { ...detail },
  })
}

// ── El pedido ──

function invalid(message: string): never {
  throw new PipelineFailure('invalid_payload', message)
}

function readPayload(value: unknown): StyleCloneDrawPayload {
  const payload = value as Partial<StyleCloneDrawPayload> | undefined
  assertValidCloneSessionId(payload?.sessionId)

  const { round, kind, imageProvider, items, character } = payload
  if (!Number.isInteger(round) || round! < 1 || round! > MAX_ROUND)
    invalid(`payload.round must be an integer between 1 and ${MAX_ROUND}`)
  if (kind !== 'designs' && kind !== 'scenes')
    invalid('payload.kind must be designs or scenes')
  if (
    imageProvider !== 'fal' &&
    imageProvider !== 'evolink' &&
    imageProvider !== 'flow'
  )
    invalid('payload.imageProvider must be fal, evolink, or flow')
  const executionPlan = assertFlowPlanProvider(
    payload.executionPlan,
    imageProvider,
  )
  if (imageProvider === 'flow' && !executionPlan)
    throw new PipelineFailure(
      'execution_plan_invalid',
      'Style clone Flow drawings require Multimagen',
    )
  if (
    !Array.isArray(items) ||
    items.length === 0 ||
    items.length > MAX_ITEMS[kind]
  )
    invalid(`payload.items must list 1 to ${MAX_ITEMS[kind]} ${kind}`)

  const seen = new Set<number>()
  for (const item of items) {
    if (
      !item ||
      !Number.isInteger(item.index) ||
      item.index < 1 ||
      item.index > MAX_ITEMS[kind] ||
      seen.has(item.index)
    )
      invalid(`payload.items carry a unique index from 1 to ${MAX_ITEMS[kind]}`)
    seen.add(item.index)
    if (
      typeof item.prompt !== 'string' ||
      !item.prompt.trim() ||
      item.prompt.length > DRAW_PROMPT_CHAR_LIMIT
    )
      invalid(
        `payload.items[].prompt must be a non-empty string of at most ${DRAW_PROMPT_CHAR_LIMIT} characters`,
      )
  }

  if (character !== undefined) {
    if (kind !== 'scenes')
      invalid('payload.character only applies to the scenes')
    assertCloneCharacter(character, 'payload.character')
  }

  return {
    sessionId: payload.sessionId,
    round: round!,
    kind,
    imageProvider,
    ...(executionPlan ? { executionPlan } : {}),
    items: items.map((item) => ({ ...item, prompt: item.prompt.trim() })),
    ...(character ? { character } : {}),
  }
}

// El personaje clonado tal como lo manda la app: lo validan igual el dibujo
// de las escenas y el guardado del estilo.
export function assertCloneCharacter(
  value: unknown,
  field: string,
): asserts value is StyleCloneCharacter {
  if (!value || typeof value !== 'object') invalid(`${field} must be an object`)
  const character = value as Partial<StyleCloneCharacter>
  if (character.travel !== 'text' && character.travel !== 'photo')
    invalid(`${field}.travel must be text or photo`)
  if (typeof character.name !== 'string' || character.name.length > NAME_LIMIT)
    invalid(
      `${field}.name must be a string of at most ${NAME_LIMIT} characters`,
    )
  if (
    typeof character.description !== 'string' ||
    !character.description.trim() ||
    character.description.length > MAX_WOVEN_IDENTITY_CHARS
  )
    invalid(
      `${field}.description must be a non-empty string of at most ${MAX_WOVEN_IDENTITY_CHARS} characters`,
    )
  assertValidCloneFile(character.designFile, `${field}.designFile`)
}

// ── El personaje ──

// El diseño elegido como data URI, solo si el personaje viaja «con foto». Si
// el archivo ya no está no se dibuja nada: mandar las escenas como texto
// mostraría otra cosa que la que eligió el usuario.
async function readDesign(
  directory: string,
  character: StyleCloneCharacter,
): Promise<string | undefined> {
  if (character.travel !== 'photo') return undefined

  const dataUri = await readImageAsDataUri(
    join(directory, character.designFile),
  )
  if (!dataUri)
    throw new PipelineFailure(
      'style_clone_file_missing',
      `the chosen design "${character.designFile}" is not in the session`,
    )
  return dataUri
}

// La referencia tal como la quiere cada proveedor: Fal recibe el data URI;
// Evolink, una URL pública que se sube UNA vez para toda la ronda. Vacío = las
// escenas llevan al personaje como texto (mismo degradado que las muestras).
async function referenceUrls(
  context: PipelineContext,
  provider: PaidImageProviderId,
  apiKey: string,
  designDataUri: string | undefined,
): Promise<string[]> {
  if (!designDataUri) return []
  if (provider === 'fal') return [designDataUri]

  const url = await uploadEvolinkReference(designDataUri, apiKey)
  context.signal.throwIfAborted()
  if (url) return [url]

  context.emitter.emit({
    type: 'log',
    level: 'warn',
    message:
      'the chosen design could not be uploaded: the scenes carry the character as text',
  })
  return []
}

// Cada tarjeta tiene su recibo: reintentar una de cuatro no cambia la lista
// del lote anterior. La ronda es la intención explícita de dibujar de nuevo;
// reabrir la misma sesión/tarjeta recupera incluso un resultado completado.
async function drawFlowItem(
  context: PipelineContext,
  payload: StyleCloneDrawPayload,
  item: StyleCloneDrawItem,
  directory: string,
  destination: string,
  designDataUri: string | undefined,
): Promise<void> {
  const character = payload.character
  const request: FlowImageRequest = {
    key: String(item.index),
    prompt: item.prompt,
    aspectRatio: '16:9',
    destination,
    previousHash: await imageFileHash(destination),
  }
  if (payload.kind === 'scenes') {
    if (!character) request.prompt = neutralizeSampleSubject(item.prompt)
    else if (character.travel === 'photo' && designDataUri) {
      request.prompt = buildCustomStyleReferencePrompt(
        character.name,
        pointSampleToReference(item.prompt, character.name),
      )
      request.references = [
        flowReference('character', character.name, designDataUri),
      ]
    } else
      request.prompt = weaveSampleIdentity(
        item.prompt,
        character.description,
        character.name,
      )
  }
  const scope = `style-clone:${payload.kind}:${payload.round}:${item.index}:${directory}`
  const existing = await readFlowBatch(context, scope)
  const requestId =
    existing?.regenerationRequestIds?.[0] ?? cloneRequestId(scope)
  const revision = flowHash(
    JSON.stringify([
      request.prompt,
      request.references?.map(({ id, name, sha256 }) => [id, name, sha256]),
      payload.character,
      payload.executionPlan,
    ]),
  )
  const isCurrent = async () => {
    if (!(await stat(directory).catch(() => null))?.isDirectory()) return false
    if (!character || character.travel !== 'photo') return true
    return (await readDesign(directory, character)) === designDataUri
  }
  const options: FlowBatchOptions = {
    scope,
    revision,
    requests: [request],
    executionPlan: payload.executionPlan,
    explicitRegenerationRequestId: requestId,
    onState(_request, status) {
      report(context, { index: item.index, status })
    },
    async restoreImported(saved) {
      return (
        saved.destination === destination &&
        !!saved.importedHash &&
        (await isCurrent()) &&
        (await imageFileHash(destination)) === saved.importedHash
      )
    },
    async onReady(saved, bytes) {
      if (saved.key !== request.key || saved.destination !== destination)
        throw new PipelineFailure(
          'flow_result_invalid',
          'Unexpected style clone destination',
        )
      return importFlowImage(context, {
        destination,
        bytes,
        previousHash: saved.previousHash ?? null,
        isCurrent,
      })
    },
  }
  try {
    await generateFlowBatch(context, options)
  } catch (error) {
    // Sólo un reintento de una tarjeta anterior con rechazo confirmado puede
    // abrir otro intento. Un envío incierto conserva IDs, foto y prompt. El
    // cliente revalida terminalidad bajo su lock antes de admitir el nuevo.
    if (
      !existing ||
      ![
        'flow_restart_required',
        'flow_accounts_exhausted',
        'flow_account_review_required',
      ].includes(toPipelineFailure(error).code)
    )
      throw error
    const snapshot = await flowCommand<FlowStatus>(context, { type: 'status' })
    if (
      snapshot.type !== 'bridge.status' ||
      !Array.isArray(snapshot.jobs) ||
      !canRestartFlowBatch(existing, snapshot)
    )
      throw error
    await generateFlowBatch(context, {
      ...options,
      terminalRetry: true,
      explicitRegenerationRequestId: cloneRequestId(
        `${scope}:${existing.batchId}`,
      ),
    })
  }
}

function cloneRequestId(identity: string): string {
  const hash = flowHash(identity)
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`
}

// ── Una prueba ──

async function drawItem(
  context: PipelineContext,
  payload: StyleCloneDrawPayload,
  apiKey: string,
  item: StyleCloneDrawItem,
  references: string[],
): Promise<DecodedImage> {
  const options = {
    apiKey,
    signal: context.signal,
    pollIntervalMs: POLL_INTERVAL_MS,
    onFailure: createProviderFailureReporter(context.emitter),
    onProgress(progress: { percent: number; status: string }) {
      // 100 se reserva para el archivo escrito, no para el CDN listo.
      context.emitter.emit({
        type: 'progress',
        percent: Math.min(99, progress.percent),
        detail: { index: item.index, status: progress.status },
      })
    },
  }
  const send: SendImage = (prompt, attached) => {
    const imageOptions = attached?.length
      ? { ...options, referenceImageUrls: attached }
      : options
    if (payload.imageProvider === 'fal')
      return generateFalImage(prompt, imageOptions)
    return generateEvolinkImage(prompt, imageOptions)
  }

  // Los diseños van tal cual: son el retrato del personaje, no una escena.
  if (payload.kind === 'designs') return softenOnRejection(item.prompt, send)

  const character = payload.character
  if (!character)
    return softenOnRejection(neutralizeSampleSubject(item.prompt), send)

  const asText = weaveSampleIdentity(
    item.prompt,
    character.description,
    character.name,
  )
  if (character.travel === 'text' || references.length === 0)
    return softenOnRejection(asText, send)

  try {
    return await send(
      buildCustomStyleReferencePrompt(
        character.name,
        pointSampleToReference(item.prompt, character.name),
      ),
      references,
    )
  } catch (error) {
    context.signal.throwIfAborted()
    if (isAccountFailure(toPipelineFailure(error))) throw error

    context.emitter.emit({
      type: 'log',
      level: 'warn',
      message: `style clone scene ${item.index} failed with the design as reference: retrying with the character as text`,
    })
    return softenOnRejection(asText, send)
  }
}

// Un rechazo por contenido se reintenta UNA vez con el prompt suavizado por
// el mapa de seguridad del video. Si el mapa no cambia nada, repetir el
// encargo solo repetiría el rechazo.
async function softenOnRejection(
  prompt: string,
  send: SendImage,
): Promise<DecodedImage> {
  try {
    return await send(prompt)
  } catch (error) {
    if (toPipelineFailure(error).code !== 'image_content_policy') throw error
    const softened = applySafetyReplacements(prompt)
    if (softened === prompt) throw error
    return send(softened)
  }
}

// ── El «Original» ──

// La imagen del material que recrea una escena. De un fotograma o de una
// imagen del usuario, ese mismo archivo; de una celda de un mosaico, la celda
// recortada. Un origen que el material no tiene queda sin original: nunca se
// muestra uno equivocado. La miniatura no es original de nada.
async function originalOf(
  context: PipelineContext,
  directory: string,
  material: StoredCloneMaterial,
  item: StyleCloneDrawItem,
  round: number,
): Promise<string | undefined> {
  const origin = item.origin
  if (!origin || typeof origin !== 'object') return undefined

  if (origin.kind === 'frame' || origin.kind === 'image') {
    if (!isPosition(origin.number)) return undefined
    const source = findMaterialItem(material, origin.kind, origin.number)
    return source ? join(directory, source.file) : undefined
  }
  if (origin.kind !== 'mosaic') return undefined

  try {
    return await cropMosaicCell(
      context,
      directory,
      material,
      origin,
      `original-r${round}-${item.index}.jpg`,
    )
  } catch (error) {
    context.signal.throwIfAborted()
    context.emitter.emit({
      type: 'log',
      level: 'warn',
      message: `the original of style clone scene ${item.index} could not be cropped: ${toPipelineFailure(error).message}`,
    })
    return undefined
  }
}

const isPosition = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 1

async function cropMosaicCell(
  context: PipelineContext,
  directory: string,
  material: StoredCloneMaterial,
  origin: Extract<StyleCloneOrigin, { kind: 'mosaic' }>,
  file: string,
): Promise<string | undefined> {
  if (
    !isPosition(origin.mosaic) ||
    !isPosition(origin.row) ||
    !isPosition(origin.column)
  )
    return undefined
  const mosaic = findMaterialItem(material, 'mosaic', origin.mosaic)
  const rows = mosaic?.rows ?? 0
  const columns = mosaic?.columns ?? 0
  if (!mosaic || origin.row > rows || origin.column > columns) return undefined

  const mosaicPath = join(directory, mosaic.file)
  const size = jpegSize(await readFile(mosaicPath))
  if (!size) return undefined
  const cellWidth = Math.floor(size.width / columns)
  const cellHeight = Math.floor(size.height / rows)

  const path = join(directory, file)
  await runFfmpeg(
    requireFfmpegPath(context.job.binaryPaths.ffmpeg),
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      mosaicPath,
      '-vf',
      `crop=${cellWidth}:${cellHeight}:${(origin.column - 1) * cellWidth}:${(origin.row - 1) * cellHeight}`,
      '-frames:v',
      '1',
      '-q:v',
      '2',
      path,
    ],
    { signal: context.signal },
  )
  return path
}
