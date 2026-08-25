import { MAX_PROMPT_CHARS } from '../../prompts/prompt-limits.ts'

// Extracción del prompt de imagen desde la respuesta cruda del LLM (port del
// extractor tolerante del parser del origen). Los modos de falla reales que
// cubre: ejemplos del system prompt eco-fechados antes de la respuesta,
// claves renombradas, comillas internas sin escapar (texto-en-imagen citado),
// respuestas en prosa y placeholders/rechazos que parecerían prompts.

// Claves alternativas donde el LLM mete el prompt cuando no respeta el
// esquema `prompt_imagen` (DeepInfra lo hace seguido pese al modo JSON).
const PROMPT_KEYS = [
  'prompt_imagen',
  'prompt',
  'image_prompt',
  'imageprompt',
  'prompt_image',
] as const

// "Basura" que NO debe usarse como prompt aunque tenga largo y letras:
// placeholders sin llenar, esquema/instrucción filtrada, rechazos o charla
// del modelo, o una URL suelta. Si pasara, el generador DIBUJARÍA ese texto.
export function isGarbagePrompt(text: string): boolean {
  const lowered = text.trim().toLowerCase()
  if (!lowered) return true
  if (/^<[^>]*>$/.test(lowered)) return true
  if (
    /the full image prompt|following the template|insert (the )?prompt|your prompt here|<\s*the\s+full|prompt_imagen"?\s*:|the narrator (may|might|mentions|could)/.test(
      lowered,
    )
  )
    return true
  if (
    /your request is not clear|could you (please )?(provide|give|clarify)|i need more (details|information|context)|i'?m happy to help|i can'?t (help|assist|create|generate)|i cannot (help|assist|create|generate)|as an ai\b|i'?m sorry/.test(
      lowered,
    )
  )
    return true
  if (/^https?:\/\/\S+$/.test(lowered)) return true
  return false
}

// Todos los bloques {...} balanceados top-level, respetando strings/escapes.
// (indexOf/lastIndexOf fallaba cuando el modelo echaba ejemplos antes de su
// respuesta real: el slice abarcaba varios objetos.)
function balancedJsonObjects(text: string): string[] {
  const blocks: string[] = []
  let depth = 0
  let start = -1
  let inString = false
  let escaped = false

  for (let index = 0; index < text.length; index++) {
    const character = text[index]
    if (inString) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') inString = false
      continue
    }
    if (character === '"') {
      inString = true
      continue
    }
    if (character === '{') {
      if (depth === 0) start = index
      depth++
    } else if (character === '}') {
      depth--
      if (depth === 0 && start >= 0) {
        blocks.push(text.slice(start, index + 1))
        start = -1
      } else if (depth < 0) {
        depth = 0
      }
    }
  }
  return blocks
}

// Primer valor string usable entre las claves conocidas de un JSON parseado.
function promptValueFromJson(json: unknown): string {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return ''
  const record = json as Record<string, unknown>
  for (const key of Object.keys(record)) {
    if (!(PROMPT_KEYS as readonly string[]).includes(key.toLowerCase()))
      continue
    const value = record[key]
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed.length > 0 && !isGarbagePrompt(trimmed)) return trimmed
    }
  }
  return ''
}

// Extractor TOLERANTE de `prompt_imagen`: recupera el valor por regex aunque
// el JSON sea inválido por comillas internas sin escapar (típico cuando el
// guion pide texto-en-imagen citado).
export function lenientPromptExtract(cleaned: string): string {
  let match = cleaned.match(/"prompt_imagen"\s*:\s*"([\s\S]*)"\s*\}/)
  if (!match) match = cleaned.match(/"prompt_imagen"\s*:\s*"([\s\S]+)/)
  if (!match) return ''

  let value = match[1]
  // El regex greedy puede tragarse claves JSON siguientes: si aparece un
  // cierre de string seguido de otra clave, el prompt real termina antes.
  const nextKeyIndex = value.search(/"\s*,\s*"[a-zA-Z_][\w]*"\s*:/)
  if (nextKeyIndex >= 0) value = value.slice(0, nextKeyIndex)

  return value
    .replace(/\\"/g, '"')
    .replace(/\\n/g, ' ')
    .replace(/\\t/g, ' ')
    .replace(/\\r/g, ' ')
    .replace(/\\\\/g, '\\')
    .replace(/"\s*\}?\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Rescata un prompt de una respuesta en PROSA (sin JSON): quita el preámbulo
// charlatán y las comillas, y se queda con el primer bloque.
export function salvagePromptFromProse(text: string): string {
  let result = text.trim()
  result = result.replace(
    /^\s*(sure[,!.]?\s*)?(here'?s?(\s+is)?\s+)?(the\s+)?(image\s+)?prompt(\s+is)?\s*[:-]\s*/i,
    '',
  )
  result = result.replace(
    /^\s*(the|this)\s+image\s+(shows|depicts|is of|contains)\s*/i,
    '',
  )
  result = result
    .replace(/^["'`*]+/, '')
    .replace(/["'`*]+\s*$/, '')
    .trim()
  result = result
    .split(/\n\s*\n|\n(?=\s*(note|translation|traducci[oó]n)\s*:)/i)[0]
    .trim()
  return result
}

// Punto de entrada: prompt de imagen desde la respuesta cruda, o "".
export function extractImagePrompt(content: string): string {
  let imagePrompt = ''

  // Strip de TODOS los fences markdown (manteniendo el contenido interno).
  const cleaned = content
    .replace(/```(?:json|jsonc)?\s*\n?/gi, '')
    .replace(/```/g, '')
    .trim()

  const blocks = balancedJsonObjects(cleaned)
  const candidates =
    blocks.length > 0
      ? blocks
      : (() => {
          const firstBrace = cleaned.indexOf('{')
          const lastBrace = cleaned.lastIndexOf('}')
          return firstBrace >= 0 && lastBrace > firstBrace
            ? [cleaned.slice(firstBrace, lastBrace + 1)]
            : []
        })()

  // Si varios bloques califican, ganan los posteriores (suelen ser la
  // respuesta real del modelo, no el ejemplo eco-fechado).
  for (const candidate of candidates) {
    try {
      const value = promptValueFromJson(JSON.parse(candidate))
      if (value) imagePrompt = value
    } catch {
      // Probar el siguiente candidato.
    }
  }

  // Recuperación tolerante (comillas internas sin escapar).
  if (!imagePrompt) {
    const lenient = lenientPromptExtract(cleaned)
    if (lenient.length >= 30 && !isGarbagePrompt(lenient)) imagePrompt = lenient
  }

  // Último rescate: el modelo contestó en PROSA sin ningún JSON. Solo cuando
  // no hubo candidatos, para no pisar el caso {"image":"url"} (que
  // correctamente cae al fallback).
  if (!imagePrompt && candidates.length === 0) {
    const prose = salvagePromptFromProse(cleaned)
    if (prose.length >= 30 && !isGarbagePrompt(prose)) imagePrompt = prose
  }

  return imagePrompt.length > MAX_PROMPT_CHARS
    ? imagePrompt.slice(0, MAX_PROMPT_CHARS)
    : imagePrompt
}

// Normaliza la respuesta del rescate en TEXTO PLANO a un prompt usable:
// fences, JSON si el modelo lo devolvió igual, comillas envolventes y
// prefijos de charla.
export function cleanPlainTextPrompt(content: string): string {
  let result = (content || '').trim()
  result = result
    .replace(/```(?:json|jsonc|text|markdown)?\s*\n?/gi, '')
    .replace(/```/g, '')
    .trim()

  if (result.startsWith('{') || result.startsWith('[')) {
    const fromJson = extractImagePrompt(result)
    if (fromJson.trim()) return fromJson.trim()
  }

  result = result.replace(/^"([\s\S]*)"$/, '$1').trim()
  result = result
    .replace(/^(?:final\s+)?(?:image\s+)?prompt\s*:\s*/i, '')
    .trim()
  return result
}
