// «Crear personaje con mi estilo» con una gema de plantilla (ADR-0048): la
// gema en uso viaja a design-style-character por secciones (el sidecar la pasa
// a texto sin su sección `character`) y una vieja como su texto, nunca las
// dos. Módulos puros de src/ corridos con Node (type stripping), sin bundler.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { styleDesignGemOf } from '../../src/modules/characters/utilities/styleDesignGem.ts'
import { styleContextGemOf } from '../../src/modules/videos/utilities/gemTemplate.ts'

const OLD_GEM = { systemPrompt: '  Acuarela editorial con tinta suelta.  ' }

const TEMPLATE_GEM = {
  systemPrompt: '',
  sections: {
    visualStyle: ' Acuarela editorial con tinta suelta. ',
    character: 'A tall woman with short gray hair. Outfit: a green raincoat.',
    camera: '   ',
  },
}

const CLEAN_SECTIONS = {
  visualStyle: 'Acuarela editorial con tinta suelta.',
  character: 'A tall woman with short gray hair. Outfit: a green raincoat.',
}

// El contexto que arma Crear o el modal del estilo para el selector.
function styleContext(gem) {
  return {
    styleId: 'st-1',
    script: 'Una historia corta para probar el diseño.',
    ...gem,
  }
}

test('una gema vieja viaja como su texto, sin secciones', () => {
  const gem = styleContextGemOf(OLD_GEM)
  assert.deepEqual(gem, { gem: OLD_GEM.systemPrompt })
  assert.equal('sections' in gem, false)
})

test('una gema de plantilla viaja por secciones limpias, sin texto', () => {
  const gem = styleContextGemOf(TEMPLATE_GEM)
  assert.deepEqual(gem, { sections: CLEAN_SECTIONS })
  assert.equal('gem' in gem, false)
})

test('el pedido lleva exactamente una de las dos', () => {
  assert.deepEqual(styleDesignGemOf(styleContext(styleContextGemOf(OLD_GEM))), {
    gem: 'Acuarela editorial con tinta suelta.',
  })
  assert.deepEqual(
    styleDesignGemOf(styleContext(styleContextGemOf(TEMPLATE_GEM))),
    { sections: CLEAN_SECTIONS },
  )
  // Un contexto con las dos no debería existir; si llega, van las secciones
  // (el sidecar rechaza las dos a la vez).
  const both = styleContext({
    gem: 'Acuarela.',
    sections: { visualStyle: 'Acuarela.' },
  })
  assert.deepEqual(styleDesignGemOf(both), {
    sections: { visualStyle: 'Acuarela.' },
  })
})

test('sin gema que diseñe, el modal usa el experto de la casa', () => {
  assert.equal(styleDesignGemOf(undefined), null)
  assert.equal(styleDesignGemOf(styleContext({})), null)
  assert.equal(styleDesignGemOf(styleContext({ gem: '   ' })), null)
  assert.equal(
    styleDesignGemOf(styleContext({ sections: { visualStyle: '  ' } })),
    null,
  )
})
