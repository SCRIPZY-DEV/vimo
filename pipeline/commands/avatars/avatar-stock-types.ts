import { dirname, join } from 'node:path'

import type { HeyGenClient } from '../../providers/avatar/heygen.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { toPipelineFailure } from '../../runner/failure.ts'
import {
  STOCK_TYPES_CACHE_FILE,
  STOCK_TYPES_CACHE_TTL_MS,
  STOCK_TYPES_MAX_PAGES,
} from '../../types/avatar.ts'
import type {
  AvatarLookType,
  AvatarStockTypesPayload,
  AvatarStockTypesResult,
} from '../../types/avatar.ts'
import {
  ensureDirectory,
  readTextWithRetry,
  writeFileAtomic,
} from '../../utils/atomic-fs.ts'
import { avatarsRoot } from './avatar-library.ts'
import { requireHeyGenClient } from './heygen-client.ts'

// Forma de `.stock-types.json`: un archivo con otra versión se ignora, como si
// no existiera, y se vuelve a barrer.
const STOCK_TYPES_CACHE_VERSION = 1

// Lo que se guarda en `.stock-types.json`. Los ids son de grupo de HeyGen,
// ordenados y sin repetir; el resultado del comando es lo mismo sin `version`.
interface StockTypesCache {
  version: typeof STOCK_TYPES_CACHE_VERSION
  fetchedAt: string
  studioGroupIds: string[]
  twinGroupIds: string[]
  truncated: boolean
}

// Los grupos de un tipo de look y si la barrida se cortó con páginas por leer.
interface TypeSweep {
  groupIds: string[]
  truncated: boolean
}

function isGroupIdList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((id) => typeof id === 'string' && id.length > 0)
  )
}

// Que no haya archivo (o ni siquiera carpeta) es lo normal antes de la primera
// barrida: no es un problema.
function isMissingFile(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code
  return code === 'ENOENT' || code === 'ENOTDIR'
}

// La caché que hay en disco, o null si no existe o no sirve. Un archivo que
// existe pero no sirve (no se puede leer, no es JSON, es de otra versión, tiene
// una fecha que no es fecha o listas que no son de ids) vale como si no
// existiera, pero avisa una vez, con el motivo y sin la ruta del usuario; que no
// exista no avisa. Una fecha futura sí es una fecha: la caché se lee, solo que
// `isFresh` no la da por vigente. La fecha se normaliza a ISO 8601, que es lo
// que promete el resultado.
async function readCache(
  context: PipelineContext,
  cachePath: string,
): Promise<StockTypesCache | null> {
  const ignore = (reason: string): null => {
    context.emitter.emit({
      type: 'log',
      level: 'warn',
      message: `stock types cache ignored: ${reason}`,
    })
    return null
  }

  let text: string
  try {
    text = await readTextWithRetry(cachePath)
  } catch (error) {
    if (isMissingFile(error)) return null

    return ignore(`could not be read (${reasonOf(error)})`)
  }

  let file: unknown
  try {
    file = JSON.parse(text)
  } catch {
    return ignore('not valid JSON')
  }

  if (typeof file !== 'object' || file === null || Array.isArray(file))
    return ignore('not a JSON object')

  const fields = file as Partial<Record<keyof StockTypesCache, unknown>>
  if (fields.version !== STOCK_TYPES_CACHE_VERSION)
    return ignore('unsupported version')

  const fetchedAtMs =
    typeof fields.fetchedAt === 'string'
      ? Date.parse(fields.fetchedAt)
      : Number.NaN
  if (!Number.isFinite(fetchedAtMs)) return ignore('invalid fetchedAt')

  if (
    !isGroupIdList(fields.studioGroupIds) ||
    !isGroupIdList(fields.twinGroupIds)
  )
    return ignore('invalid group ids')

  if (typeof fields.truncated !== 'boolean')
    return ignore('invalid truncated flag')

  return {
    version: STOCK_TYPES_CACHE_VERSION,
    fetchedAt: new Date(fetchedAtMs).toISOString(),
    studioGroupIds: fields.studioGroupIds,
    twinGroupIds: fields.twinGroupIds,
    truncated: fields.truncated,
  }
}

// Vigente = se escribió hace menos de 24 h. Una fecha futura (reloj atrasado o
// archivo editado a mano) no es vigente: si lo fuera, nunca vencería.
function isFresh(cache: StockTypesCache): boolean {
  const ageMs = Date.now() - Date.parse(cache.fetchedAt)
  return ageMs >= 0 && ageMs < STOCK_TYPES_CACHE_TTL_MS
}

// Una barrida que terminó sin ningún grupo de ningún tipo y sin llegar al tope
// de páginas casi seguro es un `data: []` pasajero de HeyGen, no un stock
// vacío: guardarla dejaría los filtros vacíos un día entero. Si el tope la
// cortó (`truncated`), HeyGen sí devolvió páginas de looks: no entra acá.
function isEmptySweep(cache: StockTypesCache): boolean {
  return (
    cache.studioGroupIds.length === 0 &&
    cache.twinGroupIds.length === 0 &&
    !cache.truncated
  )
}

function resultOf(
  cache: StockTypesCache,
  fromCache: boolean,
): AvatarStockTypesResult {
  return {
    studioGroupIds: cache.studioGroupIds,
    twinGroupIds: cache.twinGroupIds,
    fetchedAt: cache.fetchedAt,
    fromCache,
    truncated: cache.truncated,
  }
}

// Recorre los looks públicos de un tipo, página a página, y se queda con el
// grupo de cada uno (un look sin grupo no sirve para clasificar). Corta en
// STOCK_TYPES_MAX_PAGES páginas: si HeyGen tenía más, la lista es parcial.
async function sweepLookType(
  client: HeyGenClient,
  lookType: AvatarLookType,
): Promise<TypeSweep> {
  const groupIds = new Set<string>()
  let token: string | undefined
  let truncated = true

  for (let page = 0; page < STOCK_TYPES_MAX_PAGES; page++) {
    const result = await client.listLooks({
      ownership: 'public',
      lookType,
      token,
    })
    for (const look of result.looks) {
      if (look.groupId) groupIds.add(look.groupId)
    }

    if (result.nextToken === null) {
      truncated = false
      break
    }

    token = result.nextToken
  }

  // Orden de bytes (`sort()` sin comparador), no el de `localeCompare`.
  return { groupIds: [...groupIds].sort(), truncated }
}

// Los dos recorridos en paralelo: estudio y gemelos digitales. Los demás grupos
// del stock son avatares de foto y no necesitan recorrido propio.
async function sweepPublicStock(
  client: HeyGenClient,
): Promise<StockTypesCache> {
  const [studio, twin] = await Promise.all([
    sweepLookType(client, 'studio_avatar'),
    sweepLookType(client, 'digital_twin'),
  ])

  return {
    version: STOCK_TYPES_CACHE_VERSION,
    fetchedAt: new Date().toISOString(),
    studioGroupIds: studio.groupIds,
    twinGroupIds: twin.groupIds,
    truncated: studio.truncated || twin.truncated,
  }
}

// El motivo de un fallo para el log: el código de errno si lo hay (sin la ruta
// del mensaje del sistema), o el mensaje.
function reasonOf(error: unknown): string {
  const code = (error as NodeJS.ErrnoException | undefined)?.code
  if (typeof code === 'string') return code

  return error instanceof Error ? error.message : String(error)
}

// La caché es un atajo, no un dato del usuario: si no se puede escribir, el
// comando avisa y devuelve igual lo que acaba de leer de HeyGen.
async function writeCache(
  context: PipelineContext,
  cachePath: string,
  cache: StockTypesCache,
): Promise<void> {
  try {
    await ensureDirectory(dirname(cachePath))
    await writeFileAtomic(cachePath, JSON.stringify(cache))
  } catch (error) {
    context.emitter.emit({
      type: 'log',
      level: 'warn',
      message: `stock types cache could not be written: ${reasonOf(error)}`,
    })
  }
}

// Qué avatares públicos de HeyGen son de estudio y cuáles gemelos digitales
// (entrega 2b, diseño §18). El listado de grupos no trae el tipo, así que se
// barren los looks públicos por `avatar_type` (gratis, ~45 pedidos, ~20 s) y se
// guarda el resultado 24 h en `<projectsRoot>/avatars/.stock-types.json`.
//
// - Una caché vigente se devuelve sin tocar HeyGen y sin pedir la clave. Un
//   archivo que existe pero no sirve (ilegible, de otra versión, con una fecha
//   inválida o con listas que no son de ids) se trata como si no existiera y
//   avisa una vez. Una fecha futura no es vigente (se vuelve a barrer), pero la
//   caché se lee y sigue sirviendo de respaldo si HeyGen falla.
// - `refresh: true` (booleano estricto) ignora la caché y vuelve a barrer.
// - Si la barrida falla y hay una caché legible (vencida, futura, o vigente
//   pero saltada por `refresh`), se devuelve esa con `fromCache: true` y un
//   aviso con el código del fallo; sin caché, el fallo sale tal cual. Una
//   cancelación sale siempre tal cual, con o sin caché.
// - Al fallar un recorrido, el otro deja de pedir páginas: sin eso seguiría
//   hasta 80 páginas con el job ya terminado y el proceso vivo.
// - Una barrida sin ningún grupo (y sin truncar) no se guarda y avisa. Con una
//   caché legible se devuelve esa (`fromCache: true`) en vez de la lista vacía,
//   y no se la pisa; sin caché se devuelve lo barrido, así que la siguiente
//   llamada vuelve a barrer. Una caché vacía que ya existe y es válida se
//   sigue sirviendo.
// - Una escritura de la caché que falla solo avisa.
export async function avatarStockTypes(
  context: PipelineContext,
): Promise<AvatarStockTypesResult> {
  const payload = context.job.payload as AvatarStockTypesPayload | undefined
  const refresh = payload?.refresh === true
  const cachePath = join(avatarsRoot(context), STOCK_TYPES_CACHE_FILE)

  const cached = await readCache(context, cachePath)
  if (cached && !refresh && isFresh(cached)) return resultOf(cached, true)

  const abortSweeps = new AbortController()
  const client = requireHeyGenClient({
    ...context,
    // `AbortSignal.any` exige Node ≥ 20.3: el sidecar lo cumple porque está
    // fijado a Node 22 (`scripts/build-sidecar.mjs`). Quien baje ese pin tiene
    // que revisar esta línea.
    signal: AbortSignal.any([context.signal, abortSweeps.signal]),
  })

  let swept: StockTypesCache
  try {
    swept = await sweepPublicStock(client)
  } catch (error) {
    abortSweeps.abort()
    if (context.signal.aborted || !cached) throw error

    context.emitter.emit({
      type: 'log',
      level: 'warn',
      message: `stock types sweep failed (${toPipelineFailure(error).code}), serving the cache from ${cached.fetchedAt}`,
    })
    return resultOf(cached, true)
  }

  if (isEmptySweep(swept)) {
    context.emitter.emit({
      type: 'log',
      level: 'warn',
      message: 'stock types sweep returned no groups; not cached',
    })
    if (cached) return resultOf(cached, true)

    return resultOf(swept, false)
  }

  await writeCache(context, cachePath, swept)

  return resultOf(swept, false)
}
