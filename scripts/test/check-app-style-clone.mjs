// La lógica pura del creador de estilo con IA en la app (ADR-0050): qué dice
// la tarjeta de un estilo sobre su origen. Módulos puros de src/ corridos con
// Node (type stripping), sin React ni Tauri.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { styleOriginLabelOf } from '../../src/modules/videos/utilities/styleOrigin.ts'

// ── De dónde salió un estilo ──

test('a copy of the catalog says which Vimo style it is based on', () => {
  assert.deepEqual(
    styleOriginLabelOf({
      kind: 'catalog',
      catalogStyleId: 'terror',
      name: 'Terror',
    }),
    { key: 'create.customStyles.basedOn', values: { name: 'Terror' } },
  )
})

test('a style cloned with AI says whether it came from a video or from images', () => {
  assert.deepEqual(
    styleOriginLabelOf({
      kind: 'ai-clone',
      source: 'youtube',
      videoUrl: 'https://www.youtube.com/watch?v=tBBhUn0D0I0',
    }),
    { key: 'create.customStyles.clonedFromVideo' },
  )
  assert.deepEqual(styleOriginLabelOf({ kind: 'ai-clone', source: 'images' }), {
    key: 'create.customStyles.clonedFromImages',
  })
})

test('a style the user wrote has no origin line', () => {
  assert.equal(styleOriginLabelOf(undefined), null)
})
