// A/B del VESTUARIO POR ESCENA con claves reales (la condición para encender
// VERBATIM_SCENE_WARDROBE). Corre la Fase 1 y la Fase 2 del carril verbatim
// contra DeepInfra —sin imágenes, sin proyecto— para una matriz de estilos ×
// guiones × modelos, con la constante apagada y encendida, y mide:
//
//   - marcador en los fragmentos que EXIGEN otra ropa (`demanding`), en %;
//   - marcador en los fragmentos neutros, en % (falsos positivos);
//   - marcadores descartados por traer algo que no es ropa;
//   - fichas incrustadas (E35) y escenas faltantes, para ver que no empeoran;
//   - fichas de Fase 1 que terminan con «Outfit:».
//
//   node scripts/ab-scene-wardrobe.mjs --matrix scripts/ab/scene-wardrobe.json
//        [--keys .harness-keys.json] [--repeats 3] [--out docs/handoff/.../ab-results.md]
//
// El JSON de la matriz: { "styles": [{ "name", "gem" }], "scripts": [{ "name",
// "fragments": [{ "text", "demanding": true|false }] }], "models": ["id", …] }.
// Gasta créditos de DeepInfra (tokens): cada celda es una Fase 1 + un lote.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolvePipelineConfig } from '../pipeline/config/pipeline-config.ts'
import { createVerbatimClient } from '../pipeline/providers/llm/verbatim-client.ts'
import { modelProfile } from '../pipeline/providers/llm/model-catalog.ts'
import { generateVerbatimPrompts } from '../pipeline/stages/scene-prompts/verbatim/verbatim-writer.ts'
import { splitOutfit } from '../pipeline/stages/scene-prompts/verbatim/subject-weaver.ts'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

function readFlag(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  if (index < 0 || index + 1 >= process.argv.length) return fallback
  return process.argv[index + 1]
}

const matrixFile = readFlag('matrix', null)
if (!matrixFile) {
  process.stdout.write(
    'uso: node scripts/ab-scene-wardrobe.mjs --matrix <json> [--keys <archivo>] [--repeats 3] [--out <md>]\n',
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

const client = createVerbatimClient({
  apiKey,
  baseUrl: resolvePipelineConfig().llm.baseUrl,
})
const MARKER = /\[subject\]\s*\((?:wearing|outfit|clothes|clothing)\s*:/i
const SHEET_IN_SCENE =
  /\bcharacter\s+(?:model|sheet|design|reference|turnaround)\b/i

async function runCell(style, script, modelId, sceneWardrobe) {
  const fragments = script.fragments.map((fragment, index) => ({
    n: index + 1,
    text: fragment.text,
  }))
  const fullScript = script.fragments.map((fragment) => fragment.text).join(' ')
  const logs = []
  // El escritor teje y quita el marcador: para medirlo se captura la
  // respuesta cruda del modelo antes de que la lea.
  const raw = new Map()
  const spy = {
    async call(request) {
      const response = await client.call(request)
      const isBatch = request.messages.at(-1).content.includes('FRAGMENTOS:')
      if (isBatch) raw.set(raw.size + 1, response.content)
      return response
    },
  }
  const result = await generateVerbatimPrompts(fragments, fullScript, {
    gem: style.gem,
    modelId,
    client: spy,
    sceneWardrobe,
    onLog: (message) => logs.push(message),
    onWarn: (message) => logs.push('warn: ' + message),
  })
  const rawText = [...raw.values()].join('\n')
  const perScene = new Map()
  for (const match of rawText.matchAll(
    /\(\((\d+)\)\)([\s\S]*?)(?=\(\(\d+\)\)|$)/g,
  ))
    perScene.set(Number(match[1]), match[2])
  const demanding = script.fragments.map((fragment, index) => ({
    n: index + 1,
    demanding: fragment.demanding,
  }))
  const markedDemanding = demanding.filter(
    ({ n, demanding: wanted }) => wanted && MARKER.test(perScene.get(n) ?? ''),
  ).length
  const markedNeutral = demanding.filter(
    ({ n, demanding: wanted }) => !wanted && MARKER.test(perScene.get(n) ?? ''),
  ).length
  const sheetsInScene = [...result.prompts.values()].filter((prompt) =>
    SHEET_IN_SCENE.test(prompt),
  ).length
  const rejected = logs.filter((line) => line.includes('discarded')).length
  const outfitSentence = logs.some((line) =>
    line.includes('separates its base outfit'),
  )
  return {
    demandingTotal: demanding.filter((entry) => entry.demanding).length,
    neutralTotal: demanding.filter((entry) => !entry.demanding).length,
    markedDemanding,
    markedNeutral,
    sheetsInScene,
    missing: result.missing.length,
    rejected,
    outfitSentence,
    prompts: [...result.prompts.entries()].sort((a, b) => a[0] - b[0]),
  }
}

const rows = []
const samples = []
for (const style of matrix.styles)
  for (const script of matrix.scripts)
    for (const modelId of matrix.models)
      for (const sceneWardrobe of [false, true])
        for (let repeat = 1; repeat <= repeats; repeat++) {
          const label = `${style.name} × ${script.name} × ${modelProfile(modelId).label} × ${sceneWardrobe ? 'on' : 'off'} #${repeat}`
          process.stderr.write(`${label}\n`)
          try {
            const cell = await runCell(style, script, modelId, sceneWardrobe)
            rows.push({
              style: style.name,
              script: script.name,
              model: modelId,
              sceneWardrobe,
              repeat,
              ...cell,
            })
            if (sceneWardrobe && repeat === 1)
              samples.push({ label, prompts: cell.prompts })
          } catch (error) {
            rows.push({
              style: style.name,
              script: script.name,
              model: modelId,
              sceneWardrobe,
              repeat,
              error: String(error),
            })
          }
        }

// Agregado por celda (estilo × guion × modelo × on/off), sumando repeticiones.
const groups = new Map()
for (const row of rows) {
  const key = [row.style, row.script, row.model, row.sceneWardrobe].join('|')
  const group = groups.get(key) ?? {
    style: row.style,
    script: row.script,
    model: row.model,
    sceneWardrobe: row.sceneWardrobe,
    runs: 0,
    errors: 0,
    demandingTotal: 0,
    markedDemanding: 0,
    neutralTotal: 0,
    markedNeutral: 0,
    sheetsInScene: 0,
    missing: 0,
    rejected: 0,
    outfitSentence: 0,
  }
  group.runs++
  if (row.error) group.errors++
  else {
    for (const field of [
      'demandingTotal',
      'markedDemanding',
      'neutralTotal',
      'markedNeutral',
      'sheetsInScene',
      'missing',
      'rejected',
    ])
      group[field] += row[field]
    if (row.outfitSentence) group.outfitSentence++
  }
  groups.set(key, group)
}
const percent = (part, total) =>
  total ? `${Math.round((100 * part) / total)}%` : '—'
const lines = [
  '# A/B vestuario por escena — resultados',
  '',
  `Fecha: ${new Date().toISOString().slice(0, 10)}. Repeticiones por celda: ${repeats}.`,
  '',
  '| Estilo | Guion | Modelo | Vestuario | Marcador en exigentes | Marcador en neutros | Descartados | Fichas incrustadas | Faltantes | Ficha con Outfit | Errores |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
]
for (const group of groups.values())
  lines.push(
    `| ${group.style} | ${group.script} | ${modelProfile(group.model).label} | ${group.sceneWardrobe ? 'on' : 'off'} | ${percent(group.markedDemanding, group.demandingTotal)} | ${percent(group.markedNeutral, group.neutralTotal)} | ${group.rejected} | ${group.sheetsInScene} | ${group.missing} | ${group.outfitSentence}/${group.runs - group.errors} | ${group.errors} |`,
  )
lines.push(
  '',
  '## Prompts de muestra (vestuario encendido, primera repetición)',
  '',
)
for (const sample of samples) {
  lines.push(`### ${sample.label}`, '')
  for (const [n, prompt] of sample.prompts) lines.push(`- **${n}.** ${prompt}`)
  lines.push('')
}
const report = lines.join('\n') + '\n'
if (outFile) writeFileSync(outFile, report)
process.stdout.write(report)
