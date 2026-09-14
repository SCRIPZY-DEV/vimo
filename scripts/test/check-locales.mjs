// Guard de los catálogos i18n: los tres idiomas deben declarar EXACTAMENTE
// las mismas claves. i18next no lo valida en build (una clave faltante se
// renderiza cruda o cae al fallback), así que hasta ahora la revisión era
// manual — este script la vuelve ejecutable.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const LOCALES = ['es', 'en', 'pt']
const REFERENCE = 'es'

function flatKeys(value, prefix = '') {
  return Object.entries(value).flatMap(([key, item]) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? flatKeys(item, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  )
}

function loadKeys(locale) {
  const path = join(repoRoot, 'public/locales', `${locale}.json`)
  return new Set(flatKeys(JSON.parse(readFileSync(path, 'utf8'))))
}

const reference = loadKeys(REFERENCE)
let failed = false

for (const locale of LOCALES.filter((item) => item !== REFERENCE)) {
  const keys = loadKeys(locale)
  const missing = [...reference].filter((key) => !keys.has(key))
  const extra = [...keys].filter((key) => !reference.has(key))

  if (missing.length > 0) {
    failed = true
    process.stdout.write(
      `${locale}.json: faltan ${missing.length} clave(s):\n  ${missing.join('\n  ')}\n`,
    )
  }
  if (extra.length > 0) {
    failed = true
    process.stdout.write(
      `${locale}.json: sobran ${extra.length} clave(s):\n  ${extra.join('\n  ')}\n`,
    )
  }
}

if (failed) process.exit(1)
process.stdout.write(
  `catálogos alineados: ${reference.size} claves en ${LOCALES.join(', ')}\n`,
)
