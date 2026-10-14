// El módulo con el que el log de soporte archiva cada job (ADR-0038): por la
// primera palabra de `SUBCOMMAND_MODULE_KEYWORDS` que aparece en el
// subcomando. Un job que trabaja las escenas de un proyecto es de `videos`
// aunque su nombre empiece con `avatar` (ADR-0057: `avatar-render-scenes`
// lleva `projectId` y Rust ya lo registra como proyecto).
//
// Se recorren los subcomandos REALES, no una muestra escrita a mano: las
// claves de cada tabla de pipeline/commands/*/subcommands.ts (se importan las
// tablas, no se copian los nombres) más `ping`, que main.ts declara en línea
// (importar main.ts arrancaría el sidecar). Con esa lista se mide qué cambia
// de módulo al existir la palabra `scene`. Hoy son dos subcomandos; los que
// las entregas siguientes sumen a la lista real quedan bajo las mismas
// pruebas sin nombrarlos acá, y si alguno mezcla `scene` con otra familia el
// guard obliga a decidirlo (ver el comentario del tercer test).
// resolveDiagnosticModule importa '../constants' sin extensión: se empaqueta
// con esbuild y los alias de tsconfig.app.json, como check-timeline-layout.mjs.
import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const pipelineRoot = join(repoRoot, 'pipeline')
const commandsRoot = join(pipelineRoot, 'commands')
const SCENE_KEYWORD = 'scene'

let workdir
let diagnostics
let domains
let subcommands

// Los dominios con tabla de subcomandos (una carpeta de commands/ cada uno) y
// los nombres que registran, más `ping`.
async function readRealSubcommands() {
  const folders = await readdir(commandsRoot, { withFileTypes: true })
  const found = []
  const names = ['ping']
  for (const folder of folders.filter((entry) => entry.isDirectory())) {
    const folderPath = join(commandsRoot, folder.name)
    if (!(await readdir(folderPath)).includes('subcommands.ts')) continue
    const file = join(folderPath, 'subcommands.ts')
    const exports = await import(pathToFileURL(file).href)
    const tables = Object.values(exports).filter(
      (value) =>
        typeof value === 'object' &&
        value !== null &&
        Object.values(value).every((handler) => typeof handler === 'function'),
    )
    assert.equal(tables.length, 1, `${folder.name}: una tabla de subcomandos`)
    found.push(folder.name)
    names.push(...Object.keys(tables[0]))
  }
  return { domains: found.sort(), subcommands: names.sort() }
}

// Lo mismo que resuelve el resolutor, sobre una lista de palabras dada.
function resolveWith(keywords, subcommand) {
  const match = keywords.find(([keyword]) => subcommand.includes(keyword))
  return match ? match[1] : 'videos'
}

before(async () => {
  const output = await build({
    stdin: {
      contents: [
        "export * from './src/modules/diagnostics/utilities/resolveDiagnosticModule.ts'",
        "export { SUBCOMMAND_MODULE_KEYWORDS } from './src/modules/diagnostics/constants.ts'",
      ].join('\n'),
      resolveDir: repoRoot,
      sourcefile: 'diagnostic-module-entry.ts',
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    tsconfig: join(repoRoot, 'tsconfig.app.json'),
  })
  workdir = await mkdtemp(join(tmpdir(), 'diagnostic-module-guard-'))
  const file = join(workdir, 'diagnostic-module.mjs')
  await writeFile(file, output.outputFiles[0].contents)
  diagnostics = await import(pathToFileURL(file).href)
  ;({ domains, subcommands } = await readRealSubcommands())
})

after(async () => {
  if (workdir) await rm(workdir, { recursive: true, force: true })
})

test('la lista que se recorre es la que arma pipeline/main.ts', async () => {
  const main = await readFile(join(pipelineRoot, 'main.ts'), 'utf8')
  const wired = [
    ...main.matchAll(/from '\.\/commands\/([\w-]+)\/subcommands\.ts'/g),
  ]
    .map((match) => match[1])
    .sort()

  assert.deepEqual(domains, wired)
  assert.match(main, /async ping\(/)
  assert.equal(new Set(subcommands).size, subcommands.length)
  assert.ok(subcommands.includes('ping'))
  assert.ok(subcommands.includes('run-video-pipeline'))
})

test('el resolutor del guard coincide con el real en todos los subcomandos', () => {
  for (const subcommand of subcommands)
    assert.equal(
      resolveWith(diagnostics.SUBCOMMAND_MODULE_KEYWORDS, subcommand),
      diagnostics.resolveDiagnosticModule(subcommand),
      subcommand,
    )
})

// Tripwire a propósito: la palabra `scene` solo cambia de módulo a un
// subcomando que la mezcla con el nombre de otra familia (`avatar-…-scenes` cae
// en `videos` en vez de `avatars`). Hoy son dos: `avatar-render-scenes` y, desde
// la entrega 2g, `avatar-trim-scene` (el recorte de una aparición, que lleva
// `projectId`). Un subcomando nuevo con esa mezcla hace fallar este test; si el
// cambio de módulo es el querido (un job de escenas es del proyecto), se suma a
// la lista esperada, a mano.
test('la palabra scene mueve de módulo a avatar-render-scenes y avatar-trim-scene, y a ningún otro subcomando', () => {
  const withoutScene = diagnostics.SUBCOMMAND_MODULE_KEYWORDS.filter(
    ([keyword]) => keyword !== SCENE_KEYWORD,
  )
  assert.notEqual(
    withoutScene.length,
    diagnostics.SUBCOMMAND_MODULE_KEYWORDS.length,
    'la lista real tiene la palabra scene',
  )

  const moved = subcommands
    .map((subcommand) => ({
      subcommand,
      before: resolveWith(withoutScene, subcommand),
      after: diagnostics.resolveDiagnosticModule(subcommand),
    }))
    .filter(({ before, after }) => before !== after)

  assert.deepEqual(moved, [
    { subcommand: 'avatar-render-scenes', before: 'avatars', after: 'videos' },
    { subcommand: 'avatar-trim-scene', before: 'avatars', after: 'videos' },
  ])
})

test('todo subcomando real que trabaja escenas es del proyecto aunque se llame avatar-…', () => {
  const withScene = subcommands.filter((subcommand) =>
    subcommand.includes(SCENE_KEYWORD),
  )

  assert.ok(withScene.includes('avatar-render-scenes'))
  for (const subcommand of withScene)
    assert.equal(
      diagnostics.resolveDiagnosticModule(subcommand),
      'videos',
      subcommand,
    )
})

test('un ejemplo real de cada familia sigue en su módulo (muestra, no la lista entera)', () => {
  const expected = {
    'avatar-refresh': 'avatars',
    'avatars-list': 'avatars',
    'avatar-generate-look': 'avatars',
    'avatar-balance': 'avatars',
    'style-save': 'styles',
    'design-style-character': 'styles',
    'character-create': 'characters',
    'generate-music': 'music',
    'generate-voice': 'voices',
    'demo-prepare': 'demo',
    'set-project-music': 'videos',
    'run-video-pipeline': 'videos',
  }
  for (const [subcommand, module] of Object.entries(expected)) {
    assert.ok(subcommands.includes(subcommand), `${subcommand} es real`)
    assert.equal(
      diagnostics.resolveDiagnosticModule(subcommand),
      module,
      subcommand,
    )
  }
  assert.equal(diagnostics.resolveDiagnosticModule(null), 'videos')
})
