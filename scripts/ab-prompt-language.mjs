// A/B del IDIOMA DE SALIDA con claves reales (la condición para dejar
// encendida VERBATIM_OUTPUT_LANGUAGE_RULE). Corre la Fase 2 del carril verbatim
// contra DeepInfra —sin imágenes, sin proyecto— para una matriz de estilos ×
// guiones × modelos, con la regla apagada y encendida, y mide:
//
//   - corridas aceptadas al PRIMER pedido (ningún lote rechazado por idioma);
//   - corridas cortadas por `llm_prompt_language` y pedidos por corrida (la
//     red de seguridad acota la variante que falla a dos pedidos);
//   - español que se COLÓ en prompts aceptados (densidad de palabras
//     funcionales españolas), para ver que la regla no relaja el filtro;
//   - la cola de estilo SIN traducir (cuando el estilo declara `tail`);
//   - faltantes y errores, para ver que nada empeora.
//
//   node scripts/ab-prompt-language.mjs --matrix scripts/ab/prompt-language.json
//        [--keys .harness-keys.json] [--repeats 3] [--variants off,on]
//        [--out docs/handoff/.../ab-results.md]
//
// El JSON de la matriz: { "styles": [{ "name", "gem", "character": { "mode" },
// "tail"? }], "scripts": [{ "name", "fragments": [{ "text" }] }],
// "models": ["id", …] }. Gasta créditos de DeepInfra (tokens): cada celda es
// como mucho dos lotes.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolvePipelineConfig } from '../pipeline/config/pipeline-config.ts'
import { createVerbatimClient } from '../pipeline/providers/llm/verbatim-client.ts'
import { modelProfile } from '../pipeline/providers/llm/model-catalog.ts'
import { PipelineFailure } from '../pipeline/runner/failure.ts'
import {
  generateVerbatimPrompts,
  LLM_PROMPT_LANGUAGE,
} from '../pipeline/stages/scene-prompts/verbatim/verbatim-writer.ts'
import { LANGUAGE_CONTAMINATION } from '../pipeline/stages/scene-prompts/verbatim/parser.ts'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

function readFlag(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  if (index < 0 || index + 1 >= process.argv.length) return fallback
  return process.argv[index + 1]
}

const matrixFile = readFlag('matrix', null)
if (!matrixFile) {
  process.stdout.write(
    'uso: node scripts/ab-prompt-language.mjs --matrix <json> [--keys <archivo>] [--repeats 3] [--variants off,on] [--out <md>]\n',
  )
  process.exit(1)
}
const matrix = JSON.parse(readFileSync(matrixFile, 'utf8'))
const keysFile = readFlag('keys', join(repoRoot, '.harness-keys.json'))
if (!existsSync(keysFile)) {
  process.stderr.write(`no keys file at ${keysFile}\n`)
  process.exit(1)
}
const apiKey = JSON.parse(readFileSync(keysFile, 'utf8')).deepinfra
if (!apiKey) {
  process.stderr.write('the keys file has no deepinfra key\n')
  process.exit(1)
}
const repeats = Number(readFlag('repeats', '3'))
const outFile = readFlag('out', null)
const variants = readFlag('variants', 'off,on')
  .split(',')
  .map((variant) => variant.trim() === 'on')

const client = createVerbatimClient({
  apiKey,
  baseUrl: resolvePipelineConfig().llm.baseUrl,
})

// Palabras funcionales que aparecen en cualquier frase en español y en
// ninguna en inglés (espejo invertido del filtro del parser). Por encima de
// este porcentaje de las palabras del prompt, el prompt está en español
// aunque al filtro se le haya colado por una palabra inglesa suelta.
const SPANISH_FUNCTION_WORDS =
  /\b(de|la|el|con|una|un|los|las|del|por|para|que|en|y)\b/gi
const SLIPPED_THRESHOLD = 0.15
function spanishDensity(prompt) {
  const words = prompt.split(/\s+/).filter(Boolean).length
  if (words === 0) return 0
  return (prompt.match(SPANISH_FUNCTION_WORDS)?.length ?? 0) / words
}

async function runCell(style, script, modelId, outputLanguageRule) {
  const fragments = script.fragments.map((fragment, index) => ({
    n: index + 1,
    text: fragment.text,
  }))
  const fullScript = script.fragments.map((fragment) => fragment.text).join(' ')
  const logs = []
  let requests = 0
  const spy = {
    async call(request) {
      if (request.messages.at(-1).content.includes('FRAGMENTOS:')) requests += 1
      return client.call(request)
    },
  }
  let result = null
  let failure = null
  try {
    result = await generateVerbatimPrompts(fragments, fullScript, {
      gem: style.gem,
      modelId,
      client: spy,
      character: style.character ?? { mode: 'none' },
      outputLanguageRule,
      onLog: (message) => logs.push(message),
      onWarn: (message) => logs.push('warn: ' + message),
    })
  } catch (error) {
    failure = error instanceof PipelineFailure ? error.code : String(error)
  }
  const languageRejections = logs.filter((line) =>
    line.includes(LANGUAGE_CONTAMINATION),
  ).length
  const prompts = result
    ? [...result.prompts.entries()].sort((a, b) => a[0] - b[0])
    : []
  const tail = style.tail?.toLowerCase()
  return {
    requests,
    firstAccepted: languageRejections === 0 && failure === null,
    languageStop: failure === LLM_PROMPT_LANGUAGE,
    otherFailure:
      failure !== null && failure !== LLM_PROMPT_LANGUAGE ? failure : null,
    written: prompts.length,
    missing: result ? result.missing.length : fragments.length,
    slipped: prompts.filter(
      ([, prompt]) => spanishDensity(prompt) > SLIPPED_THRESHOLD,
    ).length,
    untranslatedTail: tail
      ? prompts.filter(([, prompt]) => prompt.toLowerCase().includes(tail))
          .length
      : null,
    prompts,
  }
}

const rows = []
const samples = []
for (const style of matrix.styles)
  for (const script of matrix.scripts)
    for (const modelId of matrix.models)
      for (const outputLanguageRule of variants)
        for (let repeat = 1; repeat <= repeats; repeat++) {
          const label = `${style.name} × ${script.name} × ${modelProfile(modelId).label} × ${outputLanguageRule ? 'on' : 'off'} #${repeat}`
          process.stderr.write(`${label}\n`)
          try {
            const cell = await runCell(
              style,
              script,
              modelId,
              outputLanguageRule,
            )
            rows.push({
              style: style.name,
              script: script.name,
              model: modelId,
              outputLanguageRule,
              repeat,
              ...cell,
            })
            if (repeat === 1 && cell.prompts.length > 0)
              samples.push({ label, prompts: cell.prompts })
          } catch (error) {
            rows.push({
              style: style.name,
              script: script.name,
              model: modelId,
              outputLanguageRule,
              repeat,
              error: String(error),
            })
          }
        }

// Agregado por celda (estilo × guion × modelo × on/off), sumando repeticiones.
const groups = new Map()
for (const row of rows) {
  const key = [row.style, row.script, row.model, row.outputLanguageRule].join(
    '|',
  )
  const group = groups.get(key) ?? {
    style: row.style,
    script: row.script,
    model: row.model,
    outputLanguageRule: row.outputLanguageRule,
    runs: 0,
    errors: 0,
    firstAccepted: 0,
    languageStop: 0,
    otherFailure: 0,
    requests: 0,
    written: 0,
    missing: 0,
    slipped: 0,
    untranslatedTail: 0,
    hasTail: false,
  }
  group.runs++
  if (row.error) group.errors++
  else {
    if (row.firstAccepted) group.firstAccepted++
    if (row.languageStop) group.languageStop++
    if (row.otherFailure) group.otherFailure++
    group.requests += row.requests
    group.written += row.written
    group.missing += row.missing
    group.slipped += row.slipped
    if (row.untranslatedTail !== null) {
      group.hasTail = true
      group.untranslatedTail += row.untranslatedTail
    }
  }
  groups.set(key, group)
}
const percent = (part, total) =>
  total ? `${Math.round((100 * part) / total)}%` : '—'
const mean = (sum, count) => (count ? (sum / count).toFixed(1) : '—')
const lines = [
  '# A/B idioma de salida — resultados',
  '',
  `Fecha: ${new Date().toISOString().slice(0, 10)}. Repeticiones por celda: ${repeats}.`,
  '',
  '| Estilo | Guion | Modelo | Regla | Aceptado al 1.er pedido | Cortadas por idioma | Otro fallo | Pedidos (media) | Español colado / escritos | Cola sin traducir / escritos | Faltantes | Errores |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
]
for (const group of groups.values()) {
  const measured = group.runs - group.errors
  lines.push(
    `| ${group.style} | ${group.script} | ${modelProfile(group.model).label} | ${group.outputLanguageRule ? 'on' : 'off'} | ${percent(group.firstAccepted, measured)} | ${group.languageStop}/${measured} | ${group.otherFailure} | ${mean(group.requests, measured)} | ${group.slipped}/${group.written} | ${group.hasTail ? `${group.untranslatedTail}/${group.written}` : '—'} | ${group.missing} | ${group.errors} |`,
  )
}
lines.push('', '## Prompts de muestra (primera repetición de cada celda)', '')
for (const sample of samples) {
  lines.push(`### ${sample.label}`, '')
  for (const [n, prompt] of sample.prompts) lines.push(`- **${n}.** ${prompt}`)
  lines.push('')
}
const report = lines.join('\n') + '\n'
if (outFile) writeFileSync(outFile, report)
process.stdout.write(report)
