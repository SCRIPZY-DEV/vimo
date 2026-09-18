import { DiagnosticModule, SUBCOMMAND_MODULE_KEYWORDS } from '../constants'

export function resolveDiagnosticModule(
  subcommand: string | null,
): DiagnosticModule {
  if (subcommand === null) return DiagnosticModule.videos

  const match = SUBCOMMAND_MODULE_KEYWORDS.find(([keyword]) =>
    subcommand.includes(keyword),
  )
  if (match) return match[1]

  return DiagnosticModule.videos
}
