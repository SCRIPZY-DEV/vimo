// Los redactores que se ofrecen en Mi estilo (ADR-0044, actualizada el
// 2026-10-04). Con la revisión narrativa retirada, el dueño pidió volver a
// ofrecer redactores más baratos de los que había antes del recorte, además de
// los dos validados; después pidió ocultar Llama 4 Scout (el más flojo de la
// prueba). El juez anterior del revisor (DeepSeek V4 Pro) queda fuera del
// selector. Sin red.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DEFAULT_LLM_MODEL_ID,
  offeredModels,
  rescueModelFor,
  resolveVerbatimModel,
} from '../../pipeline/providers/llm/model-catalog.ts'

const CHEAPER_WRITERS = [
  'deepseek-ai/DeepSeek-V4-Flash',
  'openai/gpt-oss-120b-Turbo',
]
const family = (id) => id.split('/')[0].toLowerCase()

test('the selector offers the two validated writers and two cheaper ones again', () => {
  assert.deepEqual(
    offeredModels().map((model) => model.id),
    [
      'deepseek-ai/DeepSeek-V4.1-Flash',
      'deepseek-ai/DeepSeek-V4-Flash',
      'anthropic/claude-haiku-4-5',
      'openai/gpt-oss-120b-Turbo',
    ],
  )
  assert.equal(DEFAULT_LLM_MODEL_ID, 'deepseek-ai/DeepSeek-V4.1-Flash')
})

test('a project that chose one of the cheaper writers is written with it', () => {
  for (const id of CHEAPER_WRITERS) {
    const resolved = resolveVerbatimModel(id)
    assert.equal(resolved.profile.id, id)
    assert.equal(resolved.degradedFrom, undefined)
  }
})

test('the model of the retired reviewer and Llama 4 Scout stay out of the selector', () => {
  for (const hidden of [
    'deepseek-ai/DeepSeek-V4-Pro',
    'meta-llama/Llama-4-Scout-17B-16E-Instruct',
  ]) {
    assert.ok(!offeredModels().some((model) => model.id === hidden))
    assert.equal(resolveVerbatimModel(hidden).profile.id, DEFAULT_LLM_MODEL_ID)
  }
})

test('every offered writer is rescued by another family', () => {
  for (const model of offeredModels()) {
    const rescue = rescueModelFor(model.id)
    assert.ok(rescue, `${model.id} has a rescue`)
    assert.notEqual(family(rescue.id), family(model.id))
    assert.ok(rescue.inUi)
  }
})
