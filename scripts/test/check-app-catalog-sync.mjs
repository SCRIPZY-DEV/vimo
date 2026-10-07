// La sincronización del catálogo remoto en la app (Entrega 3, ADR-0049, plan
// E3 tarea C1): cuándo se sincroniza, qué se hace con la respuesta de
// vimo.click, de dónde sale cada muestra y qué pasa con un estilo elegido que
// desaparece del catálogo. Módulos puros de src/ corridos con Node (type
// stripping), sin bundler.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  catalogSampleSources,
  catalogSyncEnabled,
  catalogSyncStep,
  readCatalogManifestResponse,
  samplesOriginOf,
  selectedCatalogStyleListed,
} from '../../src/modules/videos/utilities/catalogSync.ts'

const CONTENT = {
  name: { es: 'Tiza', en: 'Chalk', pt: 'Giz' },
  tags: [],
  sections: { visualStyle: 'Chalk drawings on a blackboard.' },
  templateVersion: 1,
  allowedModes: ['generic', 'own', 'none'],
  sampleMode: 'generic',
  colorFilter: 'none',
  samples: { revision: 1, count: 4 },
}

const MANIFEST = {
  version: 'a1b2c3d4e5f60718',
  samplesBaseUrl:
    'https://proyecto.supabase.co/storage/v1/object/public/previews-gemas',
  styles: [{ id: 'tiza', position: 0, version: 1, content: CONTENT }],
}

test('el catálogo remoto vale solo con los dos interruptores encendidos', () => {
  assert.equal(
    catalogSyncEnabled({ newCatalog: true, remoteCatalog: true }),
    true,
  )
  assert.equal(
    catalogSyncEnabled({ newCatalog: false, remoteCatalog: true }),
    false,
  )
  assert.equal(
    catalogSyncEnabled({ newCatalog: true, remoteCatalog: false }),
    false,
  )
  assert.equal(
    catalogSyncEnabled({ newCatalog: false, remoteCatalog: false }),
    false,
  )
})

test('la respuesta del manifiesto se revisa: sin cambios, con cambios o inservible', () => {
  assert.deepEqual(
    readCatalogManifestResponse({ version: 'v1', sinCambios: true }),
    { version: 'v1', sinCambios: true },
  )
  assert.deepEqual(readCatalogManifestResponse(MANIFEST), MANIFEST)
  // Sin versión, con una URL que no es https, sin lista o con un estilo mal
  // formado, no se usa.
  for (const body of [
    null,
    'texto',
    { sinCambios: true },
    { version: '', sinCambios: true },
    { ...MANIFEST, samplesBaseUrl: 'http://inseguro' },
    { ...MANIFEST, styles: 'no' },
    { ...MANIFEST, styles: [{ id: 'tiza' }] },
    { ...MANIFEST, styles: [{ ...MANIFEST.styles[0], position: '0' }] },
    { ...MANIFEST, styles: [{ ...MANIFEST.styles[0], content: null }] },
  ])
    assert.equal(readCatalogManifestResponse(body), null, JSON.stringify(body))
})

test('sincroniza solo cuando la versión cambió', () => {
  assert.deepEqual(catalogSyncStep(null, { version: 'v1', sinCambios: true }), {
    kind: 'unchanged',
  })
  assert.deepEqual(catalogSyncStep(MANIFEST.version, MANIFEST), {
    kind: 'unchanged',
  })
  assert.deepEqual(catalogSyncStep(null, MANIFEST), {
    kind: 'sync',
    manifest: MANIFEST,
  })
  assert.deepEqual(catalogSyncStep('otra', MANIFEST), {
    kind: 'sync',
    manifest: MANIFEST,
  })
})

test('el origen permitido de descarga es el de la URL pública del bucket', () => {
  assert.equal(
    samplesOriginOf(MANIFEST.samplesBaseUrl),
    'https://proyecto.supabase.co',
  )
})

test('las muestras salen de disco si la gema las trae sincronizadas; si no, de la app', () => {
  const packaged = {
    id: 'tiza',
    sampleCount: 4,
  }
  assert.deepEqual(catalogSampleSources(packaged), [
    { kind: 'packaged', url: '/style-references/tiza_1.jpg' },
    { kind: 'packaged', url: '/style-references/tiza_2.jpg' },
    { kind: 'packaged', url: '/style-references/tiza_3.jpg' },
    { kind: 'packaged', url: '/style-references/tiza_4.jpg' },
  ])
  assert.deepEqual(catalogSampleSources({ id: 'tiza', sampleCount: 0 }), [])
  assert.equal(catalogSampleSources({ id: 'tiza', sampleCount: 9 }).length, 4)

  const synced = {
    id: 'tiza',
    sampleCount: 2,
    samples: [
      {
        file: 'sample-1.jpg',
        path: '/root/_catalog/tiza/s1/sample-1.jpg',
        mtimeMs: 5,
      },
      {
        file: 'sample-2.jpg',
        path: '/root/_catalog/tiza/s1/sample-2.jpg',
        mtimeMs: 6,
      },
    ],
  }
  assert.deepEqual(catalogSampleSources(synced), [
    { kind: 'synced', path: '/root/_catalog/tiza/s1/sample-1.jpg', mtimeMs: 5 },
    { kind: 'synced', path: '/root/_catalog/tiza/s1/sample-2.jpg', mtimeMs: 6 },
  ])
  // Una gema sincronizada con la tanda 0 no trae `samples`: usa las de la app.
  assert.equal(
    catalogSampleSources({ id: 'normal', sampleCount: 4 })[0].kind,
    'packaged',
  )
})

test('un estilo elegido que ya no está en el catálogo se detecta; una gema de Mi estilo no cuenta', () => {
  const gems = [{ id: 'tiza' }, { id: 'normal' }]
  assert.equal(
    selectedCatalogStyleListed({ catalogStyleId: 'tiza' }, gems),
    true,
  )
  assert.equal(
    selectedCatalogStyleListed({ catalogStyleId: 'borrado' }, gems),
    false,
  )
  assert.equal(
    selectedCatalogStyleListed({ catalogStyleId: undefined }, gems),
    true,
  )
  assert.equal(selectedCatalogStyleListed(null, gems), true)
})
