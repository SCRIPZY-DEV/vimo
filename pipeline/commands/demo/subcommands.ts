import type { SubcommandHandler } from '../../runner/subcommand.ts'
import { demoPrepare } from './demo-prepare.ts'
import { demoStatus } from './demo-status.ts'

// Subcomandos del modo demo (ADR-0029): el pack pre-hecho. La simulación no
// es un subcomando: vive dentro de run-video-pipeline (options.demo).
export const demoSubcommands: Record<string, SubcommandHandler> = {
  'demo-status': demoStatus,
  'demo-prepare': demoPrepare,
}
