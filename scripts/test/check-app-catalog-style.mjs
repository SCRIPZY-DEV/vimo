// La pestaña Catálogo nueva (Entrega 2 del catálogo, plan E2 §5.4 y §5.5): la
// memoria del modo de personaje de cada estilo, el estilo elegido que guarda
// el formulario, el id heredado que viaja en el proyecto, las muestras que trae
// la app, los textos de la gema en el idioma de la app y el carril del
// formulario. Módulos puros de src/ corridos con Node (type stripping), sin
// bundler.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  readCatalogCharacter,
  rememberCatalogCharacter,
} from '../../src/modules/videos/utilities/catalogCharacterMemory.ts'
import { nextCharacterDraft } from '../../src/modules/videos/utilities/characterDraft.ts'
import { localizedText } from '../../src/modules/videos/utilities/catalogLocale.ts'
import {
  catalogSampleImages,
  catalogSampleUpload,
} from '../../src/modules/videos/utilities/catalogSamples.ts'
import {
  customStyleForTab,
  displayLaneOf,
  laneOf,
  tabSwitchSelection,
} from '../../src/modules/videos/utilities/formLane.ts'
import {
  catalogProjectStyleId,
  gemProjectStyleId,
  selectedCatalogStyleFrom,
} from '../../src/modules/videos/utilities/selectedCatalogStyle.ts'

// La clave del contrato (plan E2 §5.5): cambiarla pierde lo que cada persona
// eligió.
const STORAGE_KEY = 'vimo:catalog:character:v1'

// Un localStorage en memoria con la parte de la API que usa la app.
function memoryStorage(initial = {}) {
  const items = new Map(Object.entries(initial))
  return {
    items,
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => {
      items.set(key, String(value))
    },
  }
}

// La memoria tal como quedó escrita.
function storedMemory(storage) {
  return JSON.parse(storage.items.get(STORAGE_KEY))
}

// Un storage inaccesible (WebView sin almacenamiento, cuota llena): todo lanza.
const BLOCKED_STORAGE = {
  getItem() {
    throw new Error('storage blocked')
  },
  setItem() {
    throw new Error('storage blocked')
  },
}

// Gemas con la forma completa de CatalogGem. Fantasía es uno de los 5 ids
// heredados, con nombres distintos en cada idioma; Anime Storytime es una de
// Imperio Pro y sus muestras salieron sin personaje, que NO es el primero de
// sus modos: el defecto es `sampleMode`, no el orden (plan E2, P3).
const FANTASIA = {
  id: 'fantasia',
  name: { es: 'Fantasía mágica', en: 'Magic fantasy', pt: 'Fantasia mágica' },
  description: {
    es: 'Ilustración épica con luz dorada.',
    en: 'Epic illustration with golden light.',
    pt: 'Ilustração épica com luz dourada.',
  },
  tags: [
    { es: 'Dinamismo', en: 'Dynamism', pt: 'Dinamismo' },
    { es: 'Fantasía', en: 'Fantasy', pt: 'Fantasia' },
  ],
  sections: {
    visualStyle: 'Epic fantasy illustration, painterly, golden rim light.',
    dynamism: 'Alternar escenas explicativas y alusivas.',
    rules: 'Nada de texto en la imagen.',
  },
  templateVersion: 1,
  allowedModes: ['generic', 'own', 'none'],
  sampleMode: 'generic',
  colorFilter: 'fantasy',
  sampleCount: 4,
}

const ANIME = {
  id: 'anime-storytime',
  name: {
    es: 'Anime Storytime',
    en: 'Anime Storytime',
    pt: 'Anime Storytime',
  },
  description: {
    es: 'Anime digital moderno.',
    en: 'Modern digital anime.',
    pt: 'Anime digital moderno.',
  },
  tags: [{ es: 'Anime', en: 'Anime', pt: 'Anime' }],
  sections: {
    visualStyle: 'High-quality 2D anime illustration, cel shading.',
    camera: 'Alternar Wide shot, Medium shot y Close-up.',
    promptEnd: 'Style: modern digital cel shading.',
  },
  templateVersion: 1,
  allowedModes: ['generic', 'own', 'none'],
  sampleMode: 'none',
  colorFilter: 'none',
  sampleCount: 4,
}

// ─── Memoria del modo elegido en «Ver» (plan E2 §5.5) ───

test('sin memoria, «Ver» abre con el modo con que salieron las muestras', () => {
  assert.deepEqual(readCatalogCharacter(ANIME, memoryStorage()), {
    mode: 'none',
  })
  assert.deepEqual(readCatalogCharacter(FANTASIA, memoryStorage()), {
    mode: 'generic',
  })
})

test('lo recordado se relee igual, con el personaje fijo de «Mi personaje»', () => {
  const storage = memoryStorage()
  rememberCatalogCharacter(
    ANIME.id,
    { mode: 'own', defaultCharacterId: 'ana' },
    storage,
  )

  assert.deepEqual(readCatalogCharacter(ANIME, storage), {
    mode: 'own',
    defaultCharacterId: 'ana',
  })
  // La forma del contrato: un registro por id del catálogo bajo una sola clave.
  assert.deepEqual(storedMemory(storage), {
    'anime-storytime': { mode: 'own', defaultCharacterId: 'ana' },
  })
})

test('recordar un estilo no pisa lo recordado de los demás', () => {
  const storage = memoryStorage()
  rememberCatalogCharacter(FANTASIA.id, { mode: 'none' }, storage)
  rememberCatalogCharacter(ANIME.id, { mode: 'generic' }, storage)
  rememberCatalogCharacter(ANIME.id, { mode: 'own' }, storage)

  assert.deepEqual(readCatalogCharacter(FANTASIA, storage), { mode: 'none' })
  assert.deepEqual(readCatalogCharacter(ANIME, storage), { mode: 'own' })
  assert.deepEqual(storedMemory(storage), {
    fantasia: { mode: 'none' },
    'anime-storytime': { mode: 'own' },
  })
})

test('JSON roto o con otra forma cuenta como memoria vacía', () => {
  for (const raw of ['{roto', '[]', '"own"', '42', 'null', '[{"mode":"own"}]'])
    assert.deepEqual(
      readCatalogCharacter(ANIME, memoryStorage({ [STORAGE_KEY]: raw })),
      { mode: 'none' },
      raw,
    )
})

test('una entrada del estilo que no es un modo válido cuenta como vacía', () => {
  for (const entry of [
    { mode: 'hero' },
    {},
    'own',
    null,
    ['own'],
    { mode: 7 },
  ]) {
    const raw = JSON.stringify({ 'anime-storytime': entry })
    assert.deepEqual(
      readCatalogCharacter(ANIME, memoryStorage({ [STORAGE_KEY]: raw })),
      { mode: 'none' },
      raw,
    )
  }
})

test('un modo recordado que el estilo ya no permite cae al primero permitido', () => {
  // El admin dejó de ofrecer «Mi personaje»: no se usa el defecto de las
  // muestras sino el primero de los permitidos (spec §8).
  const narrowed = {
    ...ANIME,
    allowedModes: ['none', 'generic'],
    sampleMode: 'generic',
  }
  const storage = memoryStorage()
  rememberCatalogCharacter(
    narrowed.id,
    { mode: 'own', defaultCharacterId: 'ana' },
    storage,
  )

  assert.deepEqual(readCatalogCharacter(narrowed, storage), { mode: 'none' })
})

test('un defecto que el estilo no permite también cae al primero permitido', () => {
  const inconsistent = { ...ANIME, allowedModes: ['own'], sampleMode: 'none' }
  assert.deepEqual(readCatalogCharacter(inconsistent, memoryStorage()), {
    mode: 'own',
  })
  // Un estilo sin modos rompe el contrato; aun así no se inventa un modo
  // inválido: genérico, el de toda gema que no declara nada.
  const empty = { ...ANIME, allowedModes: [] }
  assert.deepEqual(readCatalogCharacter(empty, memoryStorage()), {
    mode: 'generic',
  })
})

test('el personaje fijo solo viaja con «Mi personaje» y nunca vacío', () => {
  // create-video-project rechaza `defaultCharacterId` con otro modo
  // (assertStyleCharacter): la memoria nunca lo devuelve así.
  const cases = [
    [{ mode: 'generic', defaultCharacterId: 'ana' }, { mode: 'generic' }],
    [{ mode: 'none', defaultCharacterId: 'ana' }, { mode: 'none' }],
    [{ mode: 'own', defaultCharacterId: '   ' }, { mode: 'own' }],
    [{ mode: 'own', defaultCharacterId: 7 }, { mode: 'own' }],
  ]
  for (const [entry, expected] of cases) {
    const raw = JSON.stringify({ 'anime-storytime': entry })
    assert.deepEqual(
      readCatalogCharacter(ANIME, memoryStorage({ [STORAGE_KEY]: raw })),
      expected,
      raw,
    )
  }
})

test('un storage inaccesible no rompe: se lee vacío y recordar no lanza', () => {
  assert.deepEqual(readCatalogCharacter(ANIME, BLOCKED_STORAGE), {
    mode: 'none',
  })
  assert.doesNotThrow(() =>
    rememberCatalogCharacter(ANIME.id, { mode: 'own' }, BLOCKED_STORAGE),
  )
})

test('recordar sobre una memoria rota la empieza de cero', () => {
  for (const raw of ['{roto', '[{"mode":"own"}]']) {
    const storage = memoryStorage({ [STORAGE_KEY]: raw })
    rememberCatalogCharacter(ANIME.id, { mode: 'generic' }, storage)

    assert.deepEqual(
      storedMemory(storage),
      { 'anime-storytime': { mode: 'generic' } },
      raw,
    )
  }
})

test('un id con nombre de propiedad heredada no lee lo que no se guardó', () => {
  // `constructor` cumple STYLE_ID_PATTERN; con `in` o un acceso directo, la
  // memoria vacía devolvería la función heredada de Object.
  const inherited = { ...ANIME, id: 'constructor' }
  assert.deepEqual(readCatalogCharacter(inherited, memoryStorage()), {
    mode: 'none',
  })

  const storage = memoryStorage()
  rememberCatalogCharacter('constructor', { mode: 'own' }, storage)
  assert.deepEqual(readCatalogCharacter(inherited, storage), { mode: 'own' })
})

// ─── El estilo elegido en el formulario (plan E2 §5.4) ───

test('el snapshot del formulario lleva la gema entera con su id de catálogo', () => {
  assert.deepEqual(
    selectedCatalogStyleFrom(FANTASIA, 'es', {
      mode: 'own',
      defaultCharacterId: 'ana',
    }),
    {
      styleId: 'fantasia',
      catalogStyleId: 'fantasia',
      name: 'Fantasía mágica',
      systemPrompt: '',
      shots: [],
      sections: {
        visualStyle: 'Epic fantasy illustration, painterly, golden rim light.',
        dynamism: 'Alternar escenas explicativas y alusivas.',
        rules: 'Nada de texto en la imagen.',
      },
      templateVersion: 1,
      colorFilter: 'fantasy',
      character: { mode: 'own', defaultCharacterId: 'ana' },
    },
  )
})

test('el nombre del snapshot sale en el idioma de la app', () => {
  const nameIn = (language) =>
    selectedCatalogStyleFrom(FANTASIA, language, { mode: 'generic' }).name

  assert.equal(nameIn('en'), 'Magic fantasy')
  assert.equal(nameIn('pt'), 'Fantasia mágica')
  // Fuera de los tres idiomas de la app: español.
  assert.equal(nameIn('fr'), 'Fantasía mágica')
})

test('el proyecto usa el id heredado del estilo o, si no lo es, normal', () => {
  for (const legacy of [
    'normal',
    'pov_stickman',
    'cartoon',
    'fantasia',
    'terror',
  ])
    assert.equal(catalogProjectStyleId(legacy), legacy)

  for (const other of ['anime-storytime', 'realista', 'st-abc', 'constructor'])
    assert.equal(catalogProjectStyleId(other), 'normal', other)
})

test('el styleId de un proyecto por el carril de las gemas lo decide el snapshot', () => {
  // Un estilo del catálogo lleva el id que exige create-video-project, esté
  // donde esté el snapshot; una gema de Mi estilo (y una copia de «Pasar a mi
  // estilo», sin `catalogStyleId`) viaja con 'normal'.
  assert.equal(
    gemProjectStyleId(
      selectedCatalogStyleFrom(FANTASIA, 'es', { mode: 'generic' }),
    ),
    'fantasia',
  )
  assert.equal(
    gemProjectStyleId(
      selectedCatalogStyleFrom(ANIME, 'es', { mode: 'generic' }),
    ),
    'normal',
  )
  assert.equal(gemProjectStyleId({ styleId: 'st-mio' }), 'normal')
  assert.equal(gemProjectStyleId({ styleId: 'fantasia' }), 'normal')
})

// ─── Las muestras que trae la app (plan E2, P1) ───

test('las muestras son las de public/style-references, de la 1 a sampleCount', () => {
  assert.deepEqual(catalogSampleImages(ANIME), [
    '/style-references/anime-storytime_1.jpg',
    '/style-references/anime-storytime_2.jpg',
    '/style-references/anime-storytime_3.jpg',
    '/style-references/anime-storytime_4.jpg',
  ])
  assert.deepEqual(catalogSampleImages({ ...FANTASIA, sampleCount: 2 }), [
    '/style-references/fantasia_1.jpg',
    '/style-references/fantasia_2.jpg',
  ])
})

test('sin muestras no hay rutas, y nunca más de las 4 que acepta la copia', () => {
  assert.deepEqual(catalogSampleImages({ ...ANIME, sampleCount: 0 }), [])
  assert.deepEqual(catalogSampleImages({ ...ANIME, sampleCount: -1 }), [])
  assert.equal(catalogSampleImages({ ...ANIME, sampleCount: 9 }).length, 4)
})

// ─── Las muestras que viajan en «Pasar a mi estilo» (plan E2 §5.3) ───

const JPEG_BYTES = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x01, 0x02, 0x03])
const MAX_SAMPLE_BYTES = 4 * 1024 * 1024

// Bytes con la marca de un JPEG al principio y del largo pedido.
function jpegOfLength(length) {
  const bytes = new Uint8Array(length)
  bytes.set([0xff, 0xd8, 0xff])
  for (let index = 3; index < length; index += 1) bytes[index] = index % 256
  return bytes
}

test('una muestra JPEG viaja como sample-<n>.jpg en base64, sin el prefijo data:', () => {
  assert.deepEqual(catalogSampleUpload(JPEG_BYTES, 2), {
    file: 'sample-2.jpg',
    base64: '/9j/4AECAw==',
  })
})

test('una muestra grande viaja entera: el base64 vuelve a los mismos bytes', () => {
  const bytes = jpegOfLength(200_003)
  const upload = catalogSampleUpload(bytes, 1)
  assert.deepEqual(Uint8Array.from(Buffer.from(upload.base64, 'base64')), bytes)
})

test('lo que el sidecar rechazaría se omite: vacío, no JPEG o más de 4 MiB', () => {
  assert.equal(catalogSampleUpload(new Uint8Array(0), 1), null)
  // La firma de un PNG (y la página HTML que devuelve un servidor de dev
  // cuando el archivo no existe) no es un JPEG.
  assert.equal(
    catalogSampleUpload(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]), 1),
    null,
  )
  assert.equal(
    catalogSampleUpload(new TextEncoder().encode('<!doctype html>'), 1),
    null,
  )
  assert.notEqual(catalogSampleUpload(jpegOfLength(MAX_SAMPLE_BYTES), 1), null)
  assert.equal(catalogSampleUpload(jpegOfLength(MAX_SAMPLE_BYTES + 1), 1), null)
})

// ─── Los textos de la gema (plan E2, P8 y P12) ───

const GREETING = { es: 'Hola', en: 'Hello', pt: 'Olá' }

test('el texto de la gema sale en el idioma de la app', () => {
  assert.equal(localizedText(GREETING, 'es'), 'Hola')
  assert.equal(localizedText(GREETING, 'en'), 'Hello')
  assert.equal(localizedText(GREETING, 'pt'), 'Olá')
})

test('fuera de los tres idiomas, o sin traducción, sale en español', () => {
  for (const language of ['fr', '', 'EN', 'toString', 'constructor'])
    assert.equal(localizedText(GREETING, language), 'Hola', language)
  assert.equal(localizedText({ ...GREETING, en: '  ' }, 'en'), 'Hola')
})

// ─── El carril del formulario ───

test('el carril sale de la pestaña y de si el estilo elegido es del catálogo', () => {
  const catalogGem = { styleId: 'fantasia', catalogStyleId: 'fantasia' }
  const ownGem = { styleId: 'st-mio' }
  const cases = [
    [{ styleSource: 'custom', customStyle: null }, 'custom'],
    [{ styleSource: 'custom', customStyle: ownGem }, 'custom'],
    [{ styleSource: 'custom', customStyle: catalogGem }, 'custom'],
    [{ styleSource: 'catalog', customStyle: catalogGem }, 'catalog-gem'],
    [{ styleSource: 'catalog', customStyle: null }, 'legacy-catalog'],
    [{ styleSource: 'catalog', customStyle: ownGem }, 'legacy-catalog'],
  ]
  for (const [form, lane] of cases)
    assert.equal(laneOf(form), lane, JSON.stringify(form))
})

test('con el catálogo nuevo, la pestaña Catálogo se arma como su carril aun sin tarjeta', () => {
  const catalogGem = { styleId: 'fantasia', catalogStyleId: 'fantasia' }
  const ownGem = { styleId: 'st-mio' }
  // Con el catálogo nuevo activo (interruptor encendido, fuera de la demo).
  const cases = [
    [{ styleSource: 'catalog', customStyle: null }, 'catalog-gem'],
    [{ styleSource: 'catalog', customStyle: catalogGem }, 'catalog-gem'],
    [{ styleSource: 'catalog', customStyle: ownGem }, 'catalog-gem'],
    [{ styleSource: 'custom', customStyle: null }, 'custom'],
    [{ styleSource: 'custom', customStyle: ownGem }, 'custom'],
  ]
  for (const [form, lane] of cases)
    assert.equal(displayLaneOf(form, true), lane, JSON.stringify(form))

  // Sin el catálogo nuevo, la pantalla sigue al carril de siempre.
  assert.equal(
    displayLaneOf({ styleSource: 'catalog', customStyle: null }, false),
    'legacy-catalog',
  )
  assert.equal(
    displayLaneOf({ styleSource: 'catalog', customStyle: ownGem }, false),
    'legacy-catalog',
  )
  assert.equal(
    displayLaneOf({ styleSource: 'custom', customStyle: ownGem }, false),
    'custom',
  )
})

test('un estilo del catálogo solo vale en la pestaña Catálogo nueva', () => {
  const catalogGem = { styleId: 'fantasia', catalogStyleId: 'fantasia' }
  const ownGem = { styleId: 'st-mio' }

  assert.equal(
    customStyleForTab(
      { styleSource: 'catalog', customStyle: catalogGem },
      true,
    ),
    catalogGem,
  )
  // En Mi estilo no es un estilo propio; sin el catálogo nuevo (interruptor
  // apagado o demo), la pestaña Catálogo elige por `styleId`.
  for (const [form, newCatalog] of [
    [{ styleSource: 'custom', customStyle: catalogGem }, true],
    [{ styleSource: 'custom', customStyle: catalogGem }, false],
    [{ styleSource: 'catalog', customStyle: catalogGem }, false],
  ])
    assert.equal(
      customStyleForTab(form, newCatalog),
      null,
      JSON.stringify({ ...form, newCatalog }),
    )

  // Una gema de Mi estilo (o ninguna) queda como está, el mismo objeto.
  for (const styleSource of ['custom', 'catalog'])
    for (const newCatalog of [true, false]) {
      assert.equal(
        customStyleForTab({ styleSource, customStyle: ownGem }, newCatalog),
        ownGem,
      )
      assert.equal(
        customStyleForTab({ styleSource, customStyle: null }, newCatalog),
        null,
      )
    }
})

// ─── Una selección por pestaña al cambiar de pestaña (catálogo nuevo) ───

const CATALOG_PICK = { styleId: 'fantasia', catalogStyleId: 'fantasia' }
const OTHER_CATALOG_PICK = {
  styleId: 'anime-storytime',
  catalogStyleId: 'anime-storytime',
}
const OWN_PICK = { styleId: 'st-mio' }
const OTHER_OWN_PICK = { styleId: 'st-otro' }

test('Catálogo → Mi estilo → Catálogo conserva la selección de cada pestaña', () => {
  // En Catálogo con Fantasía; Mi estilo había quedado con su gema.
  const toCustom = tabSwitchSelection(CATALOG_PICK, OWN_PICK, 'custom')
  assert.equal(toCustom.customStyle, OWN_PICK)
  assert.equal(toCustom.otherTabStyle, CATALOG_PICK)

  const backToCatalog = tabSwitchSelection(
    toCustom.customStyle,
    toCustom.otherTabStyle,
    'catalog',
  )
  assert.equal(backToCatalog.customStyle, CATALOG_PICK)
  assert.equal(backToCatalog.otherTabStyle, OWN_PICK)
})

test('sin nada guardado, la pestaña de destino arranca vacía y lo de la otra queda guardado', () => {
  assert.deepEqual(tabSwitchSelection(OWN_PICK, null, 'catalog'), {
    customStyle: null,
    otherTabStyle: OWN_PICK,
  })
  assert.deepEqual(tabSwitchSelection(CATALOG_PICK, null, 'custom'), {
    customStyle: null,
    otherTabStyle: CATALOG_PICK,
  })
  assert.deepEqual(tabSwitchSelection(null, null, 'catalog'), {
    customStyle: null,
    otherTabStyle: null,
  })
})

test('una gema propia que quedó en Catálogo vuelve a Mi estilo y no se pierde', () => {
  // Con el interruptor recién encendido, la gema de Mi estilo puede estar en
  // la pestaña Catálogo (sin el catálogo nuevo se conservaba ahí).
  const toCustom = tabSwitchSelection(OWN_PICK, null, 'custom')
  assert.deepEqual(toCustom, { customStyle: OWN_PICK, otherTabStyle: null })

  const toCatalog = tabSwitchSelection(OWN_PICK, null, 'catalog')
  assert.deepEqual(toCatalog, { customStyle: null, otherTabStyle: OWN_PICK })
})

test('ninguna selección cae en la pestaña equivocada ni se inventa', () => {
  const choices = [
    null,
    CATALOG_PICK,
    OTHER_CATALOG_PICK,
    OWN_PICK,
    OTHER_OWN_PICK,
  ]
  const isCatalog = (style) => Boolean(style?.catalogStyleId)

  for (const current of choices)
    for (const stored of choices)
      for (const styleSource of ['catalog', 'custom']) {
        const label = JSON.stringify({ current, stored, styleSource })
        const { customStyle, otherTabStyle } = tabSwitchSelection(
          current,
          stored,
          styleSource,
        )

        // Una gema propia nunca queda elegida en Catálogo; un estilo del
        // catálogo nunca en Mi estilo. Lo guardado es siempre de la otra.
        if (customStyle)
          assert.equal(isCatalog(customStyle), styleSource === 'catalog', label)
        if (otherTabStyle)
          assert.equal(
            isCatalog(otherTabStyle),
            styleSource !== 'catalog',
            label,
          )

        // Solo se mueven las dos que había (o ninguna).
        assert.ok([null, current, stored].includes(customStyle), label)
        assert.ok([null, current, stored].includes(otherTabStyle), label)

        // Lo guardado para el destino siempre vuelve, y lo que estaba en uso
        // siempre queda guardado si es de la otra pestaña.
        if (stored && isCatalog(stored) === (styleSource === 'catalog'))
          assert.equal(customStyle, stored, label)
        if (current && isCatalog(current) !== (styleSource === 'catalog'))
          assert.equal(otherTabStyle, current, label)
      }
})

// ─── El borrador del personaje en los modales de estilo (Mi estilo y «Ver») ───

// Aplica una serie de cambios del bloque de personaje, como lo hace un modal.
function applyChanges(draft, changes) {
  return changes.reduce(
    (current, next) => nextCharacterDraft(current, next),
    draft,
  )
}

const OWN_ANA = { mode: 'own', defaultCharacterId: 'ana' }

test('volver a «Mi personaje» desde otro modo recupera el personaje fijo', () => {
  // Pasar por «Genérico» no pierde a Ana: al volver, el bloque manda
  // `{ mode: 'own' }` sin nadie.
  const back = applyChanges(
    { character: OWN_ANA, lastDefaultCharacterId: 'ana' },
    [{ mode: 'generic' }, { mode: 'own' }],
  )
  assert.deepEqual(back.character, OWN_ANA)
  assert.equal(back.lastDefaultCharacterId, 'ana')

  // Si al volver se elige a alguien, manda la elección.
  const chosen = applyChanges(
    { character: { mode: 'none' }, lastDefaultCharacterId: 'ana' },
    [{ mode: 'own', defaultCharacterId: 'beto' }],
  )
  assert.deepEqual(chosen.character, {
    mode: 'own',
    defaultCharacterId: 'beto',
  })
  assert.equal(chosen.lastDefaultCharacterId, 'beto')
})

test('apagar el personaje fijo estando en «Mi personaje» lo olvida', () => {
  const off = applyChanges(
    { character: OWN_ANA, lastDefaultCharacterId: 'ana' },
    [{ mode: 'own' }],
  )
  assert.deepEqual(off.character, { mode: 'own' })
  assert.equal(off.lastDefaultCharacterId, undefined)

  // Olvidado: ir a «Genérico» y volver ya no lo trae.
  const back = applyChanges(off, [{ mode: 'generic' }, { mode: 'own' }])
  assert.deepEqual(back.character, { mode: 'own' })
})

test('cualquier otro cambio se aplica tal cual y recuerda el último fijo', () => {
  // Elegir otro personaje fijo lo recuerda en lugar del anterior.
  const switched = applyChanges(
    { character: OWN_ANA, lastDefaultCharacterId: 'ana' },
    [{ mode: 'own', defaultCharacterId: 'beto' }, { mode: 'none' }],
  )
  assert.deepEqual(switched.character, { mode: 'none' })
  assert.equal(switched.lastDefaultCharacterId, 'beto')

  // Sin un fijo previo, volver a «Mi personaje» no inventa ninguno.
  const fresh = applyChanges({ character: { mode: 'generic' } }, [
    { mode: 'own' },
  ])
  assert.deepEqual(fresh.character, { mode: 'own' })
  assert.equal(fresh.lastDefaultCharacterId, undefined)
})
