// El estado de interfaz del timeline por proyecto (ADR-0056): lo guardado se
// lee con tolerancia (JSON roto, ids desconocidos, pistas que faltan) y mover
// una pista conserva a las demás. timelineLayout.ts usa `@/` (las constantes
// de videos), así que se empaqueta con esbuild y los alias de
// tsconfig.app.json, como check-app-catalog-payload.mjs. Es el código real,
// sin fixtures.
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const DEFAULT_ORDER = ['scenes', 'narration', 'music']

let workdir
let layoutModule

before(async () => {
  const output = await build({
    stdin: {
      contents:
        "export * from './src/modules/videos/utilities/timelineLayout.ts'",
      resolveDir: repoRoot,
      sourcefile: 'timeline-layout-entry.ts',
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    tsconfig: join(repoRoot, 'tsconfig.app.json'),
  })
  workdir = await mkdtemp(join(tmpdir(), 'timeline-layout-guard-'))
  const file = join(workdir, 'timeline-layout.mjs')
  await writeFile(file, output.outputFiles[0].contents)
  layoutModule = await import(pathToFileURL(file).href)
})

after(async () => {
  if (workdir) await rm(workdir, { recursive: true, force: true })
})

test('sin nada guardado: el orden de siempre, nada silenciado ni bloqueado', () => {
  const layout = layoutModule.parseTimelineLayout(null)
  assert.deepEqual(layout.order, DEFAULT_ORDER)
  assert.deepEqual(layout.muted, {
    scenes: false,
    narration: false,
    music: false,
  })
  assert.deepEqual(layout.locked, {
    scenes: false,
    narration: false,
    music: false,
  })
})

test('un JSON roto o de otra forma cae al default', () => {
  for (const raw of ['{no es json', '42', '[]', 'null']) {
    assert.deepEqual(
      layoutModule.parseTimelineLayout(raw).order,
      DEFAULT_ORDER,
      raw,
    )
  }
})

test('conserva el orden guardado y completa las pistas que falten', () => {
  const layout = layoutModule.parseTimelineLayout(
    JSON.stringify({ order: ['music', 'scenes'] }),
  )
  assert.deepEqual(layout.order, ['music', 'scenes', 'narration'])
})

test('descarta ids desconocidos (una pista de otra versión) y repetidos', () => {
  const layout = layoutModule.parseTimelineLayout(
    JSON.stringify({
      order: ['avatar', 'music', 'music', 'scenes', 'narration'],
    }),
  )
  assert.deepEqual(layout.order, ['music', 'scenes', 'narration'])
})

test('silencio y candado solo cuentan como true explícito', () => {
  const layout = layoutModule.parseTimelineLayout(
    JSON.stringify({
      muted: { music: true, narration: 'yes' },
      locked: { scenes: true },
    }),
  )
  assert.deepEqual(layout.muted, {
    scenes: false,
    narration: false,
    music: true,
  })
  assert.deepEqual(layout.locked, {
    scenes: true,
    narration: false,
    music: false,
  })
})

test('mover una pista al lugar de otra conserva a las demás y no muta la entrada', () => {
  const order = ['scenes', 'narration', 'music']
  assert.deepEqual(layoutModule.moveTrack(order, 'music', 'scenes'), [
    'music',
    'scenes',
    'narration',
  ])
  assert.deepEqual(layoutModule.moveTrack(order, 'scenes', 'music'), [
    'narration',
    'music',
    'scenes',
  ])
  assert.equal(layoutModule.moveTrack(order, 'music', 'music'), order)
  assert.deepEqual(order, ['scenes', 'narration', 'music'])
})

test('la clave de storage lleva el id del proyecto', () => {
  assert.equal(
    layoutModule.timelineLayoutStorageKey('abc'),
    'vimo:editor:timeline:v1:abc',
  )
})

test('las pistas de audio son narración y música', () => {
  assert.equal(layoutModule.isAudioTrack('scenes'), false)
  assert.equal(layoutModule.isAudioTrack('narration'), true)
  assert.equal(layoutModule.isAudioTrack('music'), true)
})
