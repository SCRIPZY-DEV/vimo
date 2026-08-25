// Descarga los binarios externos que viajan con Tauri como externalBin:
// ffmpeg (render, concat de voz, medición de duración) y yt-dlp (BGM/overlay
// desde YouTube). Corre en beforeDevCommand y beforeBuildCommand, antes del
// sidecar: dev y producción usan los MISMOS binarios y el pipeline nunca
// depende del PATH (ADR-0010: la Fase 0 de descarga en runtime desaparece;
// decisiones registradas en ADR-0013).
//
// Las URLs y los SHA-256 van pineados: una release nueva se adopta cambiando
// estas constantes a mano, nunca «latest» (build reproducible). Por ahora solo
// aarch64-apple-darwin — el resto de plataformas llega con la fase de
// distribución (ADR-0013).
//
// Nota de licencia: el build estático de ffmpeg-static es GPL; la aspiración
// LGPL queda para la fase de distribución.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const binariesDir = join(repoRoot, 'src-tauri/binaries')

// Un pin por binario y plataforma. El hash de yt-dlp se contrasta al pinear
// con el SHA2-256SUMS oficial de la release.
const BINARY_PINS = {
  'aarch64-apple-darwin': [
    {
      name: 'ffmpeg',
      url: 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-darwin-arm64',
      sha256:
        'a90e3db6a3fd35f6074b013f948b1aa45b31c6375489d39e572bea3f18336584',
    },
    {
      name: 'yt-dlp',
      url: 'https://github.com/yt-dlp/yt-dlp/releases/download/2026.08.19/yt-dlp_macos',
      sha256:
        '0f192b7ec147ab6288885d6351d9ab67367640029b4377576ef46dd79cf7b202',
    },
  ],
}

function targetTriple() {
  // Tauri lo exporta en sus hooks de build; fuera de ellos, el host de rustc.
  if (process.env.TAURI_ENV_TARGET_TRIPLE) {
    return process.env.TAURI_ENV_TARGET_TRIPLE
  }
  const output = execFileSync('rustc', ['-Vv'], { encoding: 'utf8' })
  const match = output.match(/host: (\S+)/)
  if (!match)
    throw new Error('No se pudo determinar el target triple (rustc -Vv)')
  return match[1]
}

async function fetchBinary(pin, triple) {
  const binaryPath = join(binariesDir, `${pin.name}-${triple}`)
  // La firma ad-hoc modifica el binario en disco, así que su hash ya no
  // coincide con el del artefacto descargado. El marcador registra qué pin
  // quedó instalado: es lo que hace al script idempotente.
  const markerPath = `${binaryPath}.sha256`

  const alreadyInstalled =
    existsSync(binaryPath) &&
    existsSync(markerPath) &&
    readFileSync(markerPath, 'utf8').trim() === pin.sha256
  if (alreadyInstalled) {
    process.stdout.write(`${pin.name}: ya presente y verificado\n`)
    return
  }

  process.stdout.write(`${pin.name}: descargando ${pin.url}\n`)
  const response = await fetch(pin.url, { redirect: 'follow' })
  if (!response.ok) {
    throw new Error(`Descarga de ${pin.name} falló: HTTP ${response.status}`)
  }
  const bytes = Buffer.from(await response.arrayBuffer())

  const actualHash = createHash('sha256').update(bytes).digest('hex')
  if (actualHash !== pin.sha256) {
    throw new Error(
      `SHA-256 de ${pin.name} no coincide con el pin.\n` +
        `  esperado: ${pin.sha256}\n  obtenido: ${actualHash}`,
    )
  }

  await writeFile(binaryPath, bytes)
  chmodSync(binaryPath, 0o755)
  if (triple.includes('apple-darwin')) {
    // Firma ad-hoc; la firma real de distribución la aplica el bundling.
    execFileSync('codesign', ['--sign', '-', '--force', binaryPath])
  }
  await writeFile(markerPath, `${pin.sha256}\n`)
  process.stdout.write(`${pin.name}: listo en ${binaryPath}\n`)
}

const triple = targetTriple()
const pins = BINARY_PINS[triple]
if (!pins) {
  throw new Error(
    `Sin pins de binarios para ${triple}: agregalos a BINARY_PINS ` +
      '(por ahora solo aarch64-apple-darwin, ver ADR-0013).',
  )
}

mkdirSync(binariesDir, { recursive: true })
for (const pin of pins) {
  await fetchBinary(pin, triple)
}
