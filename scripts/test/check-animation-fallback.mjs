// El respaldo de las animaciones de Kie (ADR-0042, enmienda del 2026-10-05):
// el primer intento va con Grok y, si Kie confirma que la generación falló, el
// segundo va directo con Seedance. Lo que no es un fallo del modelo (saldo,
// cola, moderación, envío incierto) no abre el respaldo. Corre la regla real
// del carril (`nextModel`) con Node, sin red ni FFmpeg.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  MAX_GENERATION_ATTEMPTS,
  nextModel,
} from '../../pipeline/animation/lane.ts'
import {
  KIE_GROK_MODEL,
  KIE_SEEDANCE_MODEL,
} from '../../pipeline/providers/video/kie.ts'

const KIE = { provider: { id: 'kie' } }

// Un intento ya cerrado como fallido, con el código que deja el carril.
function failed(model, errorCode = 'animation_provider_error') {
  return { model, hash: 'hash', taskId: 'task', state: 'failed', errorCode }
}

test('the first attempt goes to Grok', () => {
  assert.equal(nextModel([], KIE), KIE_GROK_MODEL)
})

test('one confirmed Grok generation failure goes straight to Seedance', () => {
  assert.equal(nextModel([failed(KIE_GROK_MODEL)], KIE), KIE_SEEDANCE_MODEL)
})

test('a Seedance failure ends the budget: two attempts in total', () => {
  const attempts = []
  for (;;) {
    const model = nextModel(attempts, KIE)
    if (!model) break
    attempts.push(failed(model))
  }
  assert.deepEqual(
    attempts.map((attempt) => attempt.model),
    [KIE_GROK_MODEL, KIE_SEEDANCE_MODEL],
  )
  // El avance dice «intento N de MAX»: tiene que ser el mismo presupuesto.
  assert.equal(MAX_GENERATION_ATTEMPTS, attempts.length)
})

test('a project saved with two Grok failures resumes with Seedance', () => {
  const attempts = [failed(KIE_GROK_MODEL), failed(KIE_GROK_MODEL)]
  assert.equal(nextModel(attempts, KIE), KIE_SEEDANCE_MODEL)
})

test('a failure that is not the model never opens the fallback', () => {
  for (const errorCode of [
    'animation_timeout',
    'animation_content_policy',
    'animation_submission_unknown',
    'animation_invalid_api_key',
  ])
    assert.equal(
      nextModel([failed(KIE_GROK_MODEL, errorCode)], KIE),
      null,
      errorCode,
    )
})

test('a task that died for lack of credits does not count as a Grok failure', () => {
  const attempts = [failed(KIE_GROK_MODEL, 'animation_insufficient_credits')]
  assert.equal(nextModel(attempts, KIE), KIE_GROK_MODEL)
})

test('only Kie has a fallback model', () => {
  assert.equal(nextModel([], { provider: { id: 'poyo' } }), null)
})
