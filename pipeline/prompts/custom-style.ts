import { GLOBAL_RULES } from './visual-styles.ts'

// El systemPrompt del usuario define el ESTILO, pero no conoce el contrato de
// salida del pipeline (el JSON {"prompt_imagen": …} que espera
// prompt-extraction). Se le anexan los planos permitidos y las GLOBAL_RULES
// (CONTENT SAFETY + OUTPUT FORMAT) — mismo criterio que el carril Storytime
// del origen. El envío VERBATIM sin envoltorio es del carril verbatim (rama
// posterior del roadmap, ADR-0016).
export function buildCustomStyleSystemPrompt(style: {
  systemPrompt?: string
  shots?: string[]
}): string {
  const shots = (style.shots ?? []).filter(Boolean)
  const shotsBlock =
    shots.length > 0
      ? `\n\n# ALLOWED SHOTS (use ONLY these framings)\n${shots
          .map((shot) => `- ${shot}`)
          .join('\n')}`
      : ''

  return `${style.systemPrompt ?? ''}${shotsBlock}\n\n${GLOBAL_RULES}`
}
