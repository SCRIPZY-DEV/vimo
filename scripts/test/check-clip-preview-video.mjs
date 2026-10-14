// El visor del editor con un clip de verdad (ADR-0057, spec §10.2): monta el
// EditorVisualFrame real —y con él el ClipPreviewVideo real y la decisión de
// playableClip— en Chrome headless, con un mp4 generado al vuelo con el ffmpeg
// del repo (10 s a 25 fps, un cuadro clave por segundo, como el clip
// normalizado del avatar) y un <audio> mudo como reloj, como la narración en
// el editor. Fija lo que check-app-avatar-blocks.mjs no alcanza, lo que el
// componente le hace al <video>:
// - el clip del avatar corre a velocidad 1 aunque dure más que su tramo (el
//   de Kie, con la misma diferencia, se acelera);
// - un atraso menor a 0,12 s no se corrige; al pasarlo, un solo seek, cuando
//   a Kie un atraso de unos 0,2 s no lo mueve (su umbral es 0,3 s);
// - un salto del reloj es un único seek, sin cadena;
// - adelantado espera al reloj sin volver atrás, cuando a Kie ese mismo
//   adelanto no lo frena.
// El desfase se provoca acelerando o frenando el reloj (su `playbackRate`):
// crece de a poco, sin seeks de la prueba ni eventos del reloj, así que el
// componente decide sobre el desfase que ve y la prueba registra con cuál
// lo hizo. Solo `videosApi` se simula: devuelve la ruta del medio tal cual.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { executableSuffix, targetTriple } from '../target-triple.mjs'
import { withChrome } from './chrome-session.mjs'

const chrome =
  process.argv[2] ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const triple = targetTriple()
// El mismo binario que Rust inyecta en `binaryPaths.ffmpeg` (ADR-0026).
const ffmpeg = fileURLToPath(
  new URL(
    `../../src-tauri/binaries/ffmpeg-${triple}${executableSuffix(triple)}`,
    import.meta.url,
  ),
)
const root = await mkdtemp(join(tmpdir(), 'vimo-clip-preview-'))
const mocks = {
  '@/modules/videos/api':
    'export const videosApi = { videoSource: (path) => path, imageSource: (path) => path }',
}
const entry = String.raw`
import React from 'react'
import { createRoot } from 'react-dom/client'
import { EditorVisualFrame } from '@/modules/videos/components/EditorVisualFrame'
import { timelineBlocks } from '@/modules/videos/utilities/timelineBlocks'

const CLIP = new URL('./clip.mp4', location.href).href
const CLOCK = new URL('./clock.wav', location.href).href
const check = (condition, message) => { if (!condition) throw new Error(message) }
const sleep = (milliseconds) => new Promise(resolve => setTimeout(resolve, milliseconds))
const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve))
function once(target, type) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('sin ' + type)), 10000)
    target.addEventListener(type, () => { clearTimeout(timer); resolve() }, { once: true })
  })
}
async function waitFor(get, message, attempts = 200) {
  for (let index = 0; index < attempts; index++) { const value = get(); if (value) return value; await sleep(25) }
  throw new Error(message)
}
const median = (values) => [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)]
const round = (value) => Math.round(value * 1000) / 1000

// Lo que el componente le hace al <video>: cada velocidad que fija y cada
// seek, con el desfase que tenía al pedirlo (adónde va menos dónde estaba).
const writes = []
const media = HTMLMediaElement.prototype
const currentTime = Object.getOwnPropertyDescriptor(media, 'currentTime')
const playbackRate = Object.getOwnPropertyDescriptor(media, 'playbackRate')
Object.defineProperty(media, 'currentTime', {
  configurable: true,
  get() { return currentTime.get.call(this) },
  set(value) {
    if (this.tagName === 'VIDEO') writes.push({ kind: 'seek', at: performance.now(), gap: value - currentTime.get.call(this) })
    currentTime.set.call(this, value)
  },
})
Object.defineProperty(media, 'playbackRate', {
  configurable: true,
  get() { return playbackRate.get.call(this) },
  set(value) {
    if (this.tagName === 'VIDEO') writes.push({ kind: 'rate', at: performance.now(), value })
    playbackRate.set.call(this, value)
  },
})

// Una escena de 0 a slotSeconds con el clip de 10 s: de avatar lista y al
// día, o con un clip de Kie listo. El bloque sale de timelineBlocks y el
// visor decide con playableClip, como en el editor.
function blockOf(kind, slotSeconds) {
  const scene = { id: 1, text: 'fixture', imageStatus: 'ok', startSeconds: 0, endSeconds: slotSeconds }
  if (kind === 'avatar')
    scene.avatar = { lookId: 'look', lookName: 'Look', lookType: 'photo_avatar', engine: 'avatar_iii', origin: 'auto', status: 'ready', clipPath: CLIP, clipMtimeMs: 1, normalizedSeconds: 10 }
  else
    scene.animation = { id: 'clip-1', provider: 'kie', status: 'ready', sceneIds: [1], slotSeconds, normalizedSeconds: slotSeconds, clipPath: CLIP, clipMtimeMs: 1 }
  const [block] = timelineBlocks([scene], {})
  check(block?.kind === (kind === 'avatar' ? 'avatar' : 'clip'), 'bloque de ' + kind)
  return block
}

let renderError
// Como en el editor: el bloque se monta en pausa, pasa a reproducir y el
// reloj arranca. Al llegar el reloj al segundo 1 empieza la perturbación:
// 'ramp' acelera (rate > 1, el clip se atrasa) o frena (rate < 1, se
// adelanta) el reloj hasta que el desfase llega a 'to' o el componente actúa
// (un seek o una espera); 'jumpTo' salta el reloj. Después se mide 0,8 s más.
async function play({ name, kind, slotSeconds, ramp, jumpTo }) {
  writes.length = 0
  const holder = document.createElement('div')
  document.body.append(holder)
  const clock = document.createElement('audio')
  clock.muted = true
  clock.preload = 'auto'
  const clockReady = once(clock, 'canplaythrough')
  clock.src = CLOCK
  document.body.append(clock)
  await clockReady
  const root = createRoot(holder, { onUncaughtError: (error) => { renderError = error } })
  const block = blockOf(kind, slotSeconds)
  const clockRef = { current: clock }
  const render = (playing) => root.render(<EditorVisualFrame block={block} sceneIndex={0} offsetSeconds={0} versions={{}} playing={playing} clockRef={clockRef} onClick={() => {}} />)
  try {
    render(false)
    const video = await waitFor(() => { if (renderError) throw renderError; return holder.querySelector('video') }, name + ': el visor no montó el <video>')
    if (video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) await once(video, 'canplay')
    render(true)
    await sleep(100)
    const started = performance.now()
    await clock.play()
    // Desfase del clip respecto del reloj, en segundos del tramo: positivo
    // = el clip va atrás.
    const lag = (sample) => sample.clock - sample.video / sample.rate
    const samples = []
    let perturbedAt = null
    let settledFrom = null
    while (settledFrom === null || performance.now() < settledFrom + 800) {
      await nextFrame()
      if (renderError) throw renderError
      check(performance.now() - started < 15000, name + ': el reloj no avanzó')
      // Si el reloj se detiene (la máquina saturada), el componente pausa el
      // video a propósito: esos cuadros no cuentan como espera ni como fuera
      // de sincronía.
      const sample = { at: performance.now(), clock: clock.currentTime, video: video.currentTime, rate: video.playbackRate, paused: video.paused, seeking: video.seeking, clockRunning: !clock.paused && clock.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA }
      samples.push(sample)
      if (perturbedAt === null) {
        if (clock.currentTime < 1) continue
        perturbedAt = sample.at
        if (jumpTo !== undefined) clock.currentTime = jumpTo
        if (ramp) clock.playbackRate = ramp.rate
        else settledFrom = sample.at
        continue
      }
      if (settledFrom !== null) continue
      const acted = writes.some(write => write.kind === 'seek' && write.at > perturbedAt) || (sample.paused && !sample.seeking)
      if (!acted && Math.sign(ramp.to) * lag(sample) < Math.abs(ramp.to)) continue
      clock.playbackRate = 1
      settledFrom = sample.at
    }
    const from = perturbedAt ?? started
    const seeks = writes.filter(write => write.kind === 'seek' && write.at > from)
    const firstSeek = seeks[0]?.at ?? Infinity
    const before = samples.filter(sample => sample.at > from && sample.at < firstSeek)
    const settled = samples.filter(sample => sample.at > settledFrom + 300)
    const last = samples[samples.length - 1]
    return {
      name,
      rates: [...new Set(samples.map(sample => sample.rate))],
      rateWrites: writes.filter(write => write.kind === 'rate').map(write => write.value),
      seekGaps: seeks.map(seek => seek.gap),
      // El mayor atraso que hubo sin que el componente lo corrigiera.
      lagBeforeSeek: before.length ? round(Math.max(...before.map(lag))) : NaN,
      held: samples.filter(sample => sample.at > from && sample.paused && !sample.seeking && sample.clockRunning).length,
      settledLag: settled.length ? round(median(settled.map(lag))) : NaN,
      endLag: round(lag(last)),
      endPaused: last.paused && last.clockRunning,
    }
  } finally {
    clock.playbackRate = 1
    clock.pause()
    root.unmount()
    holder.remove()
    clock.remove()
  }
}

const describe = (run) => JSON.stringify(run)
const onlyRateOne = (run) => run.rates.every(rate => rate === 1) && run.rateWrites.every(rate => rate === 1)
const inSync = (run) => Math.abs(run.endLag) < 0.12 && !run.endPaused
try {
  // En el editor la narración suena después de un clic de la persona; sin ese
  // gesto Chrome no deja reproducir un <audio>, ni mudo. La prueba lo da por
  // CDP apenas carga la página.
  await waitFor(() => navigator.userActivation.hasBeenActive, 'sin el clic que habilita el sonido', 400)
  // La primera vez que suena, Chrome tarda en abrir la salida de audio y el
  // reloj queda quieto aunque ya no esté en pausa: se abre antes de medir.
  const warmUp = document.createElement('audio')
  warmUp.muted = true
  const warmUpReady = once(warmUp, 'canplaythrough')
  warmUp.src = CLOCK
  await warmUpReady
  await warmUp.play()
  await waitFor(() => warmUp.currentTime > 0.3, 'el reloj de prueba no avanzó')
  warmUp.pause()
  warmUp.remove()

  // (a) Velocidad: el clip dura 10 s y el tramo 8 s. Kie se acelera para
  // entrar; el avatar corre a 1 en todas las corridas de abajo.
  const kieRate = await play({ name: 'kie, velocidad', kind: 'kie', slotSeconds: 8 })
  check(kieRate.rates.includes(1.25) && kieRate.rateWrites.includes(1.25), 'Kie no se aceleró a 1,25 para entrar en su tramo: ' + describe(kieRate))

  // (b) y (c) Atrasado: el reloj se acelera hasta 0,18 s de atraso. El
  // avatar no hace nada por debajo de 0,12 s y al pasarlo corrige con un
  // solo seek; Kie pasa los 0,18 s sin moverse.
  const behind = await play({ name: 'avatar, atraso', kind: 'avatar', slotSeconds: 8, ramp: { rate: 1.5, to: 0.18 } })
  check(onlyRateOne(behind), 'el avatar no corrió a velocidad 1: ' + describe(behind))
  // Que el atraso creció sin corrección lo fija el primer seek (más de
  // 0,12 s y uno solo); esto solo descarta un seek temprano, con margen para
  // la cadencia de cuadros (el mínimo medido es 0,100).
  check(behind.lagBeforeSeek >= 0.06, 'el atraso no creció sin corrección antes del seek: ' + describe(behind))
  check(behind.seekGaps.length === 1, 'el avatar no corrigió el atraso con un solo seek: ' + describe(behind))
  check(behind.seekGaps[0] > 0.12 && behind.seekGaps[0] < 0.2, 'el avatar no corrigió apenas pasó 0,12 s: ' + describe(behind))
  check(inSync(behind), 'el avatar no volvió al reloj tras corregir: ' + describe(behind))
  const kieBehind = await play({ name: 'kie, atraso', kind: 'kie', slotSeconds: 10, ramp: { rate: 1.5, to: 0.18 } })
  check(kieBehind.seekGaps.length === 0, 'Kie corrigió un atraso menor a 0,3 s: ' + describe(kieBehind))
  check(kieBehind.settledLag > 0.12 && kieBehind.settledLag < 0.3, 'el atraso de Kie no quedó entre 0,12 y 0,3 s: ' + describe(kieBehind))

  // El reloj salta (un clic adelante en el timeline mientras suena): un
  // único seek, sin cadena de correcciones.
  const jump = await play({ name: 'avatar, salto del reloj', kind: 'avatar', slotSeconds: 8, jumpTo: 5 })
  check(onlyRateOne(jump), 'el avatar no corrió a velocidad 1: ' + describe(jump))
  check(jump.seekGaps.length === 1, 'un salto del reloj no fue un único seek: ' + describe(jump))
  check(inSync(jump), 'el avatar no siguió al reloj tras el salto: ' + describe(jump))

  // (d) Adelantado: el reloj se frena hasta 0,18 s de adelanto. El avatar
  // espera en pausa, sin volver atrás; Kie sigue de largo.
  const ahead = await play({ name: 'avatar, adelanto', kind: 'avatar', slotSeconds: 8, ramp: { rate: 0.5, to: -0.18 } })
  check(onlyRateOne(ahead), 'el avatar no corrió a velocidad 1: ' + describe(ahead))
  check(ahead.seekGaps.length === 0, 'el avatar volvió atrás en vez de esperar: ' + describe(ahead))
  check(ahead.held >= 2, 'el avatar no esperó al reloj: ' + describe(ahead))
  check(inSync(ahead), 'el avatar no retomó tras esperar: ' + describe(ahead))
  const kieAhead = await play({ name: 'kie, adelanto', kind: 'kie', slotSeconds: 10, ramp: { rate: 0.5, to: -0.18 } })
  check(kieAhead.held === 0 && kieAhead.seekGaps.length === 0, 'Kie frenó un adelanto menor a 0,3 s: ' + describe(kieAhead))
  check(kieAhead.settledLag < -0.12 && kieAhead.settledLag > -0.3, 'el adelanto de Kie no quedó entre 0,12 y 0,3 s: ' + describe(kieAhead))

  document.getElementById('result').textContent = 'PASS: clip preview (6 corridas) — avatar a velocidad 1 (Kie a 1,25); sin seek hasta ' + behind.lagBeforeSeek + ' s de atraso y un solo seek al pasar 0,12 s (' + round(behind.seekGaps[0]) + ' s), Kie quieto con ' + kieBehind.settledLag + ' s; salto del reloj: 1 seek; adelantado: el avatar espera ' + ahead.held + ' cuadros, Kie sigue con ' + kieAhead.settledLag + ' s'
} catch (error) {
  const render = renderError && renderError !== error ? ' (render error: ' + renderError.message + ')' : ''
  document.getElementById('result').textContent = 'FAIL: ' + error.message + render
}
`

function generate(args) {
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', ...args])
}

try {
  // 10 s a 25 fps con un cuadro clave por segundo, como el clip normalizado
  // del avatar (tarea 7); 640×360 para que decodificar sea barato.
  generate([
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=640x360:rate=25:duration=10',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '23',
    '-g',
    '25',
    '-keyint_min',
    '25',
    '-sc_threshold',
    '0',
    '-pix_fmt',
    'yuv420p',
    '-an',
    '-movflags',
    '+faststart',
    '-y',
    join(root, 'clip.mp4'),
  ])
  // El reloj: 15 s de silencio, como la narración del editor.
  generate([
    '-f',
    'lavfi',
    '-i',
    'anullsrc=r=48000:cl=mono',
    '-t',
    '15',
    '-c:a',
    'pcm_s16le',
    '-y',
    join(root, 'clock.wav'),
  ])
  const output = await build({
    stdin: { contents: entry, resolveDir: resolve('.'), loader: 'jsx' },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    tsconfig: 'tsconfig.app.json',
    define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [
      {
        name: 'api-fixtures',
        setup(plugin) {
          plugin.onResolve({ filter: /^@\// }, (args) =>
            mocks[args.path]
              ? { path: args.path, namespace: 'fixture' }
              : undefined,
          )
          plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({
            contents: mocks[args.path],
            loader: 'js',
          }))
        },
      },
    ],
  })
  await writeFile(join(root, 'app.js'), output.outputFiles[0].contents)
  await writeFile(
    join(root, 'index.html'),
    '<!doctype html><meta charset="utf-8"><div id="root"></div><pre id="result">RUNNING</pre><script type="module" src="./app.js"></script>',
  )
  await withChrome(chrome, join(root, 'profile'), async (call) => {
    const { targetId } = await call('Target.createTarget', {
      url: pathToFileURL(join(root, 'index.html')).href,
    })
    const { sessionId } = await call('Target.attachToTarget', {
      targetId,
      flatten: true,
    })
    const evaluate = async (expression) => {
      const response = await call(
        'Runtime.evaluate',
        { expression, returnByValue: true },
        sessionId,
      )
      return response.result?.value
    }
    // El clic que habilita el sonido, en la página del guard: la pestaña nace
    // en un about:blank que ya está «complete», y un clic ahí no le cuenta al
    // documento que carga después. Se da cuando existe #result (solo está en
    // la página del guard) y se repite hasta que el documento lo registra.
    for (let attempt = 0; attempt < 40; attempt++) {
      if (await evaluate('navigator.userActivation.hasBeenActive')) break
      if (await evaluate('document.getElementById("result") !== null')) {
        for (const type of ['mousePressed', 'mouseReleased'])
          await call(
            'Input.dispatchMouseEvent',
            { type, x: 5, y: 5, button: 'left', clickCount: 1 },
            sessionId,
          )
      }
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    // Las corridas duran unos 15 s y cada llamada por CDP corta a los 20:
    // se consulta el resultado en tandas cortas.
    let status
    for (let attempt = 0; attempt < 240; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 500))
      status = await evaluate('document.getElementById("result")?.textContent')
      if (status && status !== 'RUNNING') break
    }
    assert.ok(status?.startsWith('PASS:'), status ?? 'FAIL: sin resultado')
    process.stdout.write(status + '\n')
  })
} finally {
  await rm(root, { recursive: true, force: true, maxRetries: 3 })
}
