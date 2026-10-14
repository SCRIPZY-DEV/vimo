import { join } from 'node:path'

import type { HeyGenClient } from '../../providers/avatar/heygen.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type {
  AvatarRefreshPayload,
  AvatarRefreshResult,
  HeyGenAvatarGroup,
  HeyGenLook,
} from '../../types/avatar.ts'
import {
  AVATAR_GROUP_MISSING_CODE,
  assertValidAvatarId,
  avatarStatusOf,
  avatarsRoot,
  cardLookIds,
  lookIdsWithPreview,
  pickMainLookId,
  requireAvatarMetadata,
  storedLookOf,
  toAvatarSummary,
  updateAvatarMetadata,
  writeLookPreviewFile,
} from './avatar-library.ts'
import type {
  StoredAvatarLook,
  StoredAvatarMetadata,
} from './avatar-library.ts'
import {
  downloadLookPreviews,
  listGroupLooks,
  previewTargetsOf,
  previewUrlsOf,
} from './avatar-looks.ts'
import type { LookPreviewTarget } from './avatar-looks.ts'
import { requireHeyGenClient } from './heygen-client.ts'

// Looks que no vinieron en el listado del grupo y se consultan uno por uno,
// hasta este tope por refresco (el resto, en el siguiente). HeyGen puede no
// listar un look donde Vimo lo espera, por ejemplo uno generado sobre un
// avatar de stock, que es privado y no aparece entre los públicos.
const MISSING_LOOK_LOOKUPS_MAX = 6
// Vistas previas que baja un refresco como máximo.
const REFRESH_DOWNLOADS_MAX = 6

// Los looks que el listado no trajo y conviene consultar por id, en este orden:
// el principal (un listado incompleto no lo cambia por otro sin que HeyGen
// confirme que ya no existe), los que procesaban (para saber cómo terminaron)
// y los de Vimo listos sin vista previa en disco (para tener su URL: uno
// generado sobre un avatar de stock nunca viene en el listado público).
function lookupCandidates(
  metadata: StoredAvatarMetadata,
  listed: HeyGenLook[],
  local: Set<string>,
): string[] {
  const absent = metadata.looks.filter(
    (look) => !listed.some((fresh) => fresh.lookId === look.lookId),
  )
  const main = absent.filter((look) => look.lookId === metadata.mainLookId)
  const processing = absent.filter((look) => look.status === 'processing')
  const vimoWithoutPreview = absent.filter(
    (look) =>
      look.origin === 'vimo' &&
      look.status === 'ready' &&
      !local.has(look.lookId),
  )
  const lookIds = [...main, ...processing, ...vimoWithoutPreview].map(
    (look) => look.lookId,
  )

  return [...new Set(lookIds)].slice(0, MISSING_LOOK_LOOKUPS_MAX)
}

// Lo que HeyGen responde de esos looks: el look, null si ya no existe (404), o
// nada si no se pudo saber (queda como estaba).
async function lookUpLooks(
  context: PipelineContext,
  client: HeyGenClient,
  lookIds: string[],
): Promise<Map<string, HeyGenLook | null>> {
  const results = new Map<string, HeyGenLook | null>()
  await Promise.all(
    lookIds.map(async (lookId) => {
      try {
        results.set(lookId, await client.getLook(lookId))
      } catch (error) {
        if (context.signal.aborted) throw error
        if (error instanceof PipelineFailure && error.httpStatus === 404)
          results.set(lookId, null)
      }
    }),
  )
  return results
}

// Un look guardado con lo que HeyGen dice hoy: nombre, tipo, estado y motores
// (una lista vacía no borra los que se conocían). El origen y la fecha quedan,
// y también la orientación si HeyGen no informa una: la de un look generado
// desde Vimo sale del formato pedido (avatar-generate-look.ts), y sin ella
// Crear dejaría de ofrecerlo.
function refreshedLook(
  look: StoredAvatarLook,
  fresh: HeyGenLook,
): StoredAvatarLook {
  const next: StoredAvatarLook = {
    ...look,
    name: fresh.name,
    lookType: fresh.lookType,
    supportedEngines:
      fresh.supportedEngines.length > 0
        ? [...fresh.supportedEngines]
        : look.supportedEngines,
    status: fresh.status ?? 'ready',
  }
  if (fresh.preferredOrientation)
    next.preferredOrientation = fresh.preferredOrientation
  return next
}

// La metadata con el grupo releído (función pura: se aplica sobre la versión
// que está en disco justo antes de escribir). Los looks conocidos se
// actualizan; los nuevos del grupo se suman al final como venidos de HeyGen; uno
// que HeyGen confirmó que ya no existe (404) se va; uno que el listado no trajo
// y no se pudo confirmar se va solo si es de HeyGen, estaba listo o fallido y
// no es el principal. Un listado vacío de un avatar que dice tener looks no se
// cree: no saca a nadie. El principal y el estado se recalculan.
function refreshedMetadata(
  current: StoredAvatarMetadata,
  group: HeyGenAvatarGroup,
  listed: HeyGenLook[],
  lookups: Map<string, HeyGenLook | null>,
  now: string,
): StoredAvatarMetadata {
  const listingTrusted = listed.length > 0 || group.looksCount === 0
  const looks: StoredAvatarLook[] = []
  for (const look of current.looks) {
    const fresh =
      listed.find((candidate) => candidate.lookId === look.lookId) ??
      lookups.get(look.lookId)
    if (fresh === null) continue
    if (fresh) {
      looks.push(refreshedLook(look, fresh))
      continue
    }

    const keep =
      !listingTrusted ||
      look.origin === 'vimo' ||
      look.status === 'processing' ||
      look.lookId === current.mainLookId
    if (keep) looks.push(look)
  }
  for (const look of listed)
    if (!current.looks.some((known) => known.lookId === look.lookId))
      looks.push(storedLookOf(look, 'heygen', now))

  const mainLookId = pickMainLookId(looks, current.mainLookId)
  const { status, errorCode } = avatarStatusOf(looks, mainLookId, group.status)
  const next: StoredAvatarMetadata = {
    ...current,
    looks,
    mainLookId,
    status,
    syncedAt: now,
  }
  if (errorCode) next.errorCode = errorCode
  else delete next.errorCode
  if (group.gender) next.gender = group.gender

  return next
}

// Las vistas previas que faltan en disco: las de la tarjeta (el principal y
// los que se muestran a su lado) y las de cada look de Vimo que ya está listo,
// hasta REFRESH_DOWNLOADS_MAX.
function missingPreviews(
  metadata: StoredAvatarMetadata,
  urls: Map<string, string>,
  local: Set<string>,
): LookPreviewTarget[] {
  const card = cardLookIds(
    metadata.looks,
    metadata.mainLookId,
    (lookId) => local.has(lookId) || urls.has(lookId),
  )
  const vimoReady = metadata.looks
    .filter((look) => look.origin === 'vimo' && look.status === 'ready')
    .map((look) => look.lookId)
  const wanted = [...new Set([...card, ...vimoReady])].filter(
    (lookId) => !local.has(lookId),
  )

  return previewTargetsOf(wanted, urls).slice(0, REFRESH_DOWNLOADS_MAX)
}

// El grupo del avatar, o null si HeyGen ya no lo tiene (404 de `getGroup`,
// que el cliente traduce a `avatar_not_found`). Cualquier otro fallo sale.
async function groupOrMissing(
  client: HeyGenClient,
  groupId: string,
): Promise<HeyGenAvatarGroup | null> {
  try {
    return await client.getGroup(groupId)
  } catch (error) {
    if (error instanceof PipelineFailure && error.code === 'avatar_not_found')
      return null
    throw error
  }
}

// El avatar cuyo grupo ya no existe en HeyGen (función pura): fallido con su
// código, y lo que procesaba (el entrenamiento o un look generado) ya no va a
// terminar.
function groupMissingMetadata(
  current: StoredAvatarMetadata,
  now: string,
): StoredAvatarMetadata {
  const looks = current.looks.map((look): StoredAvatarLook => {
    if (look.status !== 'processing') return look

    return { ...look, status: 'failed' }
  })
  return {
    ...current,
    looks,
    status: 'failed',
    errorCode: AVATAR_GROUP_MISSING_CODE,
    syncedAt: now,
  }
}

// Relee de HeyGen el avatar (su grupo) y sus looks: estado del entrenamiento,
// looks nuevos, looks generados que terminaron, el principal si desapareció, y
// las vistas previas que faltan. Un grupo que HeyGen ya no tiene no es un
// error del refresco: el avatar queda `failed` con `avatar_group_missing` y se
// devuelve, así la tarjeta lo dice y el sondeo deja de preguntar (ya no
// procesa). `avatar_not_found` queda para un id que no está en la biblioteca.
export async function avatarRefresh(
  context: PipelineContext,
): Promise<AvatarRefreshResult> {
  const payload = context.job.payload as AvatarRefreshPayload | undefined
  if (!payload?.id)
    throw new PipelineFailure('invalid_payload', 'payload.id is required')
  assertValidAvatarId(payload.id)
  const id = payload.id

  const entryDirectory = join(avatarsRoot(context), id)
  const stored = await requireAvatarMetadata(entryDirectory, id)

  const client = requireHeyGenClient(context)
  const group = await groupOrMissing(client, stored.groupId)
  if (!group) {
    const missingAt = new Date().toISOString()
    const next = await updateAvatarMetadata(entryDirectory, id, (current) =>
      groupMissingMetadata(current, missingAt),
    )
    return { entry: await toAvatarSummary(entryDirectory, id, next) }
  }

  const listed = await listGroupLooks(client, stored.groupId, stored.ownership)
  const local = await lookIdsWithPreview(entryDirectory)
  const lookups = await lookUpLooks(
    context,
    client,
    lookupCandidates(stored, listed, local),
  )

  const now = new Date().toISOString()
  const found = [...lookups.values()].filter(
    (look): look is HeyGenLook => look !== null,
  )
  const urls = previewUrlsOf([...listed, ...found])
  const planned = refreshedMetadata(stored, group, listed, lookups, now)
  const previews = await downloadLookPreviews(
    context,
    id,
    missingPreviews(planned, urls, local),
  )

  // Las vistas previas se escriben ANTES de releer la metadata, así entre la
  // relectura y la escritura no hay E/S y un look que otra generación guarda
  // en ese hueco no se pisa. Solo si el avatar sigue en la biblioteca: no se
  // rehace la carpeta de uno que se borró mientras tanto.
  if (previews.size > 0) {
    await requireAvatarMetadata(entryDirectory, id)
    for (const [lookId, image] of previews)
      await writeLookPreviewFile(entryDirectory, lookId, image)
  }

  const next = await updateAvatarMetadata(entryDirectory, id, (current) =>
    refreshedMetadata(current, group, listed, lookups, now),
  )

  return { entry: await toAvatarSummary(entryDirectory, id, next) }
}
