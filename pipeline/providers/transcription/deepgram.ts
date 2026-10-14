import { PipelineFailure } from '../../runner/failure.ts'
import { isInsufficientCreditsResponse } from '../../utils/insufficient-credits.ts'
import type { TranscriptWord } from '../../types/scenes.ts'
import { rateLimitDelayMs } from '../../utils/http-retry.ts'
import { sleep } from '../../utils/sleep.ts'

// Transcripción palabra-a-palabra con Deepgram (port del provider del origen;
// la transcripción local quedó fuera de alcance en ADR-0010). El body es el
// mp3 binario completo; audios largos tardan minutos, de ahí el techo de
// 10 minutos.
//
// `punctuate=true` (gratis) suma `punctuated_word` a cada palabra: de ahí sale
// la marca de fin de frase (`sentenceEnd`) que usan las frases del avatar.
const DEEPGRAM_URL =
  'https://api.deepgram.com/v1/listen?model=nova-2&detect_language=true&punctuate=true'
const REQUEST_TIMEOUT_MS = 600_000
const RATE_LIMIT_MAX_RETRIES = 3
// Id del proveedor en los fallos (ADR-0038).
const FAILURE_PROVIDER = 'deepgram'

// Una palabra de la respuesta: `punctuated_word` llega con `punctuate=true`.
interface DeepgramWord {
  word: string
  start: number
  end: number
  punctuated_word?: string
}

interface DeepgramResponse {
  results?: {
    channels?: {
      alternatives?: { words?: DeepgramWord[] }[]
    }[]
  }
}

// La palabra puntuada cierra una frase si termina en punto, signo de pregunta
// o de exclamación, o puntos suspensivos, aunque después venga un cierre de
// comillas o de paréntesis («dijo."», «sí.)»). Incluye los terminadores del
// japonés y el chino (。！？ y el 。 de ancho medio ｡), que no llevan un espacio
// detrás, con sus cierres (「…。」, （…。）): sin ellos una narración en ja o zh
// nunca traería la marca y caería al modo por pausas sin aviso. Una
// abreviatura («Sr.») también cierra: en una narración transcripta es rara y
// solo suma una frontera de frase posible.
const SENTENCE_END_PATTERN = /[.?!…。！？｡]["'”’»)\]」』）】]*$/u

export async function transcribeWithDeepgram(
  audioBytes: Buffer,
  apiKey: string,
  signal?: AbortSignal,
): Promise<TranscriptWord[]> {
  const response = await requestTranscription(audioBytes, apiKey, signal)

  // Null-checks en cascada: si Deepgram cambia el shape o el audio era
  // inválido, un mensaje accionable en vez de un TypeError opaco.
  const data = (await response.json()) as DeepgramResponse
  const words = data.results?.channels?.[0]?.alternatives?.[0]?.words
  if (!Array.isArray(words) || words.length === 0)
    throw new PipelineFailure(
      'transcription_empty',
      'Deepgram returned no words — empty or corrupt audio?',
      { provider: FAILURE_PROVIDER, httpStatus: response.status },
    )

  return words.map(toTranscriptWord)
}

// Lo que guarda words.json: `word`, `start` y `end` tal cual, y `sentenceEnd`
// solo en la palabra que cierra una frase (nunca `false`).
function toTranscriptWord(word: DeepgramWord): TranscriptWord {
  const transcript: TranscriptWord = {
    word: word.word,
    start: word.start,
    end: word.end,
  }
  if (
    typeof word.punctuated_word === 'string' &&
    SENTENCE_END_PATTERN.test(word.punctuated_word)
  )
    transcript.sentenceEnd = true

  return transcript
}

// Un 429 acá no cuesta créditos (Deepgram cobra por minuto transcripto, no
// por request rechazada) y el audio ya está en disco: reintentar es gratis.
async function requestTranscription(
  audioBytes: Buffer,
  apiKey: string,
  signal: AbortSignal | undefined,
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)

    let response: Response
    try {
      response = await fetch(DEEPGRAM_URL, {
        method: 'POST',
        headers: {
          Authorization: `Token ${apiKey}`,
          'Content-Type': 'audio/mpeg',
        },
        body: new Uint8Array(audioBytes),
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      })
    } catch (error) {
      // Cancelación pedida ≠ error de red.
      if (signal?.aborted) throw error
      throw new PipelineFailure(
        'transcription_network',
        `Deepgram request failed: ${error instanceof Error ? error.message : String(error)}`,
        { provider: FAILURE_PROVIDER },
      )
    }

    if (response.ok) return response

    const detail = (await response.text().catch(() => '')).slice(0, 200)

    // Saldo agotado antes que la clave (ADR-0031).
    if (isInsufficientCreditsResponse(response.status, detail))
      throw new PipelineFailure(
        'transcription_insufficient_credits',
        `Deepgram rejected the request for insufficient balance (HTTP ${response.status}): ${detail}`,
        { provider: FAILURE_PROVIDER, httpStatus: response.status },
      )

    if (response.status === 401 || response.status === 403)
      throw new PipelineFailure(
        'transcription_invalid_api_key',
        `Deepgram rejected the API key (HTTP ${response.status})`,
        { provider: FAILURE_PROVIDER, httpStatus: response.status },
      )

    if (response.status === 429) {
      if (attempt === RATE_LIMIT_MAX_RETRIES)
        throw new PipelineFailure(
          'transcription_rate_limited',
          `Deepgram rate limit persisted after ${RATE_LIMIT_MAX_RETRIES} retries`,
          { provider: FAILURE_PROVIDER, httpStatus: response.status },
        )
      await sleep(rateLimitDelayMs(response, detail, attempt), signal)
      signal?.throwIfAborted()
      continue
    }

    throw new PipelineFailure(
      'transcription_failed',
      `Deepgram HTTP ${response.status}: ${detail}`,
      { provider: FAILURE_PROVIDER, httpStatus: response.status },
    )
  }
}
