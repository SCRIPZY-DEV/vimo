// El módulo del borrador de Crear (spec §9, desde la entrega 2b):
// `src/modules/videos/utilities/createDraft.ts` corrido con Node y type
// stripping, sin bundler. Prueba solo su API: al cargar no hay borrador;
// escribir y leer devuelve la MISMA referencia (es el estado de Crear, que
// nunca se muta: no se copia en cada tecla); el último borrador escrito
// manda; descartar deja `null`, también dos veces; y un módulo recién
// cargado —un reinicio de la app— arranca sin borrador: vive en memoria, no
// en disco ni en un global. Cuándo lo siembra, lo escribe y lo descarta Crear
// (salir y volver, la demo, los pre-chequeos, «Crear otro», la
// autonavegación al editor, lo que solo siembra Ajustes) vive en
// `Create.tsx` y lo fija check-create-draft-ui.mjs, que monta la vista
// entera en Chrome.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  clearCreateDraft,
  readCreateDraft,
  writeCreateDraft,
} from '../../src/modules/videos/utilities/createDraft.ts'

// El módulo no mira la forma del formulario: alcanza con un par de campos.
const FORM = { name: 'Mi video', script: 'Hola', videoFormat: '16:9' }
const CATALOG_STYLE = {
  styleId: 'catalog-noir',
  catalogStyleId: 'noir',
  name: 'Noir',
  systemPrompt: '',
  shots: [],
}

test('al cargar la app no hay borrador', () => {
  assert.equal(readCreateDraft(), null)
})

test('escribir y leer devuelve el mismo borrador, sin copiarlo', () => {
  const draft = { form: FORM, otherTabStyle: CATALOG_STYLE }
  writeCreateDraft(draft)

  const read = readCreateDraft()
  assert.equal(
    read,
    draft,
    'la misma referencia: el estado de Crear no se muta',
  )
  assert.equal(read.form, FORM)
  assert.equal(read.otherTabStyle, CATALOG_STYLE)
  assert.equal(readCreateDraft(), read, 'leer dos veces no cambia nada')
})

test('el último borrador escrito manda', () => {
  const first = { form: { ...FORM, name: 'Uno' }, otherTabStyle: null }
  const second = {
    form: { ...first.form, name: 'Dos' },
    otherTabStyle: CATALOG_STYLE,
  }
  writeCreateDraft(first)
  writeCreateDraft(second)

  assert.equal(readCreateDraft(), second)
  assert.equal(first.form.name, 'Uno', 'escribir no toca el borrador anterior')
})

test('descartar deja null, también dos veces', () => {
  writeCreateDraft({ form: FORM, otherTabStyle: CATALOG_STYLE })
  clearCreateDraft()

  assert.equal(readCreateDraft(), null)
  clearCreateDraft()
  assert.equal(readCreateDraft(), null, 'descartar dos veces no rompe nada')
})

test('vive en memoria del módulo: un reinicio de la app lo descarta', async () => {
  const kept = {
    form: { ...FORM, name: 'Antes de reiniciar' },
    otherTabStyle: null,
  }
  writeCreateDraft(kept)

  // Otra instancia del módulo es lo que ve la app después de reiniciar: si
  // el borrador viviera en disco o en un global, la vería.
  const restarted =
    await import('../../src/modules/videos/utilities/createDraft.ts?reinicio')
  assert.equal(restarted.readCreateDraft(), null)
  assert.equal(readCreateDraft(), kept, 'la instancia en uso conserva el suyo')
})
