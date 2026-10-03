// `catalog-styles-list` (plan E2 §5.3): devuelve las gemas del catálogo tal
// cual, en el orden de la pestaña (las 5 de la casa primero), sin tocar el
// disco ni la red — las muestras viven en la app y `sampleCount` alcanza. El
// último caso corre el sidecar de verdad (`node pipeline/main.ts`) para fijar
// que main.ts despacha el subcomando: sin eso la app recibiría
// `unknown_subcommand`.

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { catalogStylesList } from '../../pipeline/commands/catalog/catalog-styles-list.ts'
import { catalogSubcommands } from '../../pipeline/commands/catalog/subcommands.ts'
import { resolvePipelineConfig } from '../../pipeline/config/pipeline-config.ts'
import { CATALOG_GEMS } from '../../pipeline/prompts/catalog-gems/catalog.ts'
import { VISUAL_STYLES } from '../../pipeline/prompts/visual-styles.ts'

const MAIN_FILE = fileURLToPath(
  new URL('../../pipeline/main.ts', import.meta.url),
)
const LEGACY_IDS = Object.keys(VISUAL_STYLES)

// Sin projectsRoot: si el subcomando mirara la galería, fallaría con
// missing_projects_root.
function context() {
  return {
    job: { jobId: 'fixture', apiKeys: {}, binaryPaths: {} },
    config: resolvePipelineConfig(),
    signal: new AbortController().signal,
    emitter: { emit() {} },
  }
}

// Lanza el sidecar con el job por stdin y devuelve sus eventos NDJSON.
function runSidecar(subcommand) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [MAIN_FILE, subcommand], {
      stdio: ['pipe', 'pipe', 'inherit'],
    })
    let output = ''
    child.stdout.on('data', (chunk) => {
      output += chunk
    })
    child.on('error', reject)
    child.on('close', () =>
      resolve(
        output
          .split('\n')
          .filter((line) => line.trim())
          .map((line) => JSON.parse(line)),
      ),
    )
    child.stdin.write(
      `${JSON.stringify({ jobId: 'guard', apiKeys: {}, binaryPaths: {} })}\n`,
    )
  })
}

test('the list returns the catalog gems untransformed and in the order of the tab', async () => {
  const { entries } = await catalogStylesList(context())
  assert.equal(entries.length, CATALOG_GEMS.length)
  for (const [index, entry] of entries.entries())
    assert.equal(entry, CATALOG_GEMS[index], `entry ${index}`)
  // Una copia de la lista: quien la reordene no toca el catálogo.
  assert.notEqual(entries, CATALOG_GEMS)
})

test('the five legacy styles come first', async () => {
  const { entries } = await catalogStylesList(context())
  const ids = entries.map((entry) => entry.id)
  assert.deepEqual(
    ids.slice(0, LEGACY_IDS.length).sort(),
    [...LEGACY_IDS].sort(),
  )
  assert.deepEqual(
    ids.slice(LEGACY_IDS.length).filter((id) => LEGACY_IDS.includes(id)),
    [],
  )
})

test('the list touches neither the network nor the gallery', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('the catalog list must not use the network')
  })
  const { entries } = await catalogStylesList(context())
  assert.equal(entries.length, CATALOG_GEMS.length)
  assert.equal(globalThis.fetch.mock.callCount(), 0)
})

test('the catalog domain registers the list', () => {
  assert.equal(catalogSubcommands['catalog-styles-list'], catalogStylesList)
})

test('the sidecar answers catalog-styles-list through main.ts', async () => {
  const events = await runSidecar('catalog-styles-list')
  const last = events.at(-1)
  assert.equal(last?.type, 'job-completed', JSON.stringify(last))
  assert.deepEqual(
    last.result.entries.map((entry) => entry.id),
    CATALOG_GEMS.map((gem) => gem.id),
  )
  assert.deepEqual(
    last.result.entries,
    JSON.parse(JSON.stringify(CATALOG_GEMS)),
  )
})
