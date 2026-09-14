// Descarga los binarios externos que viajan con Tauri como externalBin:
// ffmpeg (render, concat de voz, medición de duración) y yt-dlp (BGM/overlay
// desde YouTube). Corre en beforeDevCommand y beforeBuildCommand, antes del
// sidecar: dev y producción usan los MISMOS binarios y el pipeline nunca
// depende del PATH (ADR-0010: la Fase 0 de descarga en runtime desaparece;
// decisiones registradas en ADR-0013).
//
// Las URLs y los SHA-256 van pineados: una release nueva se adopta cambiando
// estas constantes a mano, nunca «latest» (build reproducible). Hay un bloque
// de pins por target triple: macOS arm64 (ADR-0013), Windows x64 (ADR-0026) y
// macOS Intel (ADR-0034); un triple sin pins falla con un mensaje que dice qué
// agregar.
//
// Nota de licencia: el build estático de ffmpeg-static es GPL; la aspiración
// LGPL queda para la fase de distribución.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  executableSuffix,
  isMacosTriple,
  targetTriple,
} from './target-triple.mjs'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const binariesDir = join(repoRoot, 'src-tauri/binaries')

// yt-dlp_macos es un binario universal (arm64 + x86_64): los dos triples de
// macOS lo comparten con la misma URL y el mismo hash.
const MACOS_YT_DLP_PIN = {
  name: 'yt-dlp',
  url: 'https://github.com/yt-dlp/yt-dlp/releases/download/2026.08.19/yt-dlp_macos',
  sha256: '0f192b7ec147ab6288885d6351d9ab67367640029b4377576ef46dd79cf7b202',
}

// Un pin por binario y plataforma. Todas las plataformas comparten release de
// ffmpeg-static y de yt-dlp; el hash de yt-dlp se contrasta al pinear con el
// SHA2-256SUMS oficial de la release.
const BINARY_PINS = {
  'aarch64-apple-darwin': [
    {
      name: 'ffmpeg',
      url: 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-darwin-arm64',
      sha256:
        'a90e3db6a3fd35f6074b013f948b1aa45b31c6375489d39e572bea3f18336584',
    },
    MACOS_YT_DLP_PIN,
  ],
  'x86_64-apple-darwin': [
    {
      name: 'ffmpeg',
      url: 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-darwin-x64',
      sha256:
        'ebdddc936f61e14049a2d4b549a412b8a40deeff6540e58a9f2a2da9e6b18894',
    },
    MACOS_YT_DLP_PIN,
  ],
  'x86_64-pc-windows-msvc': [
    {
      name: 'ffmpeg',
      url: 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-win32-x64',
      sha256:
        '04e1307997530f9cf2fe35cba2ca7e8875ca91da02f89d6c7243df819c94ad00',
    },
    {
      name: 'yt-dlp',
      url: 'https://github.com/yt-dlp/yt-dlp/releases/download/2026.08.19/yt-dlp.exe',
      sha256:
        '66674953fe251b89f4d08c5f0e35e0728679bd67ab3d7d05c0562af101dd3e7a',
    },
  ],
}

async function fetchBinary(pin, triple) {
  const binaryPath = join(
    binariesDir,
    `${pin.name}-${triple}${executableSuffix(triple)}`,
  )
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
  // No-op en Windows: ahí la ejecutabilidad la da la extensión .exe.
  chmodSync(binaryPath, 0o755)
  if (isMacosTriple(triple)) {
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
      `(hoy ${Object.keys(BINARY_PINS).join(', ')}; ver ADR-0026).`,
  )
}

mkdirSync(binariesDir, { recursive: true })
for (const pin of pins) {
  await fetchBinary(pin, triple)
}
