import { createHash } from 'node:crypto'
import { join } from 'node:path'

import type { HeyGenClient } from '../../providers/avatar/heygen.ts'
import { HEYGEN_PROVIDER } from '../../providers/avatar/heygen-errors.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import {
  AVATAR_ASPECT_RATIOS,
  AVATAR_NAME_LIMIT,
  AVATAR_PROMPT_LIMIT,
  AVATAR_REFERENCE_IMAGES_MAX,
} from '../../types/avatar.ts'
import type {
  AvatarAspectRatio,
  AvatarGenerateLookPayload,
  AvatarGenerateLookResult,
  AvatarOrientation,
  HeyGenLook,
} from '../../types/avatar.ts'
import type { DecodedImage } from '../../types/images.ts'
import {
  assertValidAvatarId,
  avatarsRoot,
  readAvatarPhoto,
  requireAvatarMetadata,
  storedLookOf,
  toAvatarSummary,
  updateAvatarMetadata,
  writeLookPreviewFile,
} from './avatar-library.ts'
import type { StoredAvatarMetadata } from './avatar-library.ts'
import { downloadPreview, listGroupLooks } from './avatar-looks.ts'
import { requireHeyGenClient } from './heygen-client.ts'

// La orientación del look según el formato en que se pidió, para cuando HeyGen
// no la informa (`preferred_orientation` es opcional en su OpenAPI): sin ella,
// Crear no ofrece el look y la persona habría pagado un escenario que no puede
// usar. Solo los formatos de orientación inequívoca: los dos de los videos
// (16:9 y 9:16) y el cuadrado. Con 4:5, 5:4 o `auto` (HeyGen elige) queda
// desconocida, como hasta ahora. Lo que HeyGen informe, hoy o en un refresco,
// manda sobre esto (avatar-refresh.ts conserva la guardada si no informa nada).
const ORIENTATION_BY_ASPECT_RATIO: Readonly<
  Partial<Record<AvatarAspectRatio, AvatarOrientation>>
> = {
  '16:9': 'landscape',
  '9:16': 'portrait',
  '1:1': 'square',
}

// Un pedido de look ya validado.
interface LookRequest {
  id: string
  prompt: string
  aspectRatio: AvatarAspectRatio
  referencePaths: string[]
  name: string
}

// La metadata con el look generado ya registrado, y cuál es.
interface LookRegistration {
  metadata: StoredAvatarMetadata
  look: HeyGenLook
}

// Mismo avatar, look principal, prompt, formato y referencias → misma clave:
// si la respuesta del POST se perdió, repetir no genera (ni cobra) otro look;
// HeyGen repite la respuesta original durante 24 h. El principal entra porque
// es la referencia visual: con otro principal, el mismo prompt pide otro look.
// El nombre del look no entra. Solo caracteres que HeyGen admite.
export function lookIdempotencyKey(
  id: string,
  mainLookId: string,
  prompt: string,
  aspectRatio: AvatarAspectRatio,
  references: Buffer[],
): string {
  const referenceHashes = references.map((bytes) =>
    createHash('sha256').update(bytes).digest('hex'),
  )
  const digest = createHash('sha256')
    .update(
      [id, mainLookId, prompt, aspectRatio, ...referenceHashes].join('\n'),
    )
    .digest('hex')
    .slice(0, 32)
  return `vimo-avatar-look-${digest}`
}

function invalidPayload(message: string): PipelineFailure {
  return new PipelineFailure('invalid_payload', message)
}

// El payload viene del webview: se valida entero antes de leer nada.
function readLookRequest(
  payload: Partial<AvatarGenerateLookPayload> | undefined,
): LookRequest {
  const id = typeof payload?.id === 'string' ? payload.id : ''
  if (!id) throw invalidPayload('payload.id is required')
  assertValidAvatarId(id)

  const prompt =
    typeof payload?.prompt === 'string' ? payload.prompt.trim() : ''
  if (!prompt || prompt.length > AVATAR_PROMPT_LIMIT)
    throw invalidPayload(
      `payload.prompt must have between 1 and ${AVATAR_PROMPT_LIMIT} characters`,
    )

  const aspectRatio = AVATAR_ASPECT_RATIOS.find(
    (ratio) => ratio === payload?.aspectRatio,
  )
  if (!aspectRatio)
    throw invalidPayload('payload.aspectRatio is not a known aspect ratio')

  const paths = payload?.referenceImagePaths ?? []
  if (!Array.isArray(paths) || paths.length > AVATAR_REFERENCE_IMAGES_MAX)
    throw invalidPayload(
      `payload.referenceImagePaths takes up to ${AVATAR_REFERENCE_IMAGES_MAX} paths`,
    )
  const referencePaths = paths.map((path) =>
    typeof path === 'string' ? path.trim() : '',
  )
  if (referencePaths.some((path) => !path))
    throw invalidPayload('payload.referenceImagePaths must be file paths')

  const name =
    typeof payload?.name === 'string'
      ? payload.name.trim().slice(0, AVATAR_NAME_LIMIT)
      : ''
  return { id, prompt, aspectRatio, referencePaths, name }
}

// `<avatar> · <n>`, con n la cantidad de looks que va a tener el avatar.
function defaultLookName(metadata: StoredAvatarMetadata): string {
  const suffix = ` · ${metadata.looks.length + 1}`
  return `${metadata.name.slice(0, AVATAR_NAME_LIMIT - suffix.length)}${suffix}`
}

// HeyGen aceptó (y cobró) el look, respondió sin él y el grupo todavía no
// muestra ninguno nuevo: la creación es asíncrona, o es la repetición
// idempotente de un pedido cuyo look ya se registró. Código propio y no
// `avatar_provider_error`: la UI lo vuelve a buscar con un refresco del avatar.
function lookNotListed(): PipelineFailure {
  return new PipelineFailure(
    'avatar_look_not_listed',
    'HeyGen accepted the look generation but its group lists no new look yet',
    { provider: HEYGEN_PROVIDER },
  )
}

// El look generado con la orientación del formato pedido si HeyGen no trae la
// suya; la de HeyGen, si la trae, queda tal cual.
function withRequestedOrientation(
  look: HeyGenLook,
  orientation: AvatarOrientation | undefined,
): HeyGenLook {
  if (look.preferredOrientation || !orientation) return look

  return { ...look, preferredOrientation: orientation }
}

// El look que devolvió HeyGen (función pura sobre la metadata releída):
// primero y en proceso, salvo que ya venga con su estado, y con la orientación
// del formato pedido si HeyGen no informa una. Repetir el mismo pedido
// devuelve el mismo look: no se duplica.
function withGeneratedLook(
  current: StoredAvatarMetadata,
  look: HeyGenLook,
  now: string,
  orientation: AvatarOrientation | undefined,
): LookRegistration {
  if (current.looks.some((known) => known.lookId === look.lookId))
    return { metadata: current, look }

  const generated = withRequestedOrientation(look, orientation)
  const looks = [
    storedLookOf(generated, 'vimo', now, 'processing'),
    ...current.looks,
  ]
  return { metadata: { ...current, looks }, look: generated }
}

// HeyGen aceptó (y cobró) el look pero respondió solo con el grupo
// (`avatar_item` es nulable y la creación, asíncrona). Función pura: entre los
// looks del grupo, los que la biblioteca no conoce. Uno solo es el generado
// (de Vimo, primero, en proceso si HeyGen no trae su estado, con la
// orientación pedida si no trae la suya); con varios no se sabe cuál es, así
// que se suman todos como looks del grupo (son de este avatar), sin suponerles
// orientación, y el generado es el primero del listado; sin ninguno,
// `avatar_look_not_listed` y nada se escribe.
function withRecoveredLooks(
  current: StoredAvatarMetadata,
  listed: HeyGenLook[],
  now: string,
  orientation: AvatarOrientation | undefined,
): LookRegistration {
  const fresh = listed.filter(
    (look) => !current.looks.some((known) => known.lookId === look.lookId),
  )
  const [first] = fresh
  if (!first) throw lookNotListed()

  if (fresh.length === 1)
    return withGeneratedLook(current, first, now, orientation)

  const added = fresh.map((look) => storedLookOf(look, 'heygen', now))
  return {
    metadata: { ...current, looks: [...current.looks, ...added] },
    look: first,
  }
}

// Los looks del grupo, para recuperar un look pagado que HeyGen no devolvió
// (la lectura es gratis). Si no se pueden leer, el resultado es el de no
// encontrar ninguno nuevo; una cancelación sale como tal.
async function groupLooksAfterPayment(
  context: PipelineContext,
  client: HeyGenClient,
  id: string,
  stored: StoredAvatarMetadata,
): Promise<HeyGenLook[]> {
  try {
    return await listGroupLooks(client, stored.groupId, stored.ownership)
  } catch (error) {
    if (context.signal.aborted) throw error
    context.emitter.emit({
      type: 'log',
      level: 'warn',
      message: `avatar ${id}: HeyGen returned no look and the group's looks could not be read`,
    })
    return []
  }
}

// Genera un look nuevo de un avatar desde un prompt («Crear escenario»):
// HeyGen lo crea a partir del look principal, con imágenes de referencia
// opcionales, y lo guarda en el grupo del avatar. Lo que no cuesta y puede
// fallar (el payload, las referencias, la carpeta raíz, el avatar y su look
// principal, la clave) se comprueba ANTES de subir nada ni de pagar. El look
// nace «processing» y primero en la lista, con la orientación del formato
// pedido si HeyGen no informa la suya (Crear elige looks por orientación);
// `avatar-refresh` lo ve terminar.
// Lo pagado se guarda primero: la vista previa de un look que llega listo se
// baja después de registrarlo, y si HeyGen responde solo con el grupo, el
// look se busca entre los del grupo (un solo `POST` siempre); si todavía no
// está, `avatar_look_not_listed`.
export async function avatarGenerateLook(
  context: PipelineContext,
): Promise<AvatarGenerateLookResult> {
  const request = readLookRequest(
    context.job.payload as Partial<AvatarGenerateLookPayload> | undefined,
  )
  // Misma regla que la foto de un avatar: JPEG o PNG de hasta 12 MB.
  const references: DecodedImage[] = []
  for (const path of request.referencePaths)
    references.push(await readAvatarPhoto(path))

  const entryDirectory = join(avatarsRoot(context), request.id)
  const stored = await requireAvatarMetadata(entryDirectory, request.id)
  const main = stored.looks.find((look) => look.lookId === stored.mainLookId)
  // Código propio y no `avatar_invalid_request`: acá todavía no se habló con
  // HeyGen, así que la UI no puede decir que «HeyGen respondió algo raro».
  if (main?.status !== 'ready')
    throw new PipelineFailure(
      'avatar_main_look_not_ready',
      `avatar "${request.id}" has no ready main look to generate from`,
    )

  const client = requireHeyGenClient(context)
  const referenceAssetIds: string[] = []
  for (const [index, image] of references.entries())
    referenceAssetIds.push(
      await client.uploadAsset(
        image.bytes,
        `reference-${index + 1}.${image.ext}`,
        image.mime,
      ),
    )

  const created = await client.createPromptLook({
    name: request.name || defaultLookName(stored),
    prompt: request.prompt,
    avatarId: main.lookId,
    groupId: stored.groupId,
    referenceAssetIds,
    aspectRatio: request.aspectRatio,
    idempotencyKey: lookIdempotencyKey(
      request.id,
      main.lookId,
      request.prompt,
      request.aspectRatio,
      references.map((image) => image.bytes),
    ),
  })
  // Sin `avatar_item` el look igual está pagado: se busca entre los del grupo.
  const listed = created.look
    ? []
    : await groupLooksAfterPayment(context, client, request.id, stored)

  // El look ya está pagado: se registra antes que nada. Una descarga lenta (o
  // cancelada) de su vista previa no puede dejarlo sin guardar. El cambio
  // puro fija cuál es el look generado (o falla sin escribir nada).
  const now = new Date().toISOString()
  const orientation = ORIENTATION_BY_ASPECT_RATIO[request.aspectRatio]
  let generated: HeyGenLook | undefined
  const next = await updateAvatarMetadata(
    entryDirectory,
    request.id,
    (current) => {
      const registration = created.look
        ? withGeneratedLook(current, created.look, now, orientation)
        : withRecoveredLooks(current, listed, now, orientation)
      generated = registration.look
      return registration.metadata
    },
  )
  const look = generated
  if (!look) throw lookNotListed()

  // Si HeyGen lo devuelve ya listo, su vista previa se baja ahora: el sondeo
  // solo refresca mientras algo procesa. Después de registrarlo y fuera de la
  // ventana de relectura (best-effort: un fallo solo avisa; la vista previa se
  // deriva al listar). Solo si el avatar sigue en la biblioteca: no se rehace
  // la carpeta de uno que se borró mientras tanto.
  if (look.status === 'ready') {
    const image = await downloadPreview(
      context,
      request.id,
      look.previewImageUrl,
      `preview of look ${look.lookId}`,
    )
    if (image) {
      await requireAvatarMetadata(entryDirectory, request.id)
      await writeLookPreviewFile(entryDirectory, look.lookId, image)
    }
  }

  return {
    entry: await toAvatarSummary(entryDirectory, request.id, next),
    lookId: look.lookId,
  }
}
