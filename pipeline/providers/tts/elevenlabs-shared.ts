// Constantes que comparten los dos motores ElevenLabs (vía DubVoice y
// directo). Viven aparte para que ningún provider importe a otro: el fallback
// entre ambos se declara por id y lo resuelve el registro (ADR-0024). El tope
// por llamada NO es compartido: cada carril trocea a su tamaño (ADR-0025).
export const ELEVENLABS_API_BASE_URL = 'https://api.elevenlabs.io'

// Tamaño de página de los catálogos paginados server-side (los motores de
// DubVoice v1 y la biblioteca pública de ElevenLabs); espejado en
// src/modules/voices/constants.ts.
export const CATALOG_PAGE_SIZE = 60

export const ELEVENLABS_DEFAULT_MODEL = 'eleven_multilingual_v2'
