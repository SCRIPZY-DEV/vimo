// La lógica pura del creador de estilo con IA en la app (ADR-0050): qué dice
// la tarjeta de un estilo sobre su origen y el contrato con vimo.click (qué
// lleva cada turno y cómo se lee su respuesta, que es dato de afuera). Módulos
// puros de src/ corridos con Node (type stripping), sin React ni Tauri.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  readStyleCloneTurnResult,
  styleCloneServerImageOf,
  styleCloneTurnDraftOf,
  styleCloneTurnOutcome,
} from '../../src/modules/videos/utilities/styleCloneTurn.ts'
import {
  addStyleCloneImages,
  isYouTubeVideoLink,
  styleCloneCardStateOf,
  styleCloneCoverOf,
  styleCloneModalStepOf,
  styleCloneOriginImageOf,
  styleCloneWorkingSteps,
} from '../../src/modules/videos/utilities/styleCloneView.ts'
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

// ── El contrato con vimo.click ──

const material = [
  {
    kind: 'mosaic',
    file: 'mosaic-1.jpg',
    path: '/r/mosaic-1.jpg',
    mimeType: 'image/jpeg',
    rows: 3,
    columns: 3,
  },
  {
    kind: 'frame',
    file: 'frame-1.jpg',
    path: '/r/frame-1.jpg',
    mimeType: 'image/jpeg',
  },
  {
    kind: 'thumbnail',
    file: 'thumbnail.jpg',
    path: '/r/thumbnail.jpg',
    mimeType: 'image/jpeg',
  },
]
const baseSession = {
  id: 'sc-1',
  source: {
    kind: 'youtube',
    url: 'https://www.youtube.com/watch?v=tBBhUn0D0I0',
  },
  replicateCharacter: true,
  title: 'POV: Eres el COCINERO del Cartel',
  history: [],
  designs: [],
  material,
}
const history = [
  { role: 'user', text: 'Analiza este video.' },
  { role: 'model', text: 'PERSONAJE: SÍ' },
]

test('the first turn carries the source, the decision and no history', () => {
  assert.deepEqual(styleCloneTurnDraftOf(baseSession, { kind: 'analyze' }), {
    accion: 'analizar',
    origen: { tipo: 'youtube', titulo: 'POV: Eres el COCINERO del Cartel' },
    replicarPersonaje: true,
    historial: [],
  })
  assert.deepEqual(
    styleCloneTurnDraftOf(
      {
        ...baseSession,
        source: { kind: 'images', paths: ['/a.png'] },
        replicateCharacter: false,
        title: '',
      },
      { kind: 'analyze' },
    ).origen,
    { tipo: 'imagenes' },
  )
})

test('a comment travels trimmed with the conversation so far', () => {
  const draft = styleCloneTurnDraftOf(
    { ...baseSession, history },
    { kind: 'adjust-character', comment: '  Más alto y sin lentes.  ' },
  )
  assert.equal(draft.accion, 'ajustar-personaje')
  assert.equal(draft.comentario, 'Más alto y sin lentes.')
  assert.deepEqual(draft.historial, history)
  assert.equal(
    styleCloneTurnDraftOf(
      { ...baseSession, history },
      { kind: 'adjust-scenes', comment: 'Menos texto.' },
    ).accion,
    'ajustar-escenas',
  )
})

test('choosing a design sends its number and its whole prompt', () => {
  const designs = [1, 2, 3].map((index) => ({
    index,
    prompt: `Design prompt number ${index}.`,
  }))
  const draft = styleCloneTurnDraftOf(
    { ...baseSession, history, designs },
    { kind: 'choose-character', option: 2, travel: 'photo' },
  )
  assert.equal(draft.accion, 'elegir-personaje')
  assert.deepEqual(draft.eleccion, {
    opcion: 2,
    prompt: 'Design prompt number 2.',
  })
  assert.equal(draft.comentario, undefined)
})

test('approving asks for the final style', () => {
  const draft = styleCloneTurnDraftOf(
    { ...baseSession, history },
    { kind: 'approve' },
  )
  assert.equal(draft.accion, 'aprobar')
  assert.equal(draft.eleccion, undefined)
})

test('each image of the material travels with the name the server gives its kind', () => {
  assert.deepEqual(styleCloneServerImageOf(material[0], 'AAAA'), {
    tipo: 'mosaico',
    mimeType: 'image/jpeg',
    data: 'AAAA',
    filas: 3,
    columnas: 3,
  })
  assert.deepEqual(styleCloneServerImageOf(material[1], 'BBBB'), {
    tipo: 'fotograma',
    mimeType: 'image/jpeg',
    data: 'BBBB',
  })
  assert.equal(styleCloneServerImageOf(material[2], 'C').tipo, 'miniatura')
  assert.equal(
    styleCloneServerImageOf(
      {
        kind: 'image',
        file: 'image-1.jpg',
        path: '/r/image-1.jpg',
        mimeType: 'image/jpeg',
      },
      'D',
    ).tipo,
    'imagen',
  )
})

const turnos = [
  { role: 'user', text: 'Analiza.' },
  { role: 'model', text: 'PERSONAJE: SÍ…' },
]

test('the analysis of a style with a character brings its name and three designs', () => {
  const result = readStyleCloneTurnResult({
    tipo: 'resultado',
    accion: 'analizar',
    nombre: 'Cómic Palo',
    descripcion: 'Figuras de palitos.',
    fase: 'personaje',
    personajeEn: { tipo: 'mosaico', mosaico: 2, fila: 1, columna: 3 },
    disenos: [
      'Design one prompt.',
      'Design two prompt.',
      'Design three prompt.',
    ],
    turnos,
  })
  assert.deepEqual(result, {
    turns: turnos,
    name: 'Cómic Palo',
    description: 'Figuras de palitos.',
    characterIn: { kind: 'mosaic', mosaic: 2, row: 1, column: 3 },
    designs: [
      'Design one prompt.',
      'Design two prompt.',
      'Design three prompt.',
    ],
  })
})

test('the scenes arrive with the origin each one recreates', () => {
  const result = readStyleCloneTurnResult({
    tipo: 'resultado',
    accion: 'elegir-personaje',
    identidad: {
      nombre: 'Rubio',
      descripcion: 'A stick-figure man. Outfit: a grey suit.',
    },
    escenas: [
      { prompt: 'Scene one.', origen: { tipo: 'fotograma', numero: 2 } },
      { prompt: 'Scene two.', origen: { tipo: 'imagen', numero: 5 } },
      { prompt: 'Scene three.', origen: { tipo: 'nueva' } },
      { prompt: 'Scene four.', origen: { tipo: 'desconocido' } },
    ],
    turnos,
  })
  assert.deepEqual(result.identity, {
    name: 'Rubio',
    description: 'A stick-figure man. Outfit: a grey suit.',
  })
  assert.deepEqual(
    result.scenes.map((scene) => scene.origin),
    [
      { kind: 'frame', number: 2 },
      { kind: 'image', number: 5 },
      { kind: 'new' },
      { kind: 'new' },
    ],
  )
})

test('the final style arrives as sections with their version', () => {
  const result = readStyleCloneTurnResult({
    tipo: 'resultado',
    accion: 'aprobar',
    templateVersion: 1,
    sections: {
      visualStyle: 'Flat stickman drawings.',
      rules: 'No text.',
      promptEnd: 'Style: flat.',
      extra: 7,
    },
    turnos,
  })
  assert.equal(result.templateVersion, 1)
  assert.deepEqual(result.sections, {
    visualStyle: 'Flat stickman drawings.',
    rules: 'No text.',
    promptEnd: 'Style: flat.',
  })
})

test('an answer that does not keep the contract is not used', () => {
  const ok = {
    tipo: 'resultado',
    accion: 'ajustar-escenas',
    escenas: [{ prompt: 'Scene.', origen: { tipo: 'nueva' } }],
    turnos,
  }
  assert.notEqual(readStyleCloneTurnResult(ok), null)
  for (const broken of [
    null,
    'texto',
    { ...ok, tipo: 'latido' },
    { ...ok, turnos: [] },
    { ...ok, turnos: [{ role: 'system', text: 'x' }] },
    { ...ok, escenas: [] },
    { ...ok, escenas: [{ prompt: '   ' }] },
    { tipo: 'resultado', accion: 'analizar', turnos },
    {
      tipo: 'resultado',
      accion: 'elegir-personaje',
      escenas: ok.escenas,
      turnos,
    },
    {
      tipo: 'resultado',
      accion: 'aprobar',
      templateVersion: 1,
      sections: { rules: 'x' },
      turnos,
    },
    {
      tipo: 'resultado',
      accion: 'aprobar',
      sections: { visualStyle: 'x', promptEnd: 'Style: x' },
      turnos,
    },
    { tipo: 'resultado', accion: 'otra', turnos },
  ])
    assert.equal(readStyleCloneTurnResult(broken), null, JSON.stringify(broken))
})

test('the last line of the stream is the result, or the error code the server gave', () => {
  const lines = [{ tipo: 'inicio' }, { tipo: 'latido' }, { tipo: 'latido' }]
  const result = {
    tipo: 'resultado',
    accion: 'ajustar-escenas',
    escenas: [{ prompt: 'Scene.', origen: { tipo: 'nueva' } }],
    turnos,
  }
  assert.deepEqual(styleCloneTurnOutcome([...lines, result]), {
    ok: true,
    result: readStyleCloneTurnResult(result),
  })
  assert.deepEqual(
    styleCloneTurnOutcome([
      ...lines,
      { tipo: 'error', code: 'modelo-timeout' },
    ]),
    {
      ok: false,
      code: 'modelo-timeout',
    },
  )
  // Una respuesta cortada antes de su última línea, o una que no cumple el
  // contrato, no tiene código del servidor.
  assert.deepEqual(styleCloneTurnOutcome(lines), { ok: false, code: null })
  assert.deepEqual(
    styleCloneTurnOutcome([
      ...lines,
      { tipo: 'resultado', accion: 'aprobar', turnos },
    ]),
    {
      ok: false,
      code: null,
    },
  )
})

// ── Lo que muestran la tarjeta y el modal de una clonación ──

const session = (extra = {}) => ({
  id: 'sc-1',
  source: {
    kind: 'youtube',
    url: 'https://www.youtube.com/watch?v=tBBhUn0D0I0',
  },
  replicateCharacter: true,
  status: 'awaiting',
  step: 'character',
  action: null,
  phase: null,
  material: [],
  designs: [],
  scenes: [],
  errorCode: null,
  ...extra,
})

test('the card says what the clone is doing, and when it needs an answer', () => {
  assert.deepEqual(styleCloneCardStateOf(session({ status: 'analyzing' })), {
    labelKey: 'create.styleClone.status.analyzing',
    tone: 'working',
    busy: true,
  })
  for (const status of ['preparing', 'drawing', 'saving'])
    assert.equal(styleCloneCardStateOf(session({ status })).busy, true)
  assert.deepEqual(styleCloneCardStateOf(session()), {
    labelKey: 'create.styleClone.status.awaiting',
    tone: 'attention',
    busy: false,
  })
  assert.deepEqual(styleCloneCardStateOf(session({ status: 'interrupted' })), {
    labelKey: 'create.styleClone.status.interrupted',
    tone: 'error',
    busy: false,
  })
})

test('a clone without credits says so instead of a generic error', () => {
  assert.equal(
    styleCloneCardStateOf(
      session({ status: 'failed', errorCode: 'modelo-fallo' }),
    ).labelKey,
    'create.styleClone.status.failed',
  )
  assert.equal(
    styleCloneCardStateOf(
      session({ status: 'failed', errorCode: 'image_insufficient_credits' }),
    ).labelKey,
    'create.styleClone.status.noCredits',
  )
})

test('the modal opens on the step the session is in', () => {
  assert.equal(styleCloneModalStepOf(session({ status: 'drawing' })), 'working')
  assert.equal(styleCloneModalStepOf(session()), 'character')
  assert.equal(styleCloneModalStepOf(session({ step: 'scenes' })), 'scenes')
  assert.equal(
    styleCloneModalStepOf(session({ status: 'failed', errorCode: 'timeout' })),
    'failed',
  )
  assert.equal(
    styleCloneModalStepOf(session({ status: 'interrupted' })),
    'failed',
  )
  // Imágenes que no eran imágenes: vuelve al paso de origen a quitarlas.
  assert.equal(
    styleCloneModalStepOf(
      session({ status: 'failed', errorCode: 'style_clone_invalid_images' }),
    ),
    'source',
  )
})

test('the working steps show what is done, what runs and what is left', () => {
  const states = (extra) =>
    styleCloneWorkingSteps(session(extra)).map(
      (step) => `${step.key}:${step.state}`,
    )
  assert.deepEqual(
    states({
      status: 'preparing',
      action: { kind: 'analyze' },
      phase: 'prepare',
    }),
    ['material:active', 'analysis:todo', 'drawing:todo'],
  )
  assert.deepEqual(
    states({ status: 'analyzing', action: { kind: 'analyze' }, phase: 'turn' }),
    ['material:done', 'analysis:active', 'drawing:todo'],
  )
  assert.deepEqual(
    states({
      status: 'drawing',
      action: { kind: 'adjust-scenes', comment: 'x' },
      phase: 'draw',
    }),
    ['analysis:done', 'drawing:active'],
  )
  assert.deepEqual(
    states({
      status: 'drawing',
      action: { kind: 'redraw', target: 'scenes', indexes: [2] },
      phase: 'draw',
    }),
    ['drawing:active'],
  )
  assert.deepEqual(
    states({ status: 'saving', action: { kind: 'approve' }, phase: 'turn' }),
    ['analysis:active', 'saving:todo'],
  )
  assert.deepEqual(
    states({ status: 'saving', action: { kind: 'approve' }, phase: 'save' }),
    ['analysis:done', 'saving:active'],
  )
})

test('the cover of the card is the best image the session has so far', () => {
  const frame = {
    kind: 'frame',
    file: 'frame-1.jpg',
    path: '/r/frame-1.jpg',
    mimeType: 'image/jpeg',
  }
  const mosaic = {
    kind: 'mosaic',
    file: 'mosaic-1.jpg',
    path: '/r/mosaic-1.jpg',
    mimeType: 'image/jpeg',
    rows: 3,
    columns: 3,
  }
  assert.equal(styleCloneCoverOf(session()), null)
  assert.deepEqual(
    styleCloneCoverOf(
      session({
        source: { kind: 'images', paths: ['/home/a.png', '/home/b.png'] },
      }),
    ),
    { path: '/home/a.png' },
  )
  assert.deepEqual(styleCloneCoverOf(session({ material: [mosaic, frame] })), {
    path: '/r/frame-1.jpg',
  })
  assert.deepEqual(
    styleCloneCoverOf(
      session({
        material: [mosaic, frame],
        designs: [
          { index: 1, prompt: 'p', path: '/r/design-r1-1.jpg', mtimeMs: 7 },
        ],
      }),
    ),
    { path: '/r/design-r1-1.jpg', version: 7 },
  )
  assert.deepEqual(
    styleCloneCoverOf(
      session({
        material: [mosaic, frame],
        designs: [
          { index: 1, prompt: 'p', path: '/r/design-r1-1.jpg', mtimeMs: 7 },
        ],
        scenes: [
          { index: 1, prompt: 'p', errorCode: 'image_provider_error' },
          { index: 2, prompt: 'p', path: '/r/scene-r1-2.jpg', mtimeMs: 9 },
        ],
      }),
    ),
    { path: '/r/scene-r1-2.jpg', version: 9 },
  )
})

test('a cell of a mosaic is shown by cropping the mosaic', () => {
  const mosaics = [
    {
      kind: 'mosaic',
      file: 'mosaic-1.jpg',
      path: '/r/mosaic-1.jpg',
      mimeType: 'image/jpeg',
      rows: 3,
      columns: 3,
    },
    {
      kind: 'mosaic',
      file: 'mosaic-2.jpg',
      path: '/r/mosaic-2.jpg',
      mimeType: 'image/jpeg',
      rows: 1,
      columns: 3,
    },
    {
      kind: 'frame',
      file: 'frame-1.jpg',
      path: '/r/frame-1.jpg',
      mimeType: 'image/jpeg',
    },
  ]
  assert.deepEqual(
    styleCloneOriginImageOf(mosaics, {
      kind: 'mosaic',
      mosaic: 1,
      row: 2,
      column: 3,
    }),
    {
      path: '/r/mosaic-1.jpg',
      crop: { size: '300% 300%', position: '100% 50%' },
    },
  )
  // Una sola fila: no hay nada que desplazar en vertical.
  assert.deepEqual(
    styleCloneOriginImageOf(mosaics, {
      kind: 'mosaic',
      mosaic: 2,
      row: 1,
      column: 1,
    }),
    {
      path: '/r/mosaic-2.jpg',
      crop: { size: '300% 100%', position: '0% 0%' },
    },
  )
  assert.deepEqual(
    styleCloneOriginImageOf(mosaics, { kind: 'frame', number: 1 }),
    { path: '/r/frame-1.jpg' },
  )
  assert.equal(
    styleCloneOriginImageOf(mosaics, {
      kind: 'mosaic',
      mosaic: 5,
      row: 1,
      column: 1,
    }),
    null,
  )
  assert.equal(
    styleCloneOriginImageOf(mosaics, {
      kind: 'mosaic',
      mosaic: 2,
      row: 2,
      column: 1,
    }),
    null,
  )
  assert.equal(styleCloneOriginImageOf(mosaics, { kind: 'new' }), null)
  assert.equal(styleCloneOriginImageOf(mosaics, null), null)
})

test('a YouTube link is recognized before asking the sidecar', () => {
  for (const link of [
    'https://www.youtube.com/watch?v=tBBhUn0D0I0',
    'youtube.com/watch?v=tBBhUn0D0I0&t=30',
    'https://youtu.be/tBBhUn0D0I0',
    'https://m.youtube.com/shorts/tBBhUn0D0I0',
    '  https://www.youtube.com/live/tBBhUn0D0I0  ',
  ])
    assert.equal(isYouTubeVideoLink(link), true, link)
  for (const link of [
    '',
    'hola',
    'https://vimeo.com/123456',
    'https://www.youtube.com/@canal',
    'https://www.youtube.com/watch?v=corto',
    'https://evil.example/watch?v=tBBhUn0D0I0',
  ])
    assert.equal(isYouTubeVideoLink(link), false, link)
})

test('added images keep their order, skip repeats and stop at ten', () => {
  const current = ['/a.png', '/b.png']
  assert.deepEqual(addStyleCloneImages(current, ['/b.png', '/c.png']), {
    paths: ['/a.png', '/b.png', '/c.png'],
    dropped: 0,
  })
  const many = Array.from({ length: 12 }, (_, index) => `/img-${index}.png`)
  const added = addStyleCloneImages(current, many)
  assert.equal(added.paths.length, 10)
  assert.equal(added.dropped, 4)
  assert.deepEqual(added.paths.slice(0, 3), ['/a.png', '/b.png', '/img-0.png'])
})
