export const DIAGNOSTIC_LOGS_TABLE = 'diagnostic_logs'

// Evento Tauri con el que Rust avisa que hay un registro nuevo en el spool.
// Espejo de LOG_READY_EVENT en src-tauri/src/diagnostics/report.rs.
export const DIAGNOSTIC_LOG_READY_EVENT = 'diagnostic-log-ready'

// Postgres unique_violation: el registro ya se había subido (id = jobId).
export const DUPLICATE_ROW_ERROR_CODE = '23505'

export const diagnosticsMutationKeys = {
  upload: ['diagnostics', 'upload'],
} as const

export const DiagnosticModule = {
  videos: 'videos',
  voices: 'voices',
  characters: 'characters',
  avatars: 'avatars',
  music: 'music',
  styles: 'styles',
  demo: 'demo',
  settings: 'settings',
} as const

export type DiagnosticModule =
  (typeof DiagnosticModule)[keyof typeof DiagnosticModule]

// Palabra del subcomando → módulo dueño, en orden de prioridad: gana la
// primera que aparece (`set-project-music` es de videos, no de música;
// `design-style-character` es de estilos). Sin coincidencia es de videos.
export const SUBCOMMAND_MODULE_KEYWORDS = [
  ['project', DiagnosticModule.videos],
  ['demo', DiagnosticModule.demo],
  ['install-update', DiagnosticModule.settings],
  ['style', DiagnosticModule.styles],
  ['list-prompt-models', DiagnosticModule.styles],
  ['avatar', DiagnosticModule.avatars],
  ['character', DiagnosticModule.characters],
  ['music', DiagnosticModule.music],
  ['voice', DiagnosticModule.voices],
] as const
