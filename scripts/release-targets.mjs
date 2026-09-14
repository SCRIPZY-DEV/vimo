// Fuente única de los targets de release de escritorio (ADR-0034). Cada
// entrada describe un instalador: en qué runner se compila, con qué triple y
// bundles, cómo se llama su artefacto y qué archivos van al updater
// (latest.json) y al hosting. La leen build-desktop.yml (matriz del job
// `build`) y build-update-manifest.mjs: agregar una plataforma es agregar una
// entrada acá, nunca un job suelto en el workflow.
//
// Cada target se compila en un runner de su misma arquitectura: el sidecar SEA
// copia el Node del host (scripts/build-sidecar.mjs lo verifica).
//
//   node scripts/release-targets.mjs matrix --select <all|familia|id>
//
// Imprime `matrix=<json>` listo para agregar a $GITHUB_OUTPUT.
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const ALL_TARGETS = 'all'

export const RELEASE_TARGETS = [
  {
    id: 'windows-x64',
    family: 'windows',
    runner: 'windows-latest',
    triple: 'x86_64-pc-windows-msvc',
    bundles: 'nsis',
    artifact: 'Vimo-windows-x64',
    // Relativos a bundleDirectory(triple).
    outputs: ['nsis/*.exe', 'nsis/*.exe.sig'],
    updater: {
      platform: 'windows-x86_64',
      find: (name) => name.endsWith('-setup.exe'),
      publishedName: (version) => `Vimo_${version}_x64-setup.exe`,
    },
    extras: [],
  },
  {
    id: 'macos-arm64',
    family: 'macos',
    runner: 'macos-latest',
    triple: 'aarch64-apple-darwin',
    // `app` es obligatorio junto a `dmg`: el Vimo.app.tar.gz del updater solo
    // se genera para los targets compatibles (app, nsis, msi, appimage). Con
    // `dmg` solo, la .app se arma para el DMG pero el tar.gz no aparece.
    bundles: 'app,dmg',
    artifact: 'Vimo-macos-arm64',
    outputs: ['dmg/*.dmg', 'macos/*.app.tar.gz', 'macos/*.app.tar.gz.sig'],
    updater: {
      platform: 'darwin-aarch64',
      find: (name) => name.endsWith('.app.tar.gz'),
      publishedName: (version) => `Vimo_${version}_aarch64.app.tar.gz`,
    },
    extras: [
      {
        find: (name) => name.endsWith('.dmg'),
        publishedName: (version) => `Vimo_${version}_aarch64.dmg`,
      },
    ],
  },
  {
    id: 'macos-x64',
    family: 'macos',
    // Última imagen Intel de GitHub: se retira en agosto de 2027. Antes hay que
    // migrar a cross-compilar desde Apple Silicon (ver ADR-0034).
    runner: 'macos-15-intel',
    triple: 'x86_64-apple-darwin',
    bundles: 'app,dmg',
    artifact: 'Vimo-macos-x64',
    outputs: ['dmg/*.dmg', 'macos/*.app.tar.gz', 'macos/*.app.tar.gz.sig'],
    updater: {
      platform: 'darwin-x86_64',
      find: (name) => name.endsWith('.app.tar.gz'),
      publishedName: (version) => `Vimo_${version}_x64.app.tar.gz`,
    },
    extras: [
      {
        find: (name) => name.endsWith('.dmg'),
        publishedName: (version) => `Vimo_${version}_x64.dmg`,
      },
    ],
  },
]

// El workflow pasa siempre `--target`, así que Tauri deja el bundle bajo el
// triple incluso cuando coincide con el host.
export function bundleDirectory(triple) {
  return `src-tauri/target/${triple}/release/bundle`
}

export function validSelections() {
  const families = new Set(RELEASE_TARGETS.map((target) => target.family))
  return [
    ALL_TARGETS,
    ...families,
    ...RELEASE_TARGETS.map((target) => target.id),
  ]
}

// Acepta `all`, una familia (`macos`) o el id de un target (`macos-x64`).
export function selectTargets(selection) {
  if (selection === ALL_TARGETS) return RELEASE_TARGETS

  const selected = RELEASE_TARGETS.filter(
    (target) => target.id === selection || target.family === selection,
  )
  if (selected.length === 0) {
    throw new Error(
      `selección desconocida «${selection}»; válidas: ${validSelections().join(', ')}`,
    )
  }
  return selected
}

function toMatrixEntry(target) {
  const directory = bundleDirectory(target.triple)
  return {
    os: target.runner,
    target: target.triple,
    bundles: target.bundles,
    artifact: target.artifact,
    path: target.outputs.map((output) => `${directory}/${output}`).join('\n'),
  }
}

function runCli() {
  const { positionals, values: options } = parseArgs({
    allowPositionals: true,
    options: { select: { type: 'string', default: ALL_TARGETS } },
  })

  if (positionals[0] !== 'matrix') {
    console.error(
      'release-targets: uso: node scripts/release-targets.mjs matrix --select <all|familia|id>',
    )
    process.exit(1)
  }

  try {
    const include = selectTargets(options.select).map(toMatrixEntry)
    process.stdout.write(`matrix=${JSON.stringify({ include })}\n`)
  } catch (error) {
    console.error(`release-targets: ${error.message}`)
    process.exit(1)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) runCli()
