import { PipelineFailure } from '../../runner/failure.ts'
import type { TranscriptWord } from '../../types/scenes.ts'
import { rateLimitDelayMs } from '../../utils/http-retry.ts'
import { sleep } from '../../utils/sleep.ts'

// Transcripción palabra-a-palabra con Deepgram (port del provider del origen;
// la transcripción local quedó fuera de alcance en ADR-0010). El body es el
// mp3 binario completo; audios largos tardan minutos, de ahí el techo de
// 10 minutos.
const DEEPGRAM_URL =
  'https://api.deepgram.com/v1/listen?model=nova-2&detect_language=true'
const REQUEST_TIMEOUT_MS = 600_000
const RATE_LIMIT_MAX_RETRIES = 3

interface DeepgramResponse {
  results?: {
    channels?: {
      alternatives?: { words?: TranscriptWord[] }[]
    }[]
  }
}

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
    )

  return words.map((word) => ({
    word: word.word,
    start: word.start,
    end: word.end,
  }))
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
      )
    }

    if (response.ok) return response

    if (response.status === 401 || response.status === 403)
      throw new PipelineFailure(
        'transcription_invalid_api_key',
        `Deepgram rejected the API key (HTTP ${response.status})`,
      )

    const detail = (await response.text().catch(() => '')).slice(0, 200)

    if (response.status === 429) {
      if (attempt === RATE_LIMIT_MAX_RETRIES)
        throw new PipelineFailure(
          'transcription_rate_limited',
          `Deepgram rate limit persisted after ${RATE_LIMIT_MAX_RETRIES} retries`,
        )
      await sleep(rateLimitDelayMs(response, detail, attempt), signal)
      signal?.throwIfAborted()
      continue
    }

    throw new PipelineFailure(
      'transcription_failed',
      `Deepgram HTTP ${response.status}: ${detail}`,
    )
  }
}
