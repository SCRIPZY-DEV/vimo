import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

import {
  withAnimationCheckpointLease,
  withAnimationSceneLease,
} from '../animation/coordination.ts'
import { slotDurationSeconds } from '../animation/timing.ts'
import { markVideoOutdated, readProjectMetadata } from '../project/metadata.ts'
import { isValidFile, type ProjectPaths } from '../project/paths.ts'
import {
  readScenes,
  toSceneSummary,
  writeScenes,
} from '../project/scenes-file.ts'
import {
  createHeyGenClient,
  type HeyGenClient,
} from '../providers/avatar/heygen.ts'
import { HEYGEN_PROVIDER } from '../providers/avatar/heygen-errors.ts'
import type { PipelineEmitter } from '../runner/emitter.ts'
import { PipelineFailure } from '../runner/failure.ts'
import type { CreateVideoContext } from '../stages/context.ts'
import {
  AVATAR_RENDER_CONCURRENCY,
  estimateAvatarUsd,
  type SceneAvatar,
} from '../types/avatar.ts'
import type { Scene } from '../types/scenes.ts'
import { frameSizeFor, videoFormatOf } from '../types/video-format.ts'
import { limitConcurrency } from '../utils/concurrency.ts'
import { requireFfmpegPath } from '../utils/ffmpeg.ts'
import {
  isInsufficientCreditsCode,
  isInsufficientCreditsFailure,
} from '../utils/insufficient-credits.ts'
import {
  createProviderFailureReporter,
  reportFromFailure,
} from '../utils/provider-failure.ts'
import { sceneAvatarClipFile } from './clip-path.ts'
import {
  isFinalRejection,
  renderAvatarScene,
  type AvatarCheckpointDetails,
  type AvatarLaneClock,
  type AvatarLaneResult,
} from './lane.ts'

// Operación compartida por la fase `avatar` y el comando del editor
// `avatar-render-scenes` (diseño §8), como generate.ts lo es de la animación:
// elige las escenas, cosecha primero los recibos, mira el saldo antes de pagar
// cada render nuevo y corre el carril de a AVATAR_RENDER_CONCURRENCY. Las
// escrituras de scenes.json se serializan con el lease de checkpoints de la
// animación: el comando del editor convive con `animate-scenes` y los dos
// guardan recibos en el mismo archivo.

// Fallos que dicen «HeyGen anda mal», no «el pedido está mal»: se avisan una
// vez por código y corrida con `avatar-provider-trouble`.
const PROVIDER_TROUBLE_CODES = new Set([
  'avatar_network',
  'avatar_rate_limited',
  'avatar_provider_error',
  'avatar_timeout',
])
// Billetera en dólares: la única que se compara con el estimado.
const USD_CURRENCY = 'usd'
// El saldo y el estimado se comparan en millonésimas de dólar, enteras: la
// suma de varias escenas en coma flotante puede pasarse del total por una
// fracción ínfima y rechazar un saldo exactamente igual al estimado.
const MICRO_USD_PER_USD = 1_000_000

export interface AvatarRenderSelection {
  // Solo esas escenas (el comando del editor; se validan acá, también vacía o
  // con un id que no es de avatar); sin ellas, todas las pendientes (la fase).
  // Pedidas por la persona, también se vuelve a pedir una cuyo último pedido
  // HeyGen rechazó para siempre; la fase no lo hace sola.
  sceneIds?: number[]
  // Reloj de las esperas del carril (los guards lo adelantan).
  clock?: AvatarLaneClock
}

export interface AvatarRenderOutcome {
  rendered: number[]
  failed: number[]
  // El código de las que no quedaron listas que explica la corrida: uno de la
  // cuenta si alguna falló por ella (`isAccountFailureCode`); si no, el que más
  // se repite. La fase lo lanza o lo pone en el mensaje de `avatar_incomplete`.
  dominantCode?: string
}

// Códigos de la cuenta de HeyGen: la clave (rechazada o ausente) y el saldo.
// Sin la cuenta arreglada no se cosecha ni se paga nada (un render pagado
// queda `pending` esperando una clave que sirva), así que mandan sobre
// cualquier otro fallo de la corrida, también sobre un rechazo para siempre.
const ACCOUNT_FAILURE_CODES: ReadonlySet<string> = new Set([
  'avatar_invalid_key',
  'missing_api_key',
  'avatar_insufficient_credits',
])

export function isAccountFailureCode(code: string): boolean {
  return ACCOUNT_FAILURE_CODES.has(code)
}

// Una escena de avatar está pendiente si no quedó lista con su clip en disco.
// Una lista pero desactualizada (otra narración, otro tramo) NO: regenerarla
// cuesta y lo decide la persona desde el editor (§11.4).
export async function isAvatarScenePending(
  paths: ProjectPaths,
  scene: Scene,
): Promise<boolean> {
  const avatar = scene.avatar
  if (!avatar) return false

  if (avatar.status !== 'ready') return true

  const clip = sceneAvatarClipFile(paths, avatar)
  if (!clip) return true

  return !(await isValidFile(clip))
}

export async function pendingAvatarScenes(
  paths: ProjectPaths,
  scenes: Scene[],
): Promise<Scene[]> {
  const pending: Scene[] = []
  for (const scene of scenes)
    if (await isAvatarScenePending(paths, scene)) pending.push(scene)
  return pending
}

// Los ids que pide la persona (el comando del editor), validados en un solo
// lugar y antes de hablar con HeyGen: una lista no vacía de enteros, cada uno
// de una escena de avatar del proyecto; si uno no lo es, no se paga ninguno.
// Sin repetidos (un id repetido correría dos carriles de la misma escena a la
// vez) y en orden, que fija cómo arranca la cosecha.
function requestedAvatarSceneIds(
  scenes: Scene[],
  sceneIds: number[],
): number[] {
  if (
    !Array.isArray(sceneIds) ||
    sceneIds.length === 0 ||
    !sceneIds.every((id) => Number.isSafeInteger(id) && id >= 0)
  )
    throw new PipelineFailure(
      'invalid_payload',
      'sceneIds must contain valid scene ids',
    )

  const byId = new Map(scenes.map((scene) => [scene.id, scene]))
  const unique = [...new Set(sceneIds)].sort((a, b) => a - b)
  for (const id of unique)
    if (!byId.get(id)?.avatar)
      throw new PipelineFailure(
        'invalid_payload',
        `scene ${id} is not an avatar scene`,
      )

  return unique
}

// Las escenas que trabaja una corrida: las pedidas (ya validadas por
// `requestedAvatarSceneIds`) o, sin pedido, las pendientes (la fase). Se
// vuelve a llamar con scenes.json releído bajo el lease: una pedida que ya no
// es de avatar ahí (otro job la cambió) se saltea.
async function selectTargets(
  paths: ProjectPaths,
  scenes: Scene[],
  sceneIds: number[] | undefined,
): Promise<Scene[]> {
  if (!sceneIds) return pendingAvatarScenes(paths, scenes)

  const byId = new Map(scenes.map((scene) => [scene.id, scene]))
  return sceneIds.flatMap((id) => {
    const scene = byId.get(id)
    if (!scene?.avatar) return []

    return [scene]
  })
}

// Lo que cuesta una escena: su duración REAL en cuadros (con la cola que ya
// absorbió el corte) por la tarifa del motor y el tipo de look, sin factor de
// seguridad (diseño §8: la estimación es exacta y el saldo se vuelve a mirar
// antes de cada pago). Un motor que no aplica a ese look no tiene precio:
// cuenta 0 y HeyGen lo rechaza al pedir.
function sceneUsd(scene: Scene): number {
  const avatar = scene.avatar
  if (!avatar) return 0

  const seconds = slotDurationSeconds(
    scene.startSeconds ?? 0,
    scene.endSeconds ?? 0,
  )
  return estimateAvatarUsd(seconds, avatar.engine, avatar.lookType) ?? 0
}

function toMicroUsd(usd: number): number {
  return Math.round(usd * MICRO_USD_PER_USD)
}

function fromMicroUsd(micro: number): string {
  return (micro / MICRO_USD_PER_USD).toFixed(4)
}

function mostFrequent(codes: string[]): string | undefined {
  const counts = new Map<string, number>()
  for (const code of codes) counts.set(code, (counts.get(code) ?? 0) + 1)
  let dominant: string | undefined
  let dominantCount = 0
  for (const [code, count] of counts) {
    if (count <= dominantCount) continue

    dominant = code
    dominantCount = count
  }
  return dominant
}

// El código que explica la corrida: si una escena falló por la cuenta, ese
// (aunque otra sea un rechazo para siempre y haya llegado antes); si no, el que
// más se repite. Así el resultado no depende del orden en que terminan.
function dominantCode(codes: string[]): string | undefined {
  const account = codes.filter(isAccountFailureCode)
  return mostFrequent(account.length > 0 ? account : codes)
}

// El saldo antes de cada pago (diseño §8): antes de que una escena pueda pagar
// se vuelve a leer la billetera de HeyGen y se compara con lo que falta pagar
// en la corrida —esa escena y las que todavía esperan su turno—. La primera
// lectura cubre a todas, ANTES de subir nada. Los turnos van de a uno: dos
// lecturas a la vez dejarían pasar a la segunda con un saldo que no alcanzó
// para la primera. Lo que la relectura garantiza, y lo que no: no cuenta las
// escenas ya admitidas que todavía no se cobraron, así que frena ante un gasto
// ajeno mayor que lo que está en vuelo; uno menor lo ataja HeyGen con un 402,
// que también pausa. Si una vez no alcanza (o HeyGen ya respondió que no hay
// saldo), ninguna otra escena de la corrida paga: las pedidas se cosechan
// igual y la fase pausa.
interface BalanceGate {
  // Resuelve si la escena puede pagar; si no, lanza el motivo.
  admit(scene: Scene): Promise<void>
  // Corta los pagos que faltan con ese fallo (un 402 de HeyGen al pedir).
  stopPayments(failure: PipelineFailure): void
}

// Solo compara en dólares: una billetera en otra moneda (la OpenAPI admite
// `credits`) se informa una vez y no frena. Una clave rechazada corta; un
// saldo ilegible por otra razón se avisa una vez por código y deja seguir (si
// de verdad no alcanza, HeyGen responde 402 y eso también pausa).
function createBalanceGate(
  client: HeyGenClient,
  scenes: Scene[],
  emitter: PipelineEmitter,
): BalanceGate {
  // Lo que cuesta cada escena que todavía no pasó, en millonésimas de dólar.
  const waiting = new Map(
    scenes.map((scene) => [scene.id, toMicroUsd(sceneUsd(scene))]),
  )
  const warnedCodes = new Set<string>()
  let comparable = true
  let refusal: PipelineFailure | undefined
  let turns: Promise<unknown> = Promise.resolve()

  const refuse = (failure: PipelineFailure): never => {
    refusal = failure
    throw failure
  }

  // Lee la billetera y la compara con `expected` (millonésimas de dólar), lo
  // que falta pagar en la corrida entre `sceneCount` escenas.
  const compare = async (
    expected: number,
    sceneCount: number,
  ): Promise<void> => {
    const balance = await client.getBalance()
    if (!balance.available && balance.errorCode === 'avatar_invalid_key')
      return refuse(
        new PipelineFailure(
          'avatar_invalid_key',
          'HeyGen rejected the API key while reading the balance',
          { provider: HEYGEN_PROVIDER },
        ),
      )

    if (!balance.available) {
      const code = balance.errorCode ?? 'unknown'
      if (warnedCodes.has(code)) return

      warnedCodes.add(code)
      emitter.emit({
        type: 'log',
        level: 'warn',
        message: `HeyGen balance unavailable (${code}): rendering without a balance check`,
      })
      return
    }

    const remaining = balance.remaining ?? 0
    if (balance.currency !== USD_CURRENCY) {
      // La moneda no cambia a mitad de corrida: no se vuelve a leer.
      comparable = false
      emitter.emit({
        type: 'log',
        level: 'info',
        message: `HeyGen balance is ${remaining} ${balance.currency ?? 'credits'}: not comparable with the ${fromMicroUsd(expected)} USD estimate, rendering anyway`,
      })
      return
    }

    if (toMicroUsd(remaining) >= expected) return

    return refuse(
      new PipelineFailure(
        'avatar_insufficient_credits',
        `HeyGen balance ${remaining.toFixed(4)} USD is below the ${fromMicroUsd(expected)} USD estimate for ${sceneCount} avatar scene(s)`,
        { provider: HEYGEN_PROVIDER },
      ),
    )
  }

  const check = async (sceneId: number): Promise<void> => {
    if (refusal) throw refusal

    const expected = [...waiting.values()].reduce(
      (sum, micro) => sum + micro,
      0,
    )
    if (comparable && expected > 0) await compare(expected, waiting.size)

    // La escena sale de la cuenta recién después de la lectura: si la lectura
    // lanzara, la siguiente la seguiría contando, de más y nunca de menos.
    waiting.delete(sceneId)
  }

  return {
    admit(scene) {
      const turn = turns.then(() => check(scene.id))
      turns = turn.catch(() => undefined)
      return turn
    },
    stopPayments(failure) {
      refusal ??= failure
    },
  }
}

export async function renderAvatarScenes(
  context: CreateVideoContext,
  selection: AvatarRenderSelection = {},
): Promise<AvatarRenderOutcome> {
  const { paths, signal, emitter } = context
  signal.throwIfAborted()
  if (context.options.demo)
    throw new PipelineFailure(
      'demo_project',
      'Demo projects cannot render avatars',
    )

  const scenes = await readScenes(paths)
  if (!scenes)
    throw new PipelineFailure('scenes_missing', 'The project has no scenes')

  const sceneIds =
    selection.sceneIds === undefined
      ? undefined
      : requestedAvatarSceneIds(scenes, selection.sceneIds)
  const candidates = await selectTargets(paths, scenes, sceneIds)
  const outcome: AvatarRenderOutcome = { rendered: [], failed: [] }
  if (candidates.length === 0) return outcome

  const apiKey = context.job.apiKeys.heygen
  if (!apiKey)
    throw new PipelineFailure('missing_api_key', 'HeyGen API key is missing')

  const ffmpegPath = requireFfmpegPath(context.job.binaryPaths.ffmpeg)
  if (!(await isValidFile(paths.narrationFile)))
    throw new PipelineFailure('narration_missing', 'narration.mp3 is missing')

  const narrationSha256 = createHash('sha256')
    .update(await readFile(paths.narrationFile))
    .digest('hex')
  const format = videoFormatOf(context.options)
  const client = createHeyGenClient(apiKey, signal)
  const reportFailure = createProviderFailureReporter(emitter, 'avatar')
  const troubled = new Set<string>()
  const started = new Set<number>()
  const codes: string[] = []
  const candidateIds = new Set(candidates.map((scene) => scene.id))

  return withAnimationSceneLease(
    paths.root,
    [...candidateIds],
    signal,
    async () => {
      // Con las escenas ya tomadas se relee scenes.json: otro job pudo dejar
      // recibos entre la primera lectura y el lease, y un carril que arranca
      // de una copia vieja pagaría de nuevo y pisaría esos recibos.
      const targets = (
        await selectTargets(paths, (await readScenes(paths)) ?? [], sceneIds)
      ).filter((scene) => candidateIds.has(scene.id))
      if (targets.length === 0) return outcome

      // Guardar un recibo es obligatorio aunque la persona cancele: la
      // escritura usa su propia señal, nunca la del job.
      const checkpointSignal = new AbortController().signal
      let writeQueue: Promise<unknown> = Promise.resolve()
      const persist = (
        sceneId: number,
        avatar: SceneAvatar,
        details: AvatarCheckpointDetails | undefined,
      ): Promise<void> => {
        const operation = writeQueue.then(() =>
          withAnimationCheckpointLease(
            paths.root,
            checkpointSignal,
            async () => {
              const current = await readScenes(paths)
              if (!current)
                throw new PipelineFailure(
                  'scenes_missing',
                  'Scenes disappeared while saving an avatar',
                )

              await writeScenes(
                paths,
                current.map((scene) =>
                  scene.id === sceneId ? { ...scene, avatar } : scene,
                ),
              )
              // Un clip nuevo cambia el video: el mp4 que haya quedó atrás.
              // Solo entonces: los recibos intermedios de una escena que ya
              // estaba lista (y se regenera) todavía no cambiaron nada, y la
              // regeneración puede fallar.
              if (!details?.newClip) return

              const latest = await readProjectMetadata(paths)
              await markVideoOutdated(paths, latest)
              context.metadata.videoOutdated = latest.videoOutdated
            },
          ),
        )
        writeQueue = operation.catch(() => undefined)
        return operation
      }

      const runScene = (scene: Scene, allowNewRequest: boolean) =>
        renderAvatarScene(scene, {
          client,
          paths,
          projectId: context.metadata.id,
          ffmpegPath,
          format,
          frame: frameSizeFor(format),
          narrationSha256,
          narrationVersion: context.metadata.narrationVersion ?? 0,
          allowNewRequest,
          retryFinalRejection: sceneIds !== undefined,
          signal,
          clock: selection.clock,
          events: {
            // El carril avisa en cada entrada, también en la cosecha que
            // termina en `needs-request` antes de pedir el render: la escena
            // se anuncia una sola vez por corrida. Si la corrida se corta
            // (saldo, clave, cancelación), un anuncio puede quedar sin
            // `ready` ni `failed`: lo cierra el fin del job.
            onStarted: (sceneId) => {
              if (started.has(sceneId)) return

              started.add(sceneId)
              emitter.emit({ type: 'avatar-scene-started', sceneId })
            },
            onProgress: (sceneId, phase, elapsedSeconds) =>
              emitter.emit({
                type: 'avatar-scene-progress',
                sceneId,
                phase,
                elapsedSeconds,
              }),
            onWarn: (sceneId, message) =>
              emitter.emit({
                type: 'log',
                level: 'warn',
                message: `Avatar scene ${sceneId}: ${message}`,
              }),
            onRecoveredFailure: (sceneId, failure) =>
              reportFailure(
                reportFromFailure(failure, { recovered: true, sceneId }),
              ),
          },
          onCheckpoint: (avatar, details) => persist(scene.id, avatar, details),
        })

      const settle = async (scene: Scene, result: AvatarLaneResult) => {
        if (result.outcome === 'ready') {
          outcome.rendered.push(scene.id)
          emitter.emit({
            type: 'avatar-scene-ready',
            sceneId: scene.id,
            // La vista se arma con la narración vigente (la metadata del
            // proyecto, diseño §3.3): así sale `stale` igual que en el editor.
            scene: await toSceneSummary(
              paths,
              { ...scene, avatar: result.avatar },
              context.metadata,
            ),
          })
          return
        }

        const code = result.errorCode ?? 'avatar_render_failed'
        outcome.failed.push(scene.id)
        codes.push(code)
        emitter.emit({ type: 'avatar-scene-failed', sceneId: scene.id, code })
        const failure = result.failure
        if (!failure || failure.provider !== HEYGEN_PROVIDER) return

        reportFailure(
          reportFromFailure(failure, { recovered: false, sceneId: scene.id }),
        )
        if (!PROVIDER_TROUBLE_CODES.has(failure.code)) return

        if (troubled.has(failure.code)) return

        troubled.add(failure.code)
        emitter.emit({
          type: 'avatar-provider-trouble',
          code: failure.code,
          ...(failure.httpStatus === undefined
            ? {}
            : { httpStatus: failure.httpStatus }),
        })
      }

      // El carril LANZA el 402 al pedir y el render que falló por saldo, pero
      // devuelve `failed` con el código del saldo cuando un 5xx lo menciona:
      // los dos casos pausan igual, nunca como una escena fallida más.
      const runSceneOrPause = async (
        scene: Scene,
        allowNewRequest: boolean,
      ): Promise<AvatarLaneResult> => {
        const result = await runScene(scene, allowNewRequest)
        if (result.outcome !== 'failed') return result

        const code = result.errorCode ?? ''
        if (!isInsufficientCreditsCode(code)) return result

        if (result.failure?.code === code) throw result.failure

        throw new PipelineFailure(
          code,
          `HeyGen reported an insufficient balance for avatar scene ${scene.id}`,
          { provider: HEYGEN_PROVIDER },
        )
      }

      const limiter = limitConcurrency(AVATAR_RENDER_CONCURRENCY)
      // Corre un lote y espera a que se guarde todo. Sin `gate` solo se
      // cosecha: el carril no pide nada nuevo y se devuelven las que
      // necesitan un pedido, con sus recibos al día. Con `gate`, cada escena
      // pasa por el saldo antes de poder pagar.
      const runBatch = async (
        batch: Scene[],
        gate?: BalanceGate,
      ): Promise<Scene[]> => {
        const needsRequest: Scene[] = []
        const outcomes = await Promise.allSettled(
          batch.map((scene) =>
            limiter(async () => {
              signal.throwIfAborted()
              if (gate) await gate.admit(scene)

              const result = await runSceneOrPause(
                scene,
                gate !== undefined,
              ).catch((error: unknown) => {
                // HeyGen dijo que no hay saldo: las que esperan turno ya no
                // pagan (las que están en vuelo se cosechan).
                if (gate && isInsufficientCreditsFailure(error))
                  gate.stopPayments(error)
                throw error
              })
              if (result.outcome === 'needs-request') {
                needsRequest.push({ ...scene, avatar: result.avatar })
                return
              }

              await settle(scene, result)
            }),
          ),
        )
        await writeQueue
        signal.throwIfAborted()
        const rejections = outcomes.flatMap((item) =>
          item.status === 'rejected' ? [item.reason] : [],
        )
        // Una escena que falló por otra cosa (una escritura de scenes.json,
        // por ejemplo) no tapa la pausa por saldo de otra: el saldo manda,
        // porque pausa con recarga y la corrida siguiente retoma lo demás.
        const pause = rejections.find(isInsufficientCreditsFailure)
        if (pause) throw pause

        if (rejections.length > 0) throw rejections[0]

        return needsRequest.sort((a, b) => a.id - b.id)
      }

      // Primero se cosechan los recibos (como la animación,
      // generate.ts:818-836): un saldo en cero no frena bajar un render ya
      // pago. La cosecha no mira el saldo, y no siempre es gratis: un intento
      // sin respuesta que HeyGen no muestra por su título se repite con la
      // MISMA clave (si había llegado, HeyGen devuelve el mismo video y no
      // cobra; es el mismo pedido, no uno nuevo). Todo pedido NUEVO pasa antes
      // por el saldo. También va a la cosecha una escena con un rechazo que
      // repetir no arregla: si es del pedido actual, la fase no lo vuelve a
      // pedir y la escena no cuenta en lo que se compara con el saldo.
      const harvestFirst = (scene: Scene) =>
        (scene.avatar?.attempts ?? []).some(
          (attempt) => attempt.state !== 'failed' || isFinalRejection(attempt),
        )
      const fresh = [
        ...targets.filter((scene) => !harvestFirst(scene)),
        ...(await runBatch(targets.filter(harvestFirst))),
      ].sort((a, b) => a.id - b.id)
      if (fresh.length > 0)
        await runBatch(fresh, createBalanceGate(client, fresh, emitter))

      outcome.rendered.sort((a, b) => a - b)
      outcome.failed.sort((a, b) => a - b)
      const dominant = dominantCode(codes)
      if (dominant) outcome.dominantCode = dominant
      return outcome
    },
  )
}
