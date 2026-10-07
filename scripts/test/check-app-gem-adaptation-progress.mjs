// El porcentaje de la tarjeta de una gema mientras se adapta (spec §4.4): el
// agente no informa avance, así que es una simulación por tiempo, como la de
// un clip de animación: en línea recta hasta el 85 % a los 30 s, después
// frenando hacia el 95 % sin llegar, y un 98 % fijo mientras se guardan las
// secciones. Nunca retrocede. Módulo puro de src/ corrido con Node (type
// stripping).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  GEM_ADAPTATION_CAP_PERCENT,
  GEM_ADAPTATION_EXPECTED_SECONDS,
  GEM_ADAPTATION_RAMP_PERCENT,
  GEM_ADAPTATION_SAVING_PERCENT,
  gemAdaptationPercent,
} from '../../src/modules/videos/utilities/gemAdaptationPercent.ts'

const STARTED_AT = 1_000_000
const agent = { startedAt: STARTED_AT, phase: 'agent' }
const after = (seconds) => STARTED_AT + seconds * 1000

test('los tiempos de la curva: 85 % a los 30 s, tope del 95 % y 98 % al guardar', () => {
  assert.equal(GEM_ADAPTATION_EXPECTED_SECONDS, 30)
  assert.equal(GEM_ADAPTATION_RAMP_PERCENT, 85)
  assert.equal(GEM_ADAPTATION_CAP_PERCENT, 95)
  assert.equal(GEM_ADAPTATION_SAVING_PERCENT, 98)
})

test('con el agente: arranca en 0, sube en línea recta y llega al 85 % a los 30 s', () => {
  assert.equal(gemAdaptationPercent(agent, after(0)), 0)
  assert.equal(gemAdaptationPercent(agent, after(15)), 43)
  assert.equal(gemAdaptationPercent(agent, after(30)), 85)
})

test('pasado el tiempo esperado se frena hacia el 95 % y no lo pasa', () => {
  assert.equal(gemAdaptationPercent(agent, after(60)), 91)
  assert.equal(gemAdaptationPercent(agent, after(600)), 95)
  assert.equal(gemAdaptationPercent(agent, after(36_000)), 95)
})

test('un reloj atrasado respecto del arranque da 0, no un negativo', () => {
  assert.equal(gemAdaptationPercent(agent, STARTED_AT - 5000), 0)
})

test('nunca retrocede mientras pasa el tiempo', () => {
  let previous = -1
  for (let seconds = 0; seconds <= 300; seconds += 1) {
    const percent = gemAdaptationPercent(agent, after(seconds))
    assert.ok(percent >= previous, `retrocedió a los ${seconds} s`)
    previous = percent
  }
})

test('guardando las secciones: un 98 % fijo, pase el tiempo que pase', () => {
  const saving = { startedAt: STARTED_AT, phase: 'saving' }
  assert.equal(gemAdaptationPercent(saving, after(0)), 98)
  assert.equal(gemAdaptationPercent(saving, after(600)), 98)
})
