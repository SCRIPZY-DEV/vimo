// Target triple del build actual y sus derivados, compartido por los scripts
// de build (fetch-binaries, build-sidecar, run-pipeline-harness). Tauri lo
// exporta en sus hooks beforeDevCommand/beforeBuildCommand; fuera de ellos se
// toma del host de rustc (ADR-0026).
import { execFileSync } from 'node:child_process'

export function targetTriple() {
  if (process.env.TAURI_ENV_TARGET_TRIPLE) {
    return process.env.TAURI_ENV_TARGET_TRIPLE
  }
  const output = execFileSync('rustc', ['-Vv'], { encoding: 'utf8' })
  const match = output.match(/host: (\S+)/)
  if (!match)
    throw new Error('No se pudo determinar el target triple (rustc -Vv)')
  return match[1]
}

export function isWindowsTriple(triple) {
  return triple.includes('windows')
}

export function isMacosTriple(triple) {
  return triple.includes('apple-darwin')
}

// Tauri espera `<nombre>-<triple>.exe` en Windows y `<nombre>-<triple>` en el
// resto de plataformas para los externalBin.
export function executableSuffix(triple) {
  return isWindowsTriple(triple) ? '.exe' : ''
}
