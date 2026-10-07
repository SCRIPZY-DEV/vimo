// El estilo propio en el proyecto (options.customStyle): una gema vieja viaja
// byte por byte como antes de ADR-0048 y una de plantilla viaja por secciones,
// sin `systemPrompt` ni `shots` (spec §4.2). Decide el dato, no el interruptor.
// Una gema del catálogo nuevo (Entrega 2) viaja igual que una de plantilla más
// su `catalogStyleId` (plan E2 §5.4). Módulos puros de src/ corridos con Node
// (type stripping), sin bundler.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { projectCustomStyleFrom } from '../../src/modules/videos/utilities/projectCustomStyle.ts'
import { selectedCatalogStyleFrom } from '../../src/modules/videos/utilities/selectedCatalogStyle.ts'
import { selectedCustomStyleFrom } from '../../src/modules/videos/utilities/selectedCustomStyle.ts'

const OLD_GEM = {
  id: 'st-vieja',
  name: 'Vieja',
  systemPrompt: 'Acuarela editorial con tinta suelta.',
  shots: ['Wide shot', 'Close-up'],
  character: { mode: 'own', defaultCharacterId: 'ana' },
  createdAt: '2026-09-01T00:00:00.000Z',
  samples: [],
}

const TEMPLATE_GEM = {
  id: 'st-plantilla',
  name: 'Plantilla',
  shots: [],
  character: { mode: 'generic' },
  createdAt: '2026-09-30T00:00:00.000Z',
  samples: [],
  sections: {
    visualStyle: 'Acuarela editorial con tinta suelta.',
    character: 'A tall woman with short gray hair. Outfit: a green raincoat.',
    promptEnd: 'soft paper texture',
  },
  templateVersion: 1,
  colorFilter: 'horror-bw',
  sourcePrompt: 'La gema original.',
}

// Cómo armaba el snapshot formPayload.ts antes de ADR-0048 (copia literal).
function legacySnapshot(customStyle) {
  return {
    styleId: customStyle.styleId,
    name: customStyle.name,
    systemPrompt: customStyle.systemPrompt,
    shots: customStyle.shots,
    ...(customStyle.character ? { character: customStyle.character } : {}),
  }
}

test('una gema vieja viaja byte por byte como antes', () => {
  const selected = selectedCustomStyleFrom(OLD_GEM)
  assert.equal(
    JSON.stringify(projectCustomStyleFrom(selected)),
    JSON.stringify(legacySnapshot(selected)),
  )
  const withoutCharacter = selectedCustomStyleFrom({
    ...OLD_GEM,
    character: undefined,
  })
  assert.equal(
    JSON.stringify(projectCustomStyleFrom(withoutCharacter)),
    JSON.stringify(legacySnapshot(withoutCharacter)),
  )
})

test('una gema de plantilla viaja por secciones, sin systemPrompt ni shots', () => {
  const snapshot = projectCustomStyleFrom(selectedCustomStyleFrom(TEMPLATE_GEM))
  assert.deepEqual(snapshot, {
    styleId: 'st-plantilla',
    name: 'Plantilla',
    sections: TEMPLATE_GEM.sections,
    templateVersion: 1,
    colorFilter: 'horror-bw',
    character: { mode: 'generic' },
  })
  for (const field of ['systemPrompt', 'shots', 'sourcePrompt'])
    assert.equal(field in snapshot, false, field)
})

test('sin filtro ni versión guardados no se inventan', () => {
  const snapshot = projectCustomStyleFrom(
    selectedCustomStyleFrom({
      ...TEMPLATE_GEM,
      colorFilter: undefined,
      templateVersion: undefined,
    }),
  )
  assert.equal('colorFilter' in snapshot, false)
  assert.equal('templateVersion' in snapshot, false)
  assert.deepEqual(snapshot.sections, TEMPLATE_GEM.sections)
})

// create-video-project rechaza `sections` junto a CUALQUIER `systemPrompt`,
// aun vacío (A8a). El snapshot de la galería y el borrador del modal llevan
// `systemPrompt: ''` al lado de las secciones (C4a): ese '' no viaja nunca.
test('secciones o systemPrompt, nunca los dos: el systemPrompt vacío del snapshot no viaja', () => {
  const selected = selectedCustomStyleFrom(TEMPLATE_GEM)
  assert.equal(selected.systemPrompt, '')
  assert.equal('systemPrompt' in projectCustomStyleFrom(selected), false)

  // Ni con texto al lado: con secciones, viajan solo las secciones.
  const withText = projectCustomStyleFrom({
    ...selected,
    systemPrompt: 'Acuarela editorial con tinta suelta.',
  })
  assert.equal('systemPrompt' in withText, false)
  assert.deepEqual(withText.sections, TEMPLATE_GEM.sections)
})

// Una gema del catálogo de Vimo con la forma completa de CatalogGem: siempre de
// plantilla, con nombre en los tres idiomas.
const CATALOG_GEM = {
  id: 'cartoon',
  name: { es: 'Cartoon 2D', en: '2D cartoon', pt: 'Cartoon 2D' },
  tags: [{ es: '2D', en: '2D', pt: '2D' }],
  sections: {
    visualStyle: 'Flat 2D cartoon, clean outlines, vivid colors.',
    dynamism: 'Alternar escenas explicativas y alusivas.',
  },
  templateVersion: 1,
  allowedModes: ['generic', 'own', 'none'],
  sampleMode: 'generic',
  colorFilter: 'none',
  sampleCount: 4,
}

test('una gema del catálogo viaja con su catalogStyleId, como fija el plan E2 §5.4', () => {
  const snapshot = projectCustomStyleFrom(
    selectedCatalogStyleFrom(CATALOG_GEM, 'en', {
      mode: 'own',
      defaultCharacterId: 'ana',
    }),
  )
  assert.deepEqual(snapshot, {
    styleId: 'cartoon',
    catalogStyleId: 'cartoon',
    name: '2D cartoon',
    sections: {
      visualStyle: 'Flat 2D cartoon, clean outlines, vivid colors.',
      dynamism: 'Alternar escenas explicativas y alusivas.',
    },
    templateVersion: 1,
    colorFilter: 'none',
    character: { mode: 'own', defaultCharacterId: 'ana' },
  })
  // Una gema del catálogo es de plantilla: el '' de su snapshot no viaja.
  for (const field of ['systemPrompt', 'shots'])
    assert.equal(field in snapshot, false, field)
})

test('catalogStyleId viaja solo si el estilo elegido lo trae', () => {
  const fromCatalog = projectCustomStyleFrom({
    styleId: 'cartoon',
    catalogStyleId: 'cartoon',
    name: 'Cartoon 2D',
    systemPrompt: '',
    shots: [],
    sections: { visualStyle: 'Flat 2D cartoon.' },
    templateVersion: 1,
    colorFilter: 'none',
    character: { mode: 'generic' },
  })
  assert.equal(fromCatalog.catalogStyleId, 'cartoon')

  for (const style of [OLD_GEM, TEMPLATE_GEM])
    assert.equal(
      'catalogStyleId' in
        projectCustomStyleFrom(selectedCustomStyleFrom(style)),
      false,
      style.id,
    )
})

test('una copia de «Pasar a mi estilo» es un estilo propio: no viaja como del catálogo', () => {
  // Con `catalogStyleId`, create-video-project exige que `styleId` sea ese id
  // del catálogo; la copia tiene su propio `st-…` y su origen es solo un dato.
  const copy = {
    ...TEMPLATE_GEM,
    id: 'st-copia',
    origin: { kind: 'catalog', catalogStyleId: 'cartoon', name: 'Cartoon 2D' },
  }
  const snapshot = projectCustomStyleFrom(selectedCustomStyleFrom(copy))
  assert.equal(snapshot.styleId, 'st-copia')
  assert.equal('catalogStyleId' in snapshot, false)
})
