// Presets de color de un estilo (spec §5.5): los tres filtros de FFmpeg son
// los mismos de VISUAL_STYLES, y el resolver del proyecto toma el del estilo
// propio. Sin estilo propio, el catálogo de siempre (misma identidad de
// objeto, ADR-0018).

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  COLOR_FILTERS,
  colorFilterFor,
} from '../../pipeline/prompts/color-filters.ts'
import { VISUAL_STYLES } from '../../pipeline/prompts/visual-styles.ts'
import { resolveProjectStyle } from '../../pipeline/stages/shared/project-style.ts'
import { COLOR_FILTER_IDS } from '../../pipeline/types/styles.ts'

function options(customStyle) {
  return {
    styleId: 'normal',
    sceneCount: 0,
    narrationMode: 'tts',
    imageProvider: 'fal',
    useBgm: false,
    useOverlay: false,
    confirmScenes: false,
    ...(customStyle ? { customStyle } : {}),
  }
}
const gem = {
  styleId: 'st-fixture',
  name: 'Acuarela',
  sections: { visualStyle: 'Watercolor.' },
}

test('there is one filter per preset and they are the catalog ones', () => {
  assert.deepEqual(
    Object.keys(COLOR_FILTERS).sort(),
    [...COLOR_FILTER_IDS].sort(),
  )
  assert.equal(COLOR_FILTERS.none, '')
  assert.equal(COLOR_FILTERS.fantasy, VISUAL_STYLES.fantasia.filterFinal)
  assert.equal(COLOR_FILTERS['horror-bw'], VISUAL_STYLES.terror.filterFinal)
  assert.equal(
    COLOR_FILTERS.fantasy,
    'eq=saturation=1.25:brightness=0.03:gamma=1.05',
  )
  assert.equal(
    COLOR_FILTERS['horror-bw'],
    "format=gray,curves=master='0/0 0.4/0.3 1/0.95',eq=contrast=1.1",
  )
})

test('an absent or unknown preset means no color adjustment', () => {
  assert.equal(colorFilterFor(undefined), '')
  assert.equal(colorFilterFor('sepia'), '')
  assert.equal(colorFilterFor('none'), '')
  // Un project.json editado a mano puede traer cualquier valor, también los
  // nombres que todo objeto hereda de Object.prototype: ninguno es un preset
  // (buscar `COLOR_FILTERS[id]` a secas devolvería una función).
  for (const value of [
    'toString',
    'valueOf',
    'hasOwnProperty',
    '__proto__',
    'constructor',
    null,
    42,
  ])
    assert.equal(colorFilterFor(value), '')
})

test('the project resolver takes the filter of the custom style', () => {
  for (const id of COLOR_FILTER_IDS)
    assert.equal(
      resolveProjectStyle(options({ ...gem, colorFilter: id })).filterFinal,
      COLOR_FILTERS[id],
    )
  assert.equal(resolveProjectStyle(options(gem)).filterFinal, '')
  // Un snapshot con un preset que esta versión no conoce no ajusta el color.
  assert.equal(
    resolveProjectStyle(options({ ...gem, colorFilter: 'sepia' })).filterFinal,
    '',
  )
  // Un proyecto viejo con gema de texto tampoco cambia.
  assert.equal(
    resolveProjectStyle(
      options({ styleId: 'st-old', name: 'Old', systemPrompt: 'Watercolor.' }),
    ).filterFinal,
    '',
  )
})

test('without a custom style the catalog style is returned as is', () => {
  for (const styleId of Object.keys(VISUAL_STYLES))
    assert.equal(
      resolveProjectStyle({ ...options(), styleId }),
      VISUAL_STYLES[styleId],
    )
})
