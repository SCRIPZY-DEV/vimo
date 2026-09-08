// Constantes que comparten los dos motores ElevenLabs (vía DubVoice y
// directo). Viven aparte para que ningún provider importe a otro: el fallback
// entre ambos se declara por id y lo resuelve el registro (ADR-0024).
export const ELEVENLABS_API_BASE_URL = 'https://api.elevenlabs.io'

// Tamaño de página de los catálogos paginados server-side; espejado en
// src/modules/voices/constants.ts.
export const ELEVENLABS_PAGE_SIZE = 60

// Tope por llamada. DubVoice topa en ~5000; la API directa admite más en
// algunos modelos, pero se usa el mismo valor conservador en ambos carriles
// para que el troceo de la narración produzca las mismas partes.
export const ELEVENLABS_CHAR_LIMIT = 4500

export const ELEVENLABS_DEFAULT_MODEL = 'eleven_multilingual_v2'
