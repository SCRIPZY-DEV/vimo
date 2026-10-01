// El pedido y la respuesta del agente reconstructor (spec §6.1) del lado de la
// app, los límites de la gema por secciones (spec §4.1) y la regla de un solo
// pedido en vuelo por clave (el doble clic en «Preparar con IA»). Módulos puros
// de src/ corridos con Node (type stripping), sin bundler ni red.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  cleanGemSections,
  GEM_SECTION_KEYS,
  GEM_SECTION_LIMITS,
  GEM_TEMPLATE_VERSION,
  GEM_TOTAL_CHAR_LIMIT,
  gemRebuildRequest,
  gemSectionsLength,
  gemSectionsWithinLimits,
  readGemRebuildResponse,
} from '../../src/modules/videos/utilities/gemTemplate.ts'
import { createSingleFlight } from '../../src/modules/videos/utilities/singleFlight.ts'

const VALID_RESPONSE = {
  templateVersion: 1,
  sections: {
    visualStyle: '  Acuarela editorial, tinta suelta.  ',
    character: 'A tall woman with short gray hair. Outfit: a green raincoat.',
    dynamism: '',
    rules: '   ',
  },
  suggestions: {
    allowedModes: ['generic', 'own', 'none'],
    characterMode: 'generic',
  },
  warnings: ['La gema pedía escribir en español: se quitó.'],
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

test('orden, versión y límites de la spec §4.1', () => {
  assert.deepEqual(GEM_SECTION_KEYS, [
    'visualStyle',
    'character',
    'dynamism',
    'camera',
    'rules',
    'promptStart',
    'promptEnd',
  ])
  assert.equal(GEM_TEMPLATE_VERSION, 1)
  assert.deepEqual(GEM_SECTION_LIMITS, {
    visualStyle: 12_000,
    character: 700,
    dynamism: 12_000,
    camera: 12_000,
    rules: 12_000,
    promptStart: 600,
    promptEnd: 600,
  })
  assert.equal(GEM_TOTAL_CHAR_LIMIT, 30_000)
})

test('el pedido lleva la gema sin bordes, el origen, la versión y el idioma', () => {
  assert.deepEqual(
    gemRebuildRequest('  mi gema  ', 'mi-estilo', '0.9.0', 'es'),
    {
      text: 'mi gema',
      origin: 'mi-estilo',
      appVersion: '0.9.0',
      locale: 'es',
    },
  )
  assert.equal(gemRebuildRequest('g', 'migracion', '0.9.0', 'pt').locale, 'pt')
  assert.equal(
    gemRebuildRequest('g', 'migracion', '0.9.0', 'pt-BR').locale,
    'pt',
  )
})

test('un idioma fuera de es/en/pt, o ninguno, pide los avisos en inglés', () => {
  for (const language of [undefined, 'fr', 'en', 'EN-us'])
    assert.equal(
      gemRebuildRequest('g', 'mi-estilo', '0.9.0', language).locale,
      'en',
    )
})

test('cleanGemSections: sin bordes y sin opcionales vacías', () => {
  assert.deepEqual(
    cleanGemSections({ visualStyle: ' a ', character: '  ', camera: ' b ' }),
    { visualStyle: 'a', camera: 'b' },
  )
  assert.deepEqual(cleanGemSections({ visualStyle: '   ' }), {
    visualStyle: '',
  })
})

test('una respuesta válida sale con las secciones limpias', () => {
  assert.deepEqual(readGemRebuildResponse(VALID_RESPONSE), {
    templateVersion: 1,
    sections: {
      visualStyle: 'Acuarela editorial, tinta suelta.',
      character: 'A tall woman with short gray hair. Outfit: a green raincoat.',
    },
    suggestions: {
      allowedModes: ['generic', 'own', 'none'],
      characterMode: 'generic',
    },
    warnings: ['La gema pedía escribir en español: se quitó.'],
  })
})

test('claves de sección desconocidas y secciones null se ignoran', () => {
  const body = {
    ...VALID_RESPONSE,
    sections: { visualStyle: 'x', inventada: 'y', camera: null },
  }
  assert.deepEqual(readGemRebuildResponse(body)?.sections, { visualStyle: 'x' })
})

test('sin cuerpo, de otra versión, sin visualStyle o con una sección que no es texto: null', () => {
  const invalid = [
    null,
    'texto',
    { ...VALID_RESPONSE, templateVersion: 2 },
    { ...VALID_RESPONSE, templateVersion: '1' },
    { ...VALID_RESPONSE, sections: undefined },
    { ...VALID_RESPONSE, sections: { character: 'x' } },
    { ...VALID_RESPONSE, sections: { visualStyle: '   ' } },
    { ...VALID_RESPONSE, sections: { visualStyle: 'x', rules: 42 } },
  ]
  for (const body of invalid) assert.equal(readGemRebuildResponse(body), null)
})

test('una respuesta que pasa los límites no se usa', () => {
  const longCharacter = { visualStyle: 'x', character: 'a'.repeat(701) }
  assert.equal(
    readGemRebuildResponse({ ...VALID_RESPONSE, sections: longCharacter }),
    null,
  )
  const longTotal = {
    visualStyle: 'a'.repeat(12_000),
    dynamism: 'b'.repeat(12_000),
    camera: 'c'.repeat(6_001),
  }
  assert.equal(gemSectionsLength(longTotal), 30_001)
  assert.equal(
    readGemRebuildResponse({ ...VALID_RESPONSE, sections: longTotal }),
    null,
  )
  assert.equal(
    gemSectionsWithinLimits({ ...longTotal, camera: 'c'.repeat(6_000) }),
    true,
  )
})

test('avisos y sugerencias tolerantes: lo que no sirve se descarta', () => {
  const body = {
    ...VALID_RESPONSE,
    suggestions: {
      allowedModes: ['generic', 'otro', 3],
      characterMode: 'nadie',
    },
    warnings: ['a', ' a ', '', 7, 'b'],
  }
  const response = readGemRebuildResponse(body)
  assert.deepEqual(response?.suggestions, { allowedModes: ['generic'] })
  assert.deepEqual(response?.warnings, ['a', 'b'])
  const bare = {
    ...VALID_RESPONSE,
    suggestions: undefined,
    warnings: undefined,
  }
  assert.deepEqual(readGemRebuildResponse(bare)?.suggestions, {})
  assert.deepEqual(readGemRebuildResponse(bare)?.warnings, [])
})

test('una sola ejecución en vuelo por clave (doble clic)', async () => {
  const flights = createSingleFlight()
  const pending = deferred()
  let calls = 0
  const task = () => {
    calls += 1
    return pending.promise
  }
  const first = flights.run('st-1', task)
  const second = flights.run('st-1', task)
  assert.equal(first, second)
  pending.resolve('secciones')
  assert.deepEqual(await Promise.all([first, second]), [
    'secciones',
    'secciones',
  ])
  assert.equal(calls, 1)
})

test('al terminar, bien o mal, la clave queda libre para otro intento', async () => {
  const flights = createSingleFlight()
  const failing = deferred()
  const first = flights.run('st-1', () => failing.promise)
  failing.reject(new Error('sin red'))
  await assert.rejects(first, /sin red/)
  assert.equal(await flights.run('st-1', async () => 'reintento'), 'reintento')
})

test('claves distintas corren a la vez', async () => {
  const flights = createSingleFlight()
  let calls = 0
  const task = async () => {
    calls += 1
    return calls
  }
  await Promise.all([flights.run('st-1', task), flights.run('st-2', task)])
  assert.equal(calls, 2)
})
