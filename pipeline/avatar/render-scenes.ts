import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { isDeepStrictEqual } from 'node:util'

import {
  withAnimationCheckpointLease,
  withAnimationSceneLease,
} from '../animation/coordination.ts'
import { createAnimationLlm } from '../animation/llm.ts'
import { slotDurationSeconds } from '../animation/timing.ts'
import { markVideoOutdated, readProjectMetadata } from '../project/metadata.ts'
import { isValidFile, type ProjectPaths } from '../project/paths.ts'
import {
  isAvatarClipStale,
  readScenes,
  toSceneSummary,
  writeScenes,
  type SceneViewProject,
} from '../project/scenes-file.ts'
import {
  createHeyGenClient,
  type HeyGenClient,
} from '../providers/avatar/heygen.ts'
import { HEYGEN_PROVIDER } from '../providers/avatar/heygen-errors.ts'
import type { PipelineEmitter } from '../runner/emitter.ts'
import { PipelineFailure } from '../runner/failure.ts'
import type { CreateVideoContext } from '../stages/context.ts'
import type { SceneLlm } from '../stages/shared/llm.ts'
import {
  AVATAR_MOTION_PROMPT_LIMIT,
  AVATAR_RENDER_CONCURRENCY,
  avatarExpressiveAvailable,
  avatarMotionSupport,
  avatarSceneSpan,
  estimateAvatarUsd,
  type AvatarAttempt,
  type AvatarSceneMotionInput,
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
import { avatarClipFileName, sceneAvatarClipFile } from './clip-path.ts'
import { avatarRequestKey, avatarRetryIndex } from './fingerprint.ts'
import {
  avatarSceneRequestHash,
  isFinalRejection,
  renderAvatarScene,
  type AvatarCheckpointDetails,
  type AvatarLaneClock,
  type AvatarLaneResult,
  type AvatarRequestRun,
} from './lane.ts'
import {
  avatarMotionPositions,
  avatarMotionTextHash,
  templateMotionPrompt,
  writeAvatarMotionPrompts,
  type AvatarMotionPosition,
  type AvatarMotionRequest,
} from './motion-prompt.ts'

// Operación compartida por la fase `avatar` y el comando del editor
// `avatar-render-scenes` (diseño §8), como generate.ts lo es de la animación:
// elige las escenas, cosecha primero los recibos, mira el saldo antes de pagar
// cada render nuevo y corre el carril de a AVATAR_RENDER_CONCURRENCY. Las
// escrituras de scenes.json se serializan con el lease de checkpoints de la
// animación: el comando del editor convive con `animate-scenes` y los dos
// guardan recibos en el mismo archivo.
// Desde la entrega 2e (diseño §21.2 y §21.4), antes de correr los carriles y
// en una sola escritura (la misma de los recibos), cada escena que se trabaja
// recibe los ajustes de movimiento que mandó el editor, el movimiento
// automático que escribe Vimo (motion-prompt.ts, un solo llamado para todas
// las que lo necesitan) y, si la persona pidió regenerar una escena lista, la
// toma siguiente cuando el render cobrado de su pedido es el clip que se ve:
// así el carril pide un render nuevo y pagado en vez de cosechar el que ya está
// a la vista (uno cobrado que no se llegó a bajar se baja sin pagar otro), y
// la escena conserva su clip si el nuevo falla (`forceNewRender`, lane.ts).

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
// Recibos que el carril cosecha sin pagar otro pedido: mientras la escena
// tenga uno de su pedido actual, Vimo no le reescribe el movimiento
// automático (cambiaría el pedido y se pagaría de nuevo, §21.2).
const IN_FLIGHT_STATES: ReadonlySet<AvatarAttempt['state']> = new Set([
  'creating',
  'pending',
  'ambiguous',
])
// El tono con el que se escribió el movimiento automático, delante del texto
// en su huella (R-2e-10): prender o apagar «más expresivo» lo reescribe.
const AUTO_MOTION_TONE = { expressive: 'expressive', calm: 'calm' } as const

export interface AvatarRenderSelection {
  // Solo esas escenas (el comando del editor; se validan acá, también vacía o
  // con un id que no es de avatar); sin ellas, todas las pendientes (la fase).
  // Pedidas por la persona, también se vuelve a pedir una cuyo último pedido
  // HeyGen rechazó para siempre; la fase no lo hace sola.
  sceneIds?: number[]
  // Entrega 2e (§21.4), solo con `sceneIds` y validados acá antes de hablar
  // con HeyGen (`requestedRegenerateIds`, `requestedMotionInputs`): las listas
  // que la persona pidió regenerar (un render nuevo pagado aunque nada
  // cambie) y los ajustes de movimiento que se guardan antes de pedir.
  regenerateSceneIds?: number[]
  motion?: AvatarSceneMotionInput[]
  // Reloj de las esperas del carril (los guards lo adelantan).
  clock?: AvatarLaneClock
  // El cliente de texto que escribe el movimiento automático (los guards lo
  // simulan). Sin él, el de las animaciones (`createAnimationLlm`); sin la
  // clave de DeepInfra, ninguno: las plantillas profesionales (§21.2).
  motionLlm?: SceneLlm | null
}

export interface AvatarRenderOutcome {
  rendered: number[]
  failed: number[]
  // El código de las que no quedaron listas que explica la corrida: uno de la
  // cuenta si alguna falló por ella (`isAccountFailureCode`); si no, el que más
  // se repite. La fase lanza el de la cuenta; cualquier otro lo deja en el log
  // y termina (entrega 2d: el video sale con la imagen fija del look).
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

// Una escena de avatar está pendiente —la fase la trabaja sola— si no quedó
// lista con su clip en disco. Una lista pero desactualizada (otra narración,
// otro tramo, otro look) NO, tenga o no su clip (entrega 2d): regenerarla
// cuesta y lo decide la persona desde el editor (§11.4), que la pide por id
// (`avatar-render-scenes` no pasa por acá); hasta entonces el render la
// muestra estática con la vista previa del look (§10.1). Una lista y al día
// sin su clip sí: la fase cosecha su recibo, que no cobra. «Desactualizada»
// es la regla de la vista (isAvatarClipStale), con la narración vigente.
export async function isAvatarScenePending(
  paths: ProjectPaths,
  scene: Scene,
  project: SceneViewProject,
): Promise<boolean> {
  const avatar = scene.avatar
  if (!avatar) return false

  if (avatar.status !== 'ready') return true

  if (isAvatarClipStale(scene, avatar, project)) return false

  const clip = sceneAvatarClipFile(paths, avatar)
  if (!clip) return true

  return !(await isValidFile(clip))
}

export async function pendingAvatarScenes(
  paths: ProjectPaths,
  scenes: Scene[],
  project: SceneViewProject,
): Promise<Scene[]> {
  const pending: Scene[] = []
  for (const scene of scenes)
    if (await isAvatarScenePending(paths, scene, project)) pending.push(scene)
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

// Las escenas que la persona pidió regenerar (entrega 2e, §21.4): enteros sin
// repetir, cada uno entre los pedidos (`sceneIds`, ya validados). Como el
// resto del payload, llega sin validar en el borde: cualquier otra cosa no
// deja pagar nada. Sin pedido (la fase) no hay nada que regenerar.
function requestedRegenerateIds(
  sceneIds: readonly number[] | undefined,
  regenerateSceneIds: unknown,
): Set<number> {
  const ids = new Set<number>()
  if (regenerateSceneIds === undefined) return ids

  if (!sceneIds || !Array.isArray(regenerateSceneIds))
    throw new PipelineFailure(
      'invalid_payload',
      'regenerateSceneIds must be a list of requested scene ids',
    )

  for (const id of regenerateSceneIds) {
    if (
      typeof id !== 'number' ||
      !Number.isSafeInteger(id) ||
      ids.has(id) ||
      !sceneIds.includes(id)
    )
      throw new PipelineFailure(
        'invalid_payload',
        'regenerateSceneIds must list requested scene ids, without repeats',
      )

    ids.add(id)
  }
  return ids
}

// Una entrada de `motion` como llega del editor, con el prompt recortado; o
// undefined si no es una: `sceneId` entero, `motionPrompt` texto de hasta
// AVATAR_MOTION_PROMPT_LIMIT caracteres ya recortado y `expressive` booleano.
function motionInputOf(value: unknown): AvatarSceneMotionInput | undefined {
  if (typeof value !== 'object' || value === null) return undefined

  const sceneId = 'sceneId' in value ? value.sceneId : undefined
  const motionPrompt = 'motionPrompt' in value ? value.motionPrompt : undefined
  const expressive = 'expressive' in value ? value.expressive : undefined
  if (typeof sceneId !== 'number' || !Number.isSafeInteger(sceneId))
    return undefined

  if (typeof motionPrompt !== 'string' || typeof expressive !== 'boolean')
    return undefined

  const prompt = motionPrompt.trim()
  if (prompt.length > AVATAR_MOTION_PROMPT_LIMIT) return undefined

  return { sceneId, motionPrompt: prompt, expressive }
}

// Los ajustes de movimiento del editor (entrega 2e, §21.4) por escena: una
// entrada por escena pedida, sin repetir. Cualquier otra cosa no deja pagar
// nada. Sin pedido (la fase), ninguno.
function requestedMotionInputs(
  sceneIds: readonly number[] | undefined,
  motion: unknown,
): Map<number, AvatarSceneMotionInput> {
  const inputs = new Map<number, AvatarSceneMotionInput>()
  if (motion === undefined) return inputs

  if (!sceneIds || !Array.isArray(motion))
    throw new PipelineFailure(
      'invalid_payload',
      'motion must be a list of motion settings of requested scenes',
    )

  for (const entry of motion) {
    const input = motionInputOf(entry)
    if (
      !input ||
      inputs.has(input.sceneId) ||
      !sceneIds.includes(input.sceneId)
    )
      throw new PipelineFailure(
        'invalid_payload',
        'motion must hold one valid entry per requested scene',
      )

    inputs.set(input.sceneId, input)
  }
  return inputs
}

// Las escenas que trabaja una corrida: las pedidas (ya validadas por
// `requestedAvatarSceneIds`), también una desactualizada, o, sin pedido, las
// pendientes (la fase). Se vuelve a llamar con scenes.json releído bajo el
// lease: una pedida que ya no es de avatar ahí (otro job la cambió) se saltea.
async function selectTargets(
  paths: ProjectPaths,
  scenes: Scene[],
  sceneIds: number[] | undefined,
  project: SceneViewProject,
): Promise<Scene[]> {
  if (!sceneIds) return pendingAvatarScenes(paths, scenes, project)

  const byId = new Map(scenes.map((scene) => [scene.id, scene]))
  return sceneIds.flatMap((id) => {
    const scene = byId.get(id)
    if (!scene?.avatar) return []

    return [scene]
  })
}

// ─── Antes de pedir: el movimiento y la toma (entrega 2e, §21.2 y §21.4) ───

// El prompt que mandó el editor, si el motor y el look lo admiten: recortado
// (vacío borra el campo), `auto` si es el que escribió Vimo (sin contar los
// espacios de las puntas, como la ayuda del editor) y `user` si no. Vacío sin
// un automático escrito no es una elección de la persona (R-2e-9): queda sin
// quién lo escribió, y el escritor le escribe el suyo.
function withPromptSetting(
  avatar: SceneAvatar,
  motionPrompt: string,
): SceneAvatar {
  if (!avatarMotionSupport(avatar.engine, avatar.lookType).motionPrompt)
    return avatar

  const next: SceneAvatar = { ...avatar }
  const prompt = motionPrompt.trim()
  if (prompt) next.motionPrompt = prompt
  else delete next.motionPrompt

  // Un prompt distinto del guardado vuelve a intentar el movimiento: el
  // rechazo anterior pudo ser del prompt (por ejemplo, su largo) y no del look
  // (revisión final de la 2e). Si el proveedor lo vuelve a rechazar, la marca
  // vuelve y el carril pide sin movimiento; el 400 no se cobra.
  if (prompt !== (avatar.motionPrompt ?? '').trim())
    delete next.motionUnsupported

  const automatic = storedAutoMotionPrompt(avatar)
  if (!prompt && automatic === undefined) {
    delete next.motionSource
    return next
  }

  next.motionSource = prompt === automatic ? 'auto' : 'user'
  return next
}

// «Movimiento más expresivo»: se guarda solo en true y solo si el motor y el
// look lo admiten; en false se borra.
function withExpressiveSetting(
  avatar: SceneAvatar,
  expressive: boolean,
): SceneAvatar {
  const next: SceneAvatar = { ...avatar }
  if (expressive && avatarExpressiveAvailable(avatar.engine, avatar.lookType)) {
    next.expressive = true
    return next
  }

  delete next.expressive
  return next
}

// Los ajustes de movimiento que mandó el editor para la escena (§21.4).
function withMotionSettings(
  avatar: SceneAvatar,
  input: AvatarSceneMotionInput,
): SceneAvatar {
  return withExpressiveSetting(
    withPromptSetting(avatar, input.motionPrompt),
    input.expressive,
  )
}

// El último prompt que escribió Vimo, recortado, si hay uno.
function storedAutoMotionPrompt(avatar: SceneAvatar): string | undefined {
  if (typeof avatar.autoMotionPrompt !== 'string') return undefined

  const prompt = avatar.autoMotionPrompt.trim()
  if (!prompt) return undefined

  return prompt
}

// Lo que dice la aparición: el texto de la escena (vacío si no es texto, en un
// scenes.json editado).
function sceneText(scene: Scene): string {
  if (typeof scene.text !== 'string') return ''

  return scene.text
}

// La huella con la que se escribe el movimiento automático (R-2e-10): el tono
// de «más expresivo» y el texto de la escena. Si cambia cualquiera, se
// reescribe.
function autoMotionHashOf(scene: Scene): string {
  const tone =
    scene.avatar?.expressive === true
      ? AUTO_MOTION_TONE.expressive
      : AUTO_MOTION_TONE.calm
  return avatarMotionTextHash(`${tone}\n${sceneText(scene)}`)
}

// Lo que el carril sabe de una escena antes de correr: si está lista, al día
// y con su clip (el carril no pide nada salvo que se regenere) y si es una
// lista que la persona pidió regenerar.
interface SceneLaneFacts {
  upToDate: boolean
  retake: boolean
}

// ¿Vimo le escribe (o reescribe) el movimiento automático antes de pedir?
// Solo si el motor y el look admiten prompt, el proveedor no lo rechazó, la
// persona no escribió el suyo y el carril va a pedir algo; si no tiene uno o
// se escribió para otro texto u otro tono; y si su pedido actual no tiene un
// recibo que el carril cosecharía sin pagar: uno en vuelo y, salvo que se
// regenere una lista, uno `succeeded` (cambiar el prompt cambiaría el pedido y
// se pagaría de nuevo un render ya pago).
function needsAutoMotion(
  scene: Scene,
  facts: SceneLaneFacts,
  run: AvatarRequestRun,
): boolean {
  const avatar = scene.avatar
  if (!avatar) return false

  if (!avatarMotionSupport(avatar.engine, avatar.lookType).motionPrompt)
    return false

  if (avatar.motionUnsupported === true || avatar.motionSource === 'user')
    return false

  if (facts.upToDate && !facts.retake) return false

  if (
    storedAutoMotionPrompt(avatar) !== undefined &&
    avatar.autoMotionTextHash === autoMotionHashOf(scene)
  )
    return false

  // Sin tramo o sin look el carril no pide nada: falla con invalid_payload.
  const hash = avatarSceneRequestHash(scene, run)
  if (hash === undefined) return false

  return !(avatar.attempts ?? []).some((attempt) => {
    if (attempt.hash !== hash) return false
    if (IN_FLIGHT_STATES.has(attempt.state)) return true

    return attempt.state === 'succeeded' && !facts.retake
  })
}

// El movimiento que escribió Vimo, guardado como el de la escena, con la
// huella del tono y el texto para los que se escribió.
function withAutoMotion(scene: Scene, prompt: string): Scene {
  if (!scene.avatar) return scene

  return {
    ...scene,
    avatar: {
      ...scene.avatar,
      autoMotionPrompt: prompt,
      autoMotionTextHash: autoMotionHashOf(scene),
      motionPrompt: prompt,
      motionSource: 'auto',
    },
  }
}

// Lo que el escritor necesita de una escena: su texto, el largo de su tramo
// en cuadros (siempre finito: la escena tiene tramo), su posición en el video
// y «más expresivo».
function motionRequestOf(
  scene: Scene,
  position: AvatarMotionPosition,
): AvatarMotionRequest {
  const span = avatarSceneSpan(scene)
  return {
    sceneId: scene.id,
    text: sceneText(scene),
    seconds: span ? slotDurationSeconds(span.startSeconds, span.endSeconds) : 0,
    position,
    expressive: scene.avatar?.expressive === true,
  }
}

// Las escenas de avatar del proyecto en el orden en que empiezan: el
// escritor las ubica (la primera abre, la última cierra).
function avatarSceneIdsInStartOrder(scenes: Scene[]): number[] {
  return scenes
    .filter((scene) => scene.avatar)
    .sort((left, right) => {
      const byStart = (left.startSeconds ?? 0) - (right.startSeconds ?? 0)
      if (byStart !== 0) return byStart

      return left.id - right.id
    })
    .map((scene) => scene.id)
}

// El cliente que escribe el movimiento automático: el de los guards o el de
// texto de movimiento de las animaciones; sin la clave de DeepInfra, ninguno
// (las plantillas). Nunca frena el render.
function motionLlmOf(
  context: CreateVideoContext,
  selection: AvatarRenderSelection,
): SceneLlm | null {
  if (selection.motionLlm !== undefined) return selection.motionLlm

  try {
    return createAnimationLlm(context)
  } catch (error) {
    if (error instanceof PipelineFailure && error.code === 'missing_api_key')
      return null

    throw error
  }
}

// La toma guardada, o 0 si no es un entero positivo (la regla de la huella).
function storedTake(avatar: SceneAvatar): number {
  const take = avatar.take
  if (typeof take !== 'number' || !Number.isSafeInteger(take) || take <= 0)
    return 0

  return take
}

// ¿El render cobrado de ese pedido es el clip que la escena muestra hoy? Su
// clave (la huella y los intentos fallidos anteriores del mismo pedido, como
// la arma el carril) es la del nombre de `clipFile`. Un id que no puede tener
// clip (clip-path.ts) no muestra ninguno.
function showsPaidRender(
  scene: Scene,
  avatar: SceneAvatar,
  hash: string,
): boolean {
  if (scene.id < 1) return false

  const attempts = avatar.attempts ?? []
  return attempts.some((attempt, index) => {
    if (attempt.hash !== hash || attempt.state !== 'succeeded') return false

    const key = avatarRequestKey(hash, avatarRetryIndex(attempts, index))
    return avatar.clipFile === avatarClipFileName(scene.id, key)
  })
}

// La toma de una lista que se regenera (§21.4): sube si el render cobrado del
// pedido actual (con sus ajustes y su toma) es el clip que se ve, así el carril
// pide un render nuevo en vez de cosechar el que ya está a la vista. Si el
// pedido actual tiene un render cobrado que NO es el clip que se ve (se cobró
// pero no se pudo bajar, o se canceló al bajar), no sube: el carril lo baja sin
// pagar otro (C1 de la revisión de WP-U). Uno en vuelo tampoco la sube: se
// cosecha. Sube una sola vez: la toma siguiente es otro pedido, y ninguno de
// sus recibos puede ser el clip que se ve (su clave es otra); si alguno está
// cobrado (un scenes.json con la toma vuelta atrás), el carril también lo baja
// sin pagar.
function withNextTake(scene: Scene, run: AvatarRequestRun): Scene {
  const avatar = scene.avatar
  if (!avatar) return scene

  const hash = avatarSceneRequestHash(scene, run)
  if (hash === undefined || !showsPaidRender(scene, avatar, hash)) return scene

  return { ...scene, avatar: { ...avatar, take: storedTake(avatar) + 1 } }
}

// Qué se sabe del clip de cada escena que se trabaja: las listas, al día y con
// su clip (el carril toma el atajo y no pide nada) y las listas con clip que
// la persona pidió regenerar. Una pedida que no está lista no tiene clip que
// conservar ni que reemplazar: se trabaja como cualquiera (se cosecha lo que
// ya está pago).
async function sceneLaneFacts(
  paths: ProjectPaths,
  scenes: Scene[],
  project: SceneViewProject,
  regenerateIds: ReadonlySet<number>,
): Promise<Map<number, SceneLaneFacts>> {
  const facts = new Map<number, SceneLaneFacts>()
  for (const scene of scenes) {
    const avatar = scene.avatar
    const clip = avatar ? sceneAvatarClipFile(paths, avatar) : undefined
    const ready =
      avatar?.status === 'ready' &&
      clip !== undefined &&
      (await isValidFile(clip))
    facts.set(scene.id, {
      upToDate: ready && !isAvatarClipStale(scene, avatar, project),
      retake: ready && regenerateIds.has(scene.id),
    })
  }
  return facts
}

interface AvatarScenePreparation {
  context: CreateVideoContext
  selection: AvatarRenderSelection
  // Todas las escenas de scenes.json, releído bajo el lease: el escritor ubica
  // cada aparición entre todas las del video.
  scenes: Scene[]
  targets: Scene[]
  motionInputs: ReadonlyMap<number, AvatarSceneMotionInput>
  facts: ReadonlyMap<number, SceneLaneFacts>
  run: AvatarRequestRun
}

// Las escenas que se trabajan, listas para pedir: con los ajustes del editor,
// el movimiento automático de las que lo necesitan (un solo llamado al
// escritor) y la toma siguiente de las listas que se regeneran. No guarda
// nada: quien llama escribe las que cambiaron. Una cancelación durante el
// escritor sale como tal, sin plantillas que guardar ni nada que pagar.
async function prepareAvatarScenes(
  preparation: AvatarScenePreparation,
): Promise<Scene[]> {
  const { context, motionInputs, facts, run } = preparation
  const factsOf = (scene: Scene): SceneLaneFacts => {
    return facts.get(scene.id) ?? { upToDate: false, retake: false }
  }

  const configured = preparation.targets.map((scene) => {
    const input = motionInputs.get(scene.id)
    if (!input || !scene.avatar) return scene

    return { ...scene, avatar: withMotionSettings(scene.avatar, input) }
  })

  const needing = configured.filter((scene) => {
    return needsAutoMotion(scene, factsOf(scene), run)
  })
  const prompts = new Map<number, string>()
  if (needing.length > 0) {
    const positions = avatarMotionPositions(
      avatarSceneIdsInStartOrder(preparation.scenes),
    )
    const requests = needing.map((scene) => {
      return motionRequestOf(scene, positions.get(scene.id) ?? 'middle')
    })
    const written = await writeAvatarMotionPrompts(
      motionLlmOf(context, preparation.selection),
      requests,
      context.signal,
    )
    context.signal.throwIfAborted()
    for (const [sceneId, prompt] of written) prompts.set(sceneId, prompt)

    // Cuántos salieron de las plantillas (sin clave, con el modelo caído o con
    // una respuesta que no servía), sin ningún prompt en el log.
    const fromTemplates = requests.filter((request) => {
      return written.get(request.sceneId) === templateMotionPrompt(request)
    }).length
    context.emitter.emit({
      type: 'log',
      level: 'info',
      message: `Avatar motion written for scene(s) ${needing.map((scene) => scene.id).join(', ')}: ${fromTemplates} from the templates`,
    })
  }

  return configured.map((scene) => {
    const prompt = prompts.get(scene.id)
    const written = prompt === undefined ? scene : withAutoMotion(scene, prompt)
    if (!factsOf(scene).retake) return written

    return withNextTake(written, run)
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
  const regenerateIds = requestedRegenerateIds(
    sceneIds,
    selection.regenerateSceneIds,
  )
  const motionInputs = requestedMotionInputs(sceneIds, selection.motion)
  const candidates = await selectTargets(
    paths,
    scenes,
    sceneIds,
    context.metadata,
  )
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
      const allScenes = (await readScenes(paths)) ?? []
      const selected = (
        await selectTargets(paths, allScenes, sceneIds, context.metadata)
      ).filter((scene) => candidateIds.has(scene.id))
      if (selected.length === 0) return outcome

      // Guardar un recibo es obligatorio aunque la persona cancele: la
      // escritura usa su propia señal, nunca la del job.
      const checkpointSignal = new AbortController().signal
      let writeQueue: Promise<unknown> = Promise.resolve()
      // Guarda el avatar de esas escenas en una sola escritura de
      // scenes.json, releído justo antes.
      const persistAvatars = (
        avatars: ReadonlyMap<number, SceneAvatar>,
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
                current.map((scene) => {
                  const avatar = avatars.get(scene.id)
                  return avatar ? { ...scene, avatar } : scene
                }),
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
      const persist = (
        sceneId: number,
        avatar: SceneAvatar,
        details: AvatarCheckpointDetails | undefined,
      ): Promise<void> => persistAvatars(new Map([[sceneId, avatar]]), details)

      // Antes de pedir (entrega 2e): los ajustes del editor, el movimiento
      // automático y la toma de las listas que se regeneran, guardados en una
      // escritura antes de que corra el primer carril. Sin nada de eso (Avatar
      // III, o un pedido sin ajustes), scenes.json no se toca.
      const narrationVersion = context.metadata.narrationVersion ?? 0
      const run: AvatarRequestRun = {
        format,
        narrationSha256,
        narrationVersion,
      }
      const facts = await sceneLaneFacts(
        paths,
        selected,
        context.metadata,
        regenerateIds,
      )
      const targets = await prepareAvatarScenes({
        context,
        selection,
        scenes: allScenes,
        targets: selected,
        motionInputs,
        facts,
        run,
      })
      const prepared = new Map<number, SceneAvatar>()
      for (const [index, scene] of targets.entries()) {
        if (!scene.avatar) continue
        if (isDeepStrictEqual(scene.avatar, selected[index].avatar)) continue

        prepared.set(scene.id, scene.avatar)
      }
      // Cancelado antes de pedir: nada se guarda (el editor conserva el
      // borrador de la persona) y nada se paga.
      signal.throwIfAborted()
      if (prepared.size > 0) await persistAvatars(prepared, undefined)

      const runScene = (scene: Scene, allowNewRequest: boolean) =>
        renderAvatarScene(scene, {
          client,
          paths,
          projectId: context.metadata.id,
          // El nombre del video va en el título de cada render nuevo (entrega 2c).
          videoName: context.metadata.name,
          ffmpegPath,
          format,
          frame: frameSizeFor(format),
          narrationSha256,
          narrationVersion,
          allowNewRequest,
          retryFinalRejection: sceneIds !== undefined,
          // Una lista que la persona pidió regenerar: render nuevo, y su clip
          // de hoy a salvo si el nuevo falla.
          forceNewRender: facts.get(scene.id)?.retake === true,
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
