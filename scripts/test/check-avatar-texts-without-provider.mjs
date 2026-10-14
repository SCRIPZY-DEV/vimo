// Guard de los textos de avatares sin el nombre del proveedor (pedido del
// dueño del 2026-10-11, spec §20 y R-2d-3 de la entrega 2d): lo que la app le
// dice a la persona sobre avatares —mensajes, avisos, etiquetas, ayudas— no
// menciona a HeyGen. El nombre queda solo donde identifica una clave (la
// pantalla de Claves API) o nombra el borrado en el servicio externo
// («Eliminar permanentemente de HeyGen»). Se corre con
// `node --test scripts/test/check-avatar-texts-without-provider.mjs`.
//
// Carga los tres catálogos `public/locales/{es,en,pt}.json`, aplana sus claves
// y falla si el VALOR de una clave nombra al proveedor —en cualquier mayúscula
// o minúscula, también «Hey Gen» o «hey-gen»— y esa clave no está en ALLOWED.
// El NOMBRE de una clave no cuenta: `avatars.eliminar.deHeygen` es un
// identificador, no un texto.
//
// Dos reglas más mantienen honesta la lista, porque una permitida que ya no
// hace falta dejaría pasar mañana su vuelta: (1) cada clave de ALLOWED debe
// seguir existiendo y nombrando a HeyGen en los tres idiomas; si se borra o se
// reescribe sin el nombre, sale de la lista en el mismo cambio; y (2) el
// detector se prueba a sí mismo con catálogos adulterados en memoria (un
// mutante), así que una regex rota o un aplanado que se salta ramas lo hace
// fallar en vez de dejarlo pasar en vacío.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const LOCALES = ['es', 'en', 'pt']

// El nombre en cualquier mayúscula o minúscula, con un separador opcional en
// medio («Hey Gen», «hey-gen»). El borde inicial evita falsos positivos como
// «they generate».
const PROVIDER_NAME = /\bhey[\s_.-]?gen/i

// Las únicas claves cuyo valor nombra a HeyGen, con el porqué de cada una.
// Agregar una exige una razón de este tipo (Claves API o el borrado en
// HeyGen); para un texto de avatares común la salida es reescribirlo con «el
// servicio de avatares», «tu saldo de avatares» o «la clave del avatar
// presentador».
const ALLOWED = new Map([
  // Claves API: el nombre identifica la clave que se carga.
  ['apiKeys.categoria.avatar', 'Claves API: identifica la clave'],
  // El borrado permanente en HeyGen: la opción, su confirmación y el aviso.
  ['avatars.eliminar.deHeygen', 'borrado en HeyGen: la opción'],
  ['avatars.eliminar.confirmarHeygen', 'borrado en HeyGen: la confirmación'],
  ['avatars.toasts.eliminadoHeygen', 'borrado en HeyGen: el aviso'],
])

// [['a.b', valor], ...]: recorre objetos anidados y arreglos.
function flatten(node, prefix = '') {
  return Object.entries(node).flatMap(([key, value]) =>
    value !== null && typeof value === 'object'
      ? flatten(value, `${prefix}${key}.`)
      : [[`${prefix}${key}`, value]],
  )
}

function loadCatalog(locale) {
  const url = new URL(`../../public/locales/${locale}.json`, import.meta.url)
  return Object.fromEntries(flatten(JSON.parse(readFileSync(url, 'utf8'))))
}

function keysNamingProvider(catalog) {
  return Object.entries(catalog)
    .filter(
      ([, value]) => typeof value === 'string' && PROVIDER_NAME.test(value),
    )
    .map(([key]) => key)
}

// Las claves que nombran al proveedor y no están permitidas.
function unlistedMentions(catalog, allowed = ALLOWED) {
  return keysNamingProvider(catalog).filter((key) => !allowed.has(key))
}

// Las permitidas que ya no existen o ya no nombran al proveedor.
function staleAllowances(catalog, allowed = ALLOWED) {
  const naming = new Set(keysNamingProvider(catalog))
  return [...allowed.keys()].filter((key) => !naming.has(key))
}

function without(catalog, name) {
  return Object.fromEntries(
    Object.entries(catalog).filter(([key]) => key !== name),
  )
}

for (const locale of LOCALES) {
  const catalog = loadCatalog(locale)

  test(`${locale}: ningún texto nombra a HeyGen fuera de la lista permitida`, () => {
    const offenders = unlistedMentions(catalog).map(
      (key) => `${key}: ${catalog[key]}`,
    )
    assert.deepEqual(
      offenders,
      [],
      'Estos textos nombran a HeyGen. Reescribilos con «el servicio de avatares», «tu saldo de avatares» o «la clave del avatar presentador»; si el nombre es legítimo (Claves API o el borrado en HeyGen), sumá la clave a ALLOWED con su porqué.',
    )
  })

  test(`${locale}: la lista permitida solo guarda claves que siguen nombrando a HeyGen`, () => {
    assert.deepEqual(
      staleAllowances(catalog),
      [],
      'Estas claves de ALLOWED ya no existen o ya no nombran a HeyGen: sacalas de la lista en el mismo cambio.',
    )
  })
}

test('el detector reconoce el nombre en cualquier mayúscula, minúscula y separador', () => {
  const spellings = [
    'HeyGen',
    'heygen',
    'HEYGEN',
    'hEyGeN',
    'Hey Gen',
    'hey-gen',
    'hey_gen',
    'hey.gen',
    'Eliminar de HeyGen',
    "HeyGen's",
    'da HeyGen',
  ]
  for (const text of spellings) {
    assert.match(text, PROVIDER_NAME, text)
  }
})

test('el detector no marca lo que no nombra al proveedor', () => {
  const clean = [
    'Avatar III',
    'el servicio de avatares',
    'Tu saldo de avatares',
    'they generate the avatar',
    'Hey, genial',
    'hey',
    'Gen',
  ]
  for (const text of clean) {
    assert.doesNotMatch(text, PROVIDER_NAME, text)
  }
})

test('aplanar recorre objetos anidados y arreglos', () => {
  assert.deepEqual(flatten({ a: { b: 'x' }, c: ['y', 'z'], d: 'w' }), [
    ['a.b', 'x'],
    ['c.0', 'y'],
    ['c.1', 'z'],
    ['d', 'w'],
  ])
})

test('mutante: una clave nueva que nombra a HeyGen hace fallar al guard, escrita como se escriba', () => {
  const spellings = ['HeyGen', 'heygen', 'HEYGEN', 'Hey Gen', 'hey-gen']
  for (const locale of LOCALES) {
    for (const spelling of spellings) {
      const mutant = {
        ...loadCatalog(locale),
        'avatars.errors.mutante': `El servicio ${spelling} no respondió.`,
      }
      assert.ok(
        unlistedMentions(mutant).includes('avatars.errors.mutante'),
        `${locale} / ${spelling}`,
      )
    }
  }
})

test('mutante: una permitida que se reescribe sin el nombre o se borra queda marcada como vieja', () => {
  const name = 'avatars.toasts.eliminadoHeygen'
  for (const locale of LOCALES) {
    const catalog = loadCatalog(locale)
    assert.ok(
      staleAllowances({
        ...catalog,
        [name]: 'Se eliminó de tu lista.',
      }).includes(name),
      `${locale}: reescrita`,
    )
    assert.ok(
      staleAllowances(without(catalog, name)).includes(name),
      `${locale}: borrada`,
    )
  }
})

test('las claves permitidas no se marcan como menciones de más', () => {
  const allowedOnly = {
    'apiKeys.categoria.avatar': 'avatar presentador (HeyGen)',
    'avatars.eliminar.deHeygen': 'Eliminar permanentemente de HeyGen',
  }
  assert.deepEqual(unlistedMentions(allowedOnly), [])
})
