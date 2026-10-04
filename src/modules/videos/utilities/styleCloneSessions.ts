import { styleCloneTurnDraftOf } from './styleCloneTurn.ts'
import type {
  StyleCloneAction,
  StyleClonePhase,
  StyleCloneResponse,
  StyleCloneSession,
  StyleCloneStartInput,
  StyleCloneStatus,
  StyleCloneSteps,
  StyleCloneStorage,
  StyleCloneTest,
  StyleCloneTurnResult,
} from '@/modules/videos/types/styleClone'
import type {
  StyleCloneCharacter,
  StyleCloneDrawKind,
  StyleCloneDrawProgressDetail,
  StyleCloneDrawnItem,
  StyleCloneSavePayload,
} from '@pipeline/types/style-clone.ts'
import type { CustomStyleSummary } from '@pipeline/types/styles.ts'

// Las sesiones del creador de estilo con IA (ADR-0050, spec §8), como store
// fuera de React (patrón de gemMigrations): una clonación sigue trabajando
// aunque se cierre el modal, se detiene cuando necesita una respuesta y se
// guarda en cada cambio. Cada acción avanza por fases (material → turno del
// servidor → pruebas dibujadas → guardado) y cada fase deja su resultado en la
// sesión antes de pasar a la siguiente: retomar tras un fallo o tras cerrar la
// app repite solo la fase que estaba corriendo, sin volver a pagar un turno ya
// respondido ni una imagen ya dibujada.
//
// Puro: el sidecar, vimo.click, el almacenamiento, el reloj y los ids llegan
// inyectados, así el guard scripts/test/check-app-style-clone-sessions.mjs lo
// corre con Node pelado. Por eso sus constantes viven acá y no en constants.ts
// y el import de al lado es relativo (Node no resuelve el alias `@/`).

// Hasta cuántas clonaciones abiertas a la vez (decisión del dueño, E1).
export const STYLE_CLONE_SESSION_LIMIT = 3
export const STYLE_CLONE_STORAGE_KEY = 'vimo:styleClone:sessions:v1'
// Espejo de STYLE_NAME_LIMIT del sidecar.
export const STYLE_CLONE_NAME_LIMIT = 80
// El error de una sesión cuyas imágenes no eran imágenes: la app vuelve al
// paso de origen y marca las de `rejectedImages`.
export const STYLE_CLONE_INVALID_IMAGES_CODE = 'style_clone_invalid_images'

const STORAGE_VERSION = 1
const STATUSES: readonly StyleCloneStatus[] = [
  'preparing',
  'analyzing',
  'drawing',
  'awaiting',
  'saving',
  'failed',
  'interrupted',
]
// Estados en los que la sesión está trabajando: si la app se cierra ahí, al
// volver queda «interrumpida».
const WORKING: readonly StyleCloneStatus[] = [
  'preparing',
  'analyzing',
  'drawing',
  'saving',
]

export interface StyleCloneFinished {
  sessionId: string
  entry: CustomStyleSummary
}

export interface StyleCloneSnapshot {
  sessions: ReadonlyMap<string, StyleCloneSession>
  // Clonaciones recién guardadas, hasta que la galería las descarta.
  finished: readonly StyleCloneFinished[]
}

export interface StyleCloneStoreOptions {
  now?: () => number
  newId?: () => string
}

// ¿La sesión está detenida esperando a la persona?
export function styleCloneNeedsAnswer(session: StyleCloneSession): boolean {
  return session.status === 'awaiting'
}

function newSessionId(): string {
  const random = Math.random().toString(36).slice(2, 8)
  return `sc-${Date.now().toString(36)}-${random}`
}

// El estado que muestra la tarjeta mientras corre una fase de una acción.
function workingStatus(
  action: StyleCloneAction,
  phase: StyleClonePhase,
): StyleCloneStatus {
  if (action.kind === 'approve') return 'saving'
  if (phase === 'prepare') return 'preparing'
  if (phase === 'draw') return 'drawing'
  return 'analyzing'
}

// Lectura tolerante de lo guardado: lo que no tiene la forma de una sesión se
// descarta sin arrastrar a las demás, y una sesión que quedó trabajando vuelve
// «interrumpida» (el sidecar no sobrevive al cierre de la app).
function restoreSessions(raw: string | null): Map<string, StyleCloneSession> {
  const sessions = new Map<string, StyleCloneSession>()
  if (!raw) return sessions

  let stored: unknown
  try {
    stored = JSON.parse(raw)
  } catch {
    return sessions
  }
  if (typeof stored !== 'object' || stored === null) return sessions
  const { version, sessions: list } = stored as {
    version?: unknown
    sessions?: unknown
  }
  if (version !== STORAGE_VERSION || !Array.isArray(list)) return sessions

  for (const candidate of list) {
    if (!isStoredSession(candidate)) continue
    sessions.set(
      candidate.id,
      WORKING.includes(candidate.status)
        ? { ...candidate, status: 'interrupted' }
        : candidate,
    )
  }
  return sessions
}

function isStoredSession(value: unknown): value is StyleCloneSession {
  if (typeof value !== 'object' || value === null) return false
  const session = value as Partial<StyleCloneSession>
  return (
    typeof session.id === 'string' &&
    typeof session.status === 'string' &&
    STATUSES.includes(session.status) &&
    typeof session.source === 'object' &&
    session.source !== null &&
    Array.isArray(session.material) &&
    Array.isArray(session.history) &&
    Array.isArray(session.designs) &&
    Array.isArray(session.scenes)
  )
}

const testsFrom = (prompts: readonly string[]): StyleCloneTest[] =>
  prompts.map((prompt, index) => ({ index: index + 1, prompt }))

// Una prueba con lo que trajo su dibujo: la imagen, o el error.
function drawnTest(
  test: StyleCloneTest,
  drawn: StyleCloneDrawnItem | StyleCloneDrawProgressDetail,
): StyleCloneTest {
  const next: StyleCloneTest = {
    index: test.index,
    prompt: test.prompt,
    ...(test.origin ? { origin: test.origin } : {}),
  }
  const originalPath = drawn.originalPath ?? test.originalPath
  if (originalPath) next.originalPath = originalPath

  if (drawn.file && drawn.path)
    return {
      ...next,
      file: drawn.file,
      path: drawn.path,
      ...(drawn.mtimeMs === undefined ? {} : { mtimeMs: drawn.mtimeMs }),
    }
  if (drawn.errorCode) return { ...next, errorCode: drawn.errorCode }
  return { ...test, ...(originalPath ? { originalPath } : {}) }
}

export function createStyleCloneSessions(
  steps: StyleCloneSteps,
  storage: StyleCloneStorage,
  options: StyleCloneStoreOptions = {},
) {
  const now = options.now ?? (() => Date.now())
  const newId = options.newId ?? newSessionId

  let snapshot: StyleCloneSnapshot = {
    sessions: restoreSessions(storage.read()),
    finished: [],
  }
  const subscribers = new Set<() => void>()
  // La corrida viva de cada sesión: una respuesta que llega para otra corrida
  // (o para una sesión descartada) no se aplica.
  const runs = new Map<string, symbol>()

  const publish = (next: StyleCloneSnapshot) => {
    snapshot = next
    try {
      storage.write(
        JSON.stringify({
          version: STORAGE_VERSION,
          sessions: [...next.sessions.values()],
        }),
      )
    } catch {
      // Sin espacio o sin almacenamiento: la sesión sigue en memoria.
    }
    for (const subscriber of subscribers) subscriber()
  }

  const put = (session: StyleCloneSession) => {
    const sessions = new Map(snapshot.sessions)
    sessions.set(session.id, session)
    publish({ ...snapshot, sessions })
  }

  const patch = (sessionId: string, changes: Partial<StyleCloneSession>) => {
    const current = snapshot.sessions.get(sessionId)
    if (current) put({ ...current, ...changes })
  }

  const remove = (sessionId: string, finished?: StyleCloneFinished) => {
    const sessions = new Map(snapshot.sessions)
    sessions.delete(sessionId)
    publish({
      sessions,
      finished: finished ? [...snapshot.finished, finished] : snapshot.finished,
    })
  }

  // ── Las fases ──

  const setPhase = (
    session: StyleCloneSession,
    phase: StyleClonePhase,
    changes: Partial<StyleCloneSession> = {},
  ) => {
    if (!session.action) return
    put({
      ...session,
      ...changes,
      phase,
      status: workingStatus(session.action, phase),
      errorCode: null,
    })
  }

  const runPrepare = async (
    session: StyleCloneSession,
    alive: () => boolean,
  ) => {
    const prepared = await steps.prepare(session)
    if (!alive()) return
    if (prepared.rejectedImages.length > 0) {
      patch(session.id, {
        status: 'failed',
        errorCode: STYLE_CLONE_INVALID_IMAGES_CODE,
        rejectedImages: prepared.rejectedImages,
      })
      return
    }
    setPhase(session, 'turn', {
      material: prepared.material,
      title: prepared.title,
      rejectedImages: [],
    })
  }

  // Lo que deja un turno en la sesión, según la acción que lo pidió.
  const turnChanges = (
    session: StyleCloneSession,
    action: StyleCloneAction,
    result: StyleCloneTurnResult,
  ): Partial<StyleCloneSession> => {
    const changes: Partial<StyleCloneSession> = {
      history: [...session.history, ...result.turns],
    }
    if (action.kind === 'analyze') {
      changes.name = (result.name || session.name).slice(
        0,
        STYLE_CLONE_NAME_LIMIT,
      )
      changes.description = result.description ?? ''
      changes.step = session.replicateCharacter ? 'character' : 'scenes'
    }
    if (result.designs) {
      changes.designs = testsFrom(result.designs)
      changes.designsRound = session.designsRound + 1
      changes.characterIn = result.characterIn ?? session.characterIn
      changes.choice = null
    }
    if (result.scenes) {
      changes.scenes = result.scenes.map((scene, index) => ({
        index: index + 1,
        prompt: scene.prompt,
        origin: scene.origin,
      }))
      changes.scenesRound = session.scenesRound + 1
    }
    if (action.kind === 'choose-character') {
      changes.choice = { option: action.option, travel: action.travel }
      changes.identity = result.identity ?? null
      changes.step = 'scenes'
    }
    if (result.sections && result.templateVersion) {
      changes.sections = result.sections
      changes.templateVersion = result.templateVersion
      changes.characterMode = result.characterMode ?? null
    }
    return changes
  }

  const runTurn = async (session: StyleCloneSession, alive: () => boolean) => {
    const action = session.action
    if (!action || action.kind === 'redraw') return
    const result = await steps.turn(
      styleCloneTurnDraftOf(session, action),
      session.material,
    )
    if (!alive()) return
    setPhase(
      session,
      action.kind === 'approve' ? 'save' : 'draw',
      turnChanges(session, action, result),
    )
  }

  // El personaje tal como viaja en las escenas y en el guardado. null = el
  // estilo no lleva personaje (o todavía no se eligió).
  const characterOf = (
    session: StyleCloneSession,
  ): StyleCloneCharacter | null => {
    const { choice, identity } = session
    if (!choice || !identity) return null
    const designFile = session.designs.find(
      (design) => design.index === choice.option,
    )?.file
    if (!designFile) return null
    return {
      travel: choice.travel,
      name: identity.name.trim() || session.name,
      description: identity.description,
      designFile,
    }
  }

  // Con qué personaje se guarda el estilo: el clonado o, sin uno, el modo que
  // sugirió el servidor. Sin ninguno de los dos queda en «Personaje genérico».
  const savedCharacterOf = (
    session: StyleCloneSession,
  ): Pick<StyleCloneSavePayload, 'character' | 'characterMode'> => {
    const character = characterOf(session)
    if (character) return { character }
    if (session.characterMode) return { characterMode: session.characterMode }

    return {}
  }

  // Qué se dibuja en esta fase: la ronda que acaba de llegar, o las pruebas
  // que la persona pidió reintentar.
  const drawTargetOf = (session: StyleCloneSession): StyleCloneDrawKind => {
    const action = session.action
    if (action?.kind === 'redraw') return action.target
    if (action?.kind === 'analyze')
      return session.replicateCharacter ? 'designs' : 'scenes'
    return action?.kind === 'adjust-character' ? 'designs' : 'scenes'
  }

  const runDraw = async (session: StyleCloneSession, alive: () => boolean) => {
    const target = drawTargetOf(session)
    const key = target === 'designs' ? 'designs' : 'scenes'
    const wanted =
      session.action?.kind === 'redraw' ? session.action.indexes : null
    // Las que ya tienen imagen no se vuelven a pagar.
    const items = session[key].filter(
      (test) => !test.path && (!wanted || wanted.includes(test.index)),
    )
    const character = target === 'scenes' ? characterOf(session) : null

    const apply = (
      drawn: StyleCloneDrawnItem | StyleCloneDrawProgressDetail,
    ) => {
      const current = snapshot.sessions.get(session.id)
      if (!current || !alive()) return
      put({
        ...current,
        [key]: current[key].map((test) =>
          test.index === drawn.index ? drawnTest(test, drawn) : test,
        ),
      })
    }

    if (items.length > 0) {
      const result = await steps.draw(
        {
          sessionId: session.id,
          round:
            target === 'designs' ? session.designsRound : session.scenesRound,
          kind: target,
          items: items.map((test) => ({
            index: test.index,
            prompt: test.prompt,
            ...(test.origin ? { origin: test.origin } : {}),
          })),
          imageProvider: session.imageProvider,
          ...(character ? { character } : {}),
        },
        (detail) => {
          if (detail.status === 'completed' || detail.status === 'failed')
            apply(detail)
        },
      )
      if (!alive()) return
      for (const item of result.items) apply(item)
    }

    // La ronda está dibujada (con sus fallos, si los hubo): le toca a la
    // persona.
    patch(session.id, {
      status: 'awaiting',
      action: null,
      phase: null,
      errorCode: null,
    })
  }

  const runSave = async (session: StyleCloneSession, alive: () => boolean) => {
    if (!session.sections || !session.templateVersion) {
      // Sin el estilo final no hay qué guardar: se pide otra vez.
      setPhase(session, 'turn')
      return
    }
    const result = await steps.save({
      sessionId: session.id,
      name: session.name,
      sections: session.sections,
      templateVersion: session.templateVersion,
      samples: session.scenes.flatMap((scene) =>
        scene.file ? [scene.file] : [],
      ),
      ...savedCharacterOf(session),
    })
    if (!alive()) return
    remove(session.id, { sessionId: session.id, entry: result.entry })
    steps.saved(result, session)
  }

  const run = async (sessionId: string) => {
    const token = Symbol(sessionId)
    runs.set(sessionId, token)
    const alive = () =>
      runs.get(sessionId) === token && snapshot.sessions.has(sessionId)

    try {
      for (;;) {
        const session = snapshot.sessions.get(sessionId)
        if (!alive() || !session?.action || !session.phase) return
        if (!WORKING.includes(session.status)) return

        if (session.phase === 'prepare') await runPrepare(session, alive)
        else if (session.phase === 'turn') await runTurn(session, alive)
        else if (session.phase === 'draw') await runDraw(session, alive)
        else await runSave(session, alive)
      }
    } catch (error) {
      if (alive())
        patch(sessionId, {
          status: 'failed',
          errorCode: steps.errorCode(error),
        })
    } finally {
      if (runs.get(sessionId) === token) runs.delete(sessionId)
    }
  }

  // ¿La respuesta corresponde al paso en que espera la sesión?
  const actionFor = (
    session: StyleCloneSession,
    response: StyleCloneResponse,
  ): { action: StyleCloneAction; phase: StyleClonePhase } | null => {
    if (response.kind === 'redraw') {
      const tests =
        response.target === 'designs' ? session.designs : session.scenes
      const indexes = response.indexes.filter((index) =>
        tests.some((test) => test.index === index && !test.path),
      )
      if (indexes.length === 0) return null
      return { action: { ...response, indexes }, phase: 'draw' }
    }

    if (response.kind === 'adjust-character') {
      if (session.step !== 'character' || !response.comment.trim()) return null
      return { action: response, phase: 'turn' }
    }
    if (response.kind === 'choose-character') {
      const design = session.designs.find(
        (test) => test.index === response.option,
      )
      if (session.step !== 'character' || !design?.file) return null
      return { action: response, phase: 'turn' }
    }

    if (session.step !== 'scenes') return null
    if (response.kind === 'adjust-scenes') {
      if (!response.comment.trim()) return null
      return { action: response, phase: 'turn' }
    }
    // Aprobar: al menos una clonación dibujada, que será la muestra.
    if (!session.scenes.some((scene) => scene.file)) return null
    return { action: response, phase: 'turn' }
  }

  const activeCount = () => snapshot.sessions.size

  return {
    // ¿Se puede empezar otra? Una sesión abierta cuenta aunque esté esperando.
    canStart(): boolean {
      return activeCount() < STYLE_CLONE_SESSION_LIMIT
    },
    // Empieza una clonación y devuelve su id; null si ya hay tres abiertas.
    start(input: StyleCloneStartInput): string | null {
      if (activeCount() >= STYLE_CLONE_SESSION_LIMIT) return null

      const session: StyleCloneSession = {
        id: newId(),
        createdAt: now(),
        source: input.source,
        replicateCharacter: input.replicateCharacter,
        imageProvider: input.imageProvider,
        status: 'preparing',
        step: null,
        action: { kind: 'analyze' },
        phase: 'prepare',
        material: [],
        title: '',
        history: [],
        name: input.fallbackName,
        description: '',
        characterIn: null,
        designs: [],
        designsRound: 0,
        choice: null,
        identity: null,
        scenes: [],
        scenesRound: 0,
        sections: null,
        templateVersion: null,
        characterMode: null,
        errorCode: null,
        rejectedImages: [],
      }
      put(session)
      void run(session.id)
      return session.id
    },
    // La respuesta de la persona. Solo vale mientras la sesión espera y si
    // corresponde a su paso; lo demás se ignora.
    respond(sessionId: string, response: StyleCloneResponse): void {
      const session = snapshot.sessions.get(sessionId)
      if (!session || session.status !== 'awaiting') return
      const next = actionFor(session, response)
      if (!next) return

      put({
        ...session,
        action: next.action,
        phase: next.phase,
        status: workingStatus(next.action, next.phase),
        errorCode: null,
        // Un turno nuevo descarta el estilo final que hubiera: se aprueba otra
        // conversación.
        ...(next.phase === 'turn'
          ? { sections: null, templateVersion: null, characterMode: null }
          : {}),
      })
      void run(sessionId)
    },
    // «Reintentar» y «Reanudar»: repite la fase que estaba corriendo.
    retry(sessionId: string): void {
      const session = snapshot.sessions.get(sessionId)
      if (!session?.action || !session.phase) return
      if (session.status !== 'failed' && session.status !== 'interrupted')
        return

      put({
        ...session,
        status: workingStatus(session.action, session.phase),
        errorCode: null,
      })
      void run(sessionId)
    },
    // El nombre que propuso la IA se puede cambiar antes de guardar.
    rename(sessionId: string, name: string): void {
      const session = snapshot.sessions.get(sessionId)
      if (!session) return
      patch(sessionId, { name: name.trim().slice(0, STYLE_CLONE_NAME_LIMIT) })
    },
    // Descarta la sesión y borra su carpeta. Lo que estuviera corriendo deja
    // de aplicarse.
    async discard(sessionId: string): Promise<void> {
      if (!snapshot.sessions.has(sessionId)) return
      runs.delete(sessionId)
      remove(sessionId)
      try {
        await steps.discard(sessionId)
      } catch {
        // La carpeta queda huérfana; la sesión ya no existe para la persona.
      }
    },
    // La galería ya mostró (o usó) el estilo recién guardado.
    dismissFinished(sessionId: string): void {
      if (!snapshot.finished.some((item) => item.sessionId === sessionId))
        return
      publish({
        ...snapshot,
        finished: snapshot.finished.filter(
          (item) => item.sessionId !== sessionId,
        ),
      })
    },
    subscribe(listener: () => void): () => void {
      subscribers.add(listener)
      return () => {
        subscribers.delete(listener)
      }
    },
    getSnapshot(): StyleCloneSnapshot {
      return snapshot
    },
  }
}
