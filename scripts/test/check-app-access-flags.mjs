// Flags del veredicto de acceso (ADR-0006, ADR-0048): `admin` y los
// interruptores de salida se normalizan a false si faltan o llegan raros, y se
// recuerdan por correo para el modo sin red, igual que `demo`. También la
// lectura de un interruptor desde cualquier módulo, sin conocer el veredicto.
// Módulos puros de src/ corridos con Node (type stripping), sin bundler.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  accessFlagsFrom,
  normalizeAccessFeatures,
  parseRememberedAccess,
  serializeRememberedAccess,
} from '../../src/modules/auth/utilities/accessFlags.ts'
import { readAccessFeature } from '../../src/modules/common/utilities/readAccessFeature.ts'

const ALL_OFF = {
  demo: false,
  admin: false,
  features: { gemTemplate: false, newCatalog: false, aiStyleCreator: false },
}

test('un servidor viejo sin admin ni features deja todo apagado', () => {
  assert.deepEqual(accessFlagsFrom({}), ALL_OFF)
  assert.deepEqual(accessFlagsFrom({ demo: true }), { ...ALL_OFF, demo: true })
})

test('features incompleto: lo que falta cuenta como apagado', () => {
  assert.deepEqual(normalizeAccessFeatures({ gemTemplate: true }), {
    gemTemplate: true,
    newCatalog: false,
    aiStyleCreator: false,
  })
  assert.deepEqual(normalizeAccessFeatures({ newCatalog: true }), {
    gemTemplate: false,
    newCatalog: true,
    aiStyleCreator: false,
  })
  // El creador de estilo con IA (ADR-0050) tiene su propio interruptor.
  assert.deepEqual(normalizeAccessFeatures({ aiStyleCreator: true }), {
    gemTemplate: false,
    newCatalog: false,
    aiStyleCreator: true,
  })
  assert.deepEqual(normalizeAccessFeatures(undefined), {
    gemTemplate: false,
    newCatalog: false,
    aiStyleCreator: false,
  })
})

test('solo un true explícito enciende: strings, números o null no', () => {
  const off = { gemTemplate: false, newCatalog: false, aiStyleCreator: false }
  assert.deepEqual(
    normalizeAccessFeatures({
      gemTemplate: 'true',
      newCatalog: 1,
      aiStyleCreator: 'all',
    }),
    off,
  )
  assert.deepEqual(normalizeAccessFeatures(null), off)
  assert.deepEqual(normalizeAccessFeatures('all'), off)
  assert.equal(accessFlagsFrom({ admin: 'true' }).admin, false)
  assert.equal(accessFlagsFrom({ admin: true }).admin, true)
})

test('memoria: el mismo correo recupera sus flags; otro no hereda nada', () => {
  const flags = {
    demo: true,
    admin: true,
    features: { gemTemplate: true, newCatalog: false, aiStyleCreator: true },
  }
  const raw = serializeRememberedAccess('ana@example.com', flags)
  assert.deepEqual(parseRememberedAccess(raw, 'ana@example.com'), flags)
  assert.deepEqual(parseRememberedAccess(raw, 'otro@example.com'), ALL_OFF)
  assert.deepEqual(parseRememberedAccess(raw, null), ALL_OFF)
})

test('una memoria anterior a ADR-0048 (solo demo) sigue valiendo', () => {
  const legacy = JSON.stringify({ email: 'ana@example.com', demo: true })
  assert.deepEqual(parseRememberedAccess(legacy, 'ana@example.com'), {
    ...ALL_OFF,
    demo: true,
  })
})

test('memoria vacía, corrupta o con otra forma: todo apagado', () => {
  for (const raw of [null, '', '{', '"texto"', '42', 'null', '[]'])
    assert.deepEqual(parseRememberedAccess(raw, 'ana@example.com'), ALL_OFF)
})

test('readAccessFeature: solo un true explícito del veredicto enciende', () => {
  assert.equal(readAccessFeature(undefined, 'gemTemplate'), false)
  assert.equal(readAccessFeature(null, 'gemTemplate'), false)
  assert.equal(readAccessFeature({ authorized: true }, 'gemTemplate'), false)
  assert.equal(readAccessFeature({ features: null }, 'gemTemplate'), false)
  assert.equal(
    readAccessFeature({ features: { gemTemplate: 'true' } }, 'gemTemplate'),
    false,
  )
  assert.equal(
    readAccessFeature({ features: { gemTemplate: true } }, 'gemTemplate'),
    true,
  )
  assert.equal(
    readAccessFeature({ features: { gemTemplate: true } }, 'newCatalog'),
    false,
  )
  assert.equal(
    readAccessFeature({ features: { aiStyleCreator: true } }, 'aiStyleCreator'),
    true,
  )
})
